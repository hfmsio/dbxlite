import type {
  CloudConnector,
  ConnectionConfig,
  QueryOptions,
  QueryChunk,
  Schema,
  TableInfo,
  ColumnInfo,
  CatalogInfo,
  SchemaInfo,
  TableMetadata,
  QueryCostEstimate,
  ConnectionTestResult
} from './base'
import { type CredentialStoreLike, EncryptionManager } from '@ide/storage'
import { createLogger } from './logger'

const logger = createLogger('BigQuery')

// OAuth token types
interface OAuthToken {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  obtained_at?: number;
  token_type?: string;
  scope?: string;
}

// BigQuery API response types
interface BigQueryField {
  name: string;
  type: string;
  mode?: string;
  description?: string;
  fields?: BigQueryField[];  // For STRUCT and ARRAY element types
}

interface BigQuerySchema {
  fields: BigQueryField[];
}

interface BigQueryRowValue {
  v: unknown;
}

interface BigQueryRow {
  f: BigQueryRowValue[];
}

// PKCE helpers + metadata cache live in connector-utils so the
// Snowflake connector reuses the same implementations.
import { base64url, sha256, MetadataCache, WorkerParsePool } from './connector-utils'
import {
  parseBigQueryRows,
  type BigQueryRowLite,
  type BigQuerySchemaLite,
} from './bigquery-parse-shared'

/**
 * Enhanced BigQuery connector with full catalog discovery and query optimization
 */
export class BigQueryConnector implements CloudConnector {
  readonly id = 'bigquery'
  private token: OAuthToken | null = null
  /**
   * In-flight refresh promise. Coalesces concurrent refresh attempts so we
   * don't fire multiple parallel `/token` calls — Google rotates refresh
   * tokens infrequently but rate-limits this endpoint, and parallel refresh
   * is wasteful even when it doesn't fail.
   */
  private refreshPromise: Promise<OAuthToken> | null = null
  private credsKey = 'bigquery-token'
  private defaultProjectKey = 'bigquery-default-project'
  private cache = new MetadataCache()
  // Lazily-created Web Worker for row-typing pages off the main thread.
  // Falls back to main-thread parsing if Worker construction fails.
  private parserPool: WorkerParsePool<
    { type: 'parseRows'; rows: BigQueryRowLite[]; schema: BigQuerySchemaLite },
    { id: string; rows: Record<string, unknown>[] }
  > | null = null
  private activeJobs = new Map<string, string>() // queryId -> jobId mapping
  private defaultProject: string | null = null

  constructor(
    private creds: CredentialStoreLike,
    private clientId: string,
    private clientSecret?: string
  ) {
    if (!clientId) throw new Error('clientId required for BigQueryConnector')
    // Load default project from storage
    this.loadDefaultProject()
  }

  /**
   * Load default project from credential store
   */
  private async loadDefaultProject(): Promise<void> {
    try {
      this.defaultProject = await this.creds.load(this.defaultProjectKey)
    } catch (error) {
      logger.warn('Failed to load default project', error)
    }
  }

  /**
   * Set and persist default project (public for settings UI)
   */
  async setDefaultProject(projectId: string): Promise<void> {
    this.defaultProject = projectId
    await this.creds.save(this.defaultProjectKey, projectId)
    logger.info('Default project set', { projectId })
  }

  /**
   * Get current default project
   */
  async getDefaultProject(): Promise<string | null> {
    if (!this.defaultProject) {
      await this.loadDefaultProject()
    }
    return this.defaultProject
  }

  /**
   * Connect to BigQuery using OAuth 2.0 with PKCE
   */
  async connect(config: ConnectionConfig): Promise<void> {
    const redirectUri = config.options.redirectUri || window.location.origin + '/oauth-callback'
    const codeVerifier = Array.from(crypto.getRandomValues(new Uint8Array(64)))
      .map(n => ('0' + n.toString(16)).slice(-2))
      .join('')
    const challengeBuf = await sha256(codeVerifier)
    const codeChallenge = base64url(challengeBuf)
    // Use crypto-strong randomness for OAuth state (CSRF protection).
    // Math.random() is predictable; matches snowflake-connector's
    // crypto.randomUUID() pattern.
    const state = crypto.randomUUID()

    // Request appropriate scopes for all APIs
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: [
        'https://www.googleapis.com/auth/bigquery',
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/cloud-platform.read-only',
        'https://www.googleapis.com/auth/cloudplatformprojects.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
        'openid'
      ].join(' '),
      access_type: 'offline',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'consent'
    })

    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString()
    const w = window.open(url, 'oauth', 'width=600,height=700')
    if (!w) {
      throw new Error('Failed to open OAuth popup. Please allow popups and try again.')
    }

    // Clear any previous OAuth data
    try {
      localStorage.removeItem('bigquery_oauth_response')
      localStorage.removeItem('bigquery_oauth_error')
    } catch {
      // localStorage unavailable in some test envs
    }

    // Wait for the OAuth callback to deliver a code via any of:
    //   1. postMessage from the popup (preferred when window.opener survives)
    //   2. storage event (fires synchronously when callback writes localStorage
    //      from another document — works across the cross-origin redirect)
    //   3. localStorage poll (covers browser quirks where storage events drop)
    //
    // We deliberately do NOT poll `popup.closed` to detect cancellation:
    // under Cross-Origin-Opener-Policy: same-origin (set by the dev server
    // for DuckDB threading), the parent's popup reference becomes a
    // browsing-context-less Window once the popup navigates cross-origin —
    // `popup.closed` then reports `true` even while Google's consent screen
    // is still live, producing false-positive "cancelled by user" rejects.
    //
    // 5-minute hard ceiling bounds the wait. If the user genuinely
    // X's the popup, they'll see the timeout error after 5 minutes — the
    // trade-off vs unreliable cancel detection.
    const code = await new Promise<string>((resolve, reject) => {
      let resolved = false

      const settle = (codeOrError: { code: string } | { error: string }) => {
        if (resolved) return
        resolved = true
        cleanup()
        try { w.close() } catch { /* may already be gone */ }
        if ('error' in codeOrError) {
          reject(new Error(codeOrError.error))
        } else {
          resolve(codeOrError.code)
        }
      }

      const checkLocalStorage = (): boolean => {
        let oauthError: string | null = null
        let oauthResponse: string | null = null
        try {
          oauthError = localStorage.getItem('bigquery_oauth_error')
          oauthResponse = localStorage.getItem('bigquery_oauth_response')
        } catch {
          return false
        }
        if (oauthError) {
          try { localStorage.removeItem('bigquery_oauth_error') } catch {}
          settle({ error: `OAuth failed: ${oauthError}` })
          return true
        }
        if (oauthResponse) {
          try {
            const data = JSON.parse(oauthResponse)
            if (data.state === state) {
              try { localStorage.removeItem('bigquery_oauth_response') } catch {}
              settle({ code: data.code })
              return true
            }
          } catch (e) {
            logger.error('Error parsing OAuth response from localStorage', e)
          }
        }
        return false
      }

      const handleMessage = (ev: MessageEvent) => {
        if (ev.origin !== window.location.origin) return
        const data = ev.data
        if (data && data.type === 'oauth_code' && data.state === state) {
          settle({ code: data.code })
        } else if (data && data.type === 'oauth_error') {
          settle({ error: `OAuth error: ${data.error}` })
        }
      }

      const handleStorage = (ev: StorageEvent) => {
        if (ev.key === 'bigquery_oauth_response' || ev.key === 'bigquery_oauth_error') {
          checkLocalStorage()
        }
      }

      const cleanup = () => {
        clearTimeout(timeout)
        clearInterval(pollInterval)
        window.removeEventListener('message', handleMessage)
        window.removeEventListener('storage', handleStorage)
      }

      window.addEventListener('message', handleMessage)
      window.addEventListener('storage', handleStorage)

      const timeout = setTimeout(() => {
        settle({ error: 'OAuth timeout — no response after 5 minutes. Try again.' })
      }, 300000)

      // Belt-and-suspenders 500ms localStorage poll for browsers where the
      // `storage` event drops or fires unreliably.
      const pollInterval = setInterval(() => {
        if (resolved) return
        checkLocalStorage()
      }, 500)

      // Initial check in case the callback already wrote before listeners attached.
      checkLocalStorage()
    })

    // Exchange code for tokens
    logger.debug('Exchanging code for token', {
      client_id: this.clientId.substring(0, 20) + '...',
      redirect_uri: redirectUri,
      has_code: !!code,
      has_verifier: !!codeVerifier
    })

    const tokenParams: Record<string, string> = {
      client_id: this.clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    }

    // Add client secret if provided (required for Web application type)
    if (this.clientSecret) {
      tokenParams.client_secret = this.clientSecret
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenParams)
    })

    if (!tokenRes.ok) {
      const errorBody = await tokenRes.text()
      logger.error('Token exchange failed', {
        status: tokenRes.status,
        statusText: tokenRes.statusText,
        body: errorBody
      })

      let errorMessage = `Failed to exchange code for token: ${tokenRes.statusText}`
      try {
        const errorJson = JSON.parse(errorBody)
        if (errorJson.error_description) {
          errorMessage = errorJson.error_description
        } else if (errorJson.error) {
          errorMessage = errorJson.error
        }
      } catch (e) {
        // Not JSON, use the raw body if available
        if (errorBody) errorMessage = errorBody
      }

      throw new Error(errorMessage)
    }

    const tokenJson = await tokenRes.json()
    tokenJson.obtained_at = Date.now()
    this.token = tokenJson
    await this.creds.save(this.credsKey, tokenJson)

    // Clear cache on new connection
    this.cache.clear()
  }

  /**
   * Load stored token from credential store
   */
  private async loadToken(): Promise<OAuthToken | null> {
    if (this.token) return this.token
    const stored = await this.creds.load(this.credsKey)
    if (stored) {
      this.token = stored as OAuthToken
    }
    return this.token
  }

  /**
   * Ensure token is fresh, refresh if needed.
   * Concurrent calls share a single in-flight refresh via refreshPromise.
   */
  private async ensureFreshToken(): Promise<OAuthToken> {
    const tk = await this.loadToken()
    if (!tk) throw new Error('Not authenticated. Please connect first.')

    const expiresIn = tk.expires_in || 3600
    const expiresAt = (tk.obtained_at || 0) + (expiresIn * 1000) - 30000 // 30 second buffer

    if (Date.now() < expiresAt) return tk

    if (!tk.refresh_token) {
      throw new Error('No refresh token available. Please reconnect.')
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshTokenInternal(tk).finally(() => {
        this.refreshPromise = null
      })
    }
    return this.refreshPromise
  }

  /** Actual refresh roundtrip; only called from ensureFreshToken's coalescer. */
  private async refreshTokenInternal(tk: OAuthToken): Promise<OAuthToken> {
    const refreshParams: Record<string, string> = {
      client_id: this.clientId,
      grant_type: 'refresh_token',
      refresh_token: tk.refresh_token!
    }

    // Add client secret if provided (required for Web application type)
    if (this.clientSecret) {
      refreshParams.client_secret = this.clientSecret
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(refreshParams)
    })

    if (!res.ok) {
      throw new Error(`Failed to refresh token: ${res.statusText}`)
    }

    const j = await res.json()
    const merged = {
      ...tk,
      ...j,
      obtained_at: Date.now(),
      refresh_token: tk.refresh_token || j.refresh_token
    }
    this.token = merged
    await this.creds.save(this.credsKey, merged)
    return merged
  }

  /**
   * Make authenticated API request with error handling and retry
   */
  private async apiRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const tk = await this.ensureFreshToken()

    const headers = {
      'Authorization': `Bearer ${tk.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }

    const response = await fetch(url, {
      ...options,
      headers
    })

    if (!response.ok && response.status === 401) {
      // Token might be expired despite our checks, force refresh
      this.token = null
      const newToken = await this.ensureFreshToken()

      // Retry with new token
      const retryResponse = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          'Authorization': `Bearer ${newToken.access_token}`
        }
      })

      if (!retryResponse.ok) {
        await this.handleBigQueryError(retryResponse)
      }

      return retryResponse
    }

    if (!response.ok) {
      await this.handleBigQueryError(response)
    }

    return response
  }

  /**
   * Handle BigQuery API errors with user-friendly messages
   */
  private async handleBigQueryError(response: Response): Promise<never> {
    let errorMessage = `BigQuery API error: ${response.status} ${response.statusText}`

    try {
      const errorJson = await response.json() as {
        error?: {
          message?: string;
          errors?: Array<{message: string}>;
        }
      }
      if (errorJson.error) {
        if (errorJson.error.message) {
          errorMessage = errorJson.error.message
        } else if (errorJson.error.errors && errorJson.error.errors.length > 0) {
          errorMessage = errorJson.error.errors.map((e) => e.message).join(', ')
        }

        // Add specific guidance for common errors
        if (response.status === 403) {
          errorMessage += '\n\nPlease ensure you have the necessary permissions in your Google Cloud project.'
        } else if (response.status === 429) {
          errorMessage += '\n\nRate limit exceeded. Please wait a moment and try again.'
        } else if (response.status === 400 && errorMessage.includes('budget')) {
          errorMessage += '\n\nYou may have exceeded your BigQuery quota or budget.'
        }
      }
    } catch (e) {
      // If we can't parse the error, use the default message
    }

    throw new Error(errorMessage)
  }

  /**
   * List available Google Cloud projects
   */
  async listProjects(): Promise<CatalogInfo[]> {
    // Check cache first
    const cached = this.cache.get<CatalogInfo[]>('projects')
    if (cached) return cached

    try {
      // Use Cloud Resource Manager API to list projects
      logger.debug('Fetching projects from Cloud Resource Manager API')
      const response = await this.apiRequest(
        'https://cloudresourcemanager.googleapis.com/v1/projects?filter=lifecycleState:ACTIVE'
      )

      const data = await response.json() as {
        projects?: Array<{
          projectId: string;
          name?: string;
          projectNumber?: string;
        }>;
      }
      logger.debug('Projects response', { projectCount: data.projects?.length || 0 })

      const projects: CatalogInfo[] = (data.projects || []).map((project) => ({
        id: project.projectId,
        name: project.name || project.projectId,
        type: 'project' as const,
        description: project.projectNumber ? `Project #${project.projectNumber}` : undefined
      }))

      if (projects.length === 0) {
        logger.warn('No projects found. This could mean: 1) You have no Google Cloud projects, 2) Cloud Resource Manager API is not enabled, 3) Your account lacks permission to list projects. Attempting fallback to use BigQuery API directly...')

        // Try to get project from token or use a direct BigQuery API call
        await this.loadToken()

        // Try listing datasets without specifying a project to see if we can discover the project
        try {
          // This is a workaround - try to use the project from the OAuth app
          const bqResponse = await this.apiRequest(
            'https://bigquery.googleapis.com/bigquery/v2/projects'
          )
          const bqData = await bqResponse.json() as {
            projects?: Array<{
              id?: string;
              friendlyName?: string;
              projectReference?: {projectId: string};
            }>;
          }
          logger.debug('Projects from BigQuery API', bqData)

          if (bqData.projects && bqData.projects.length > 0) {
            const bqProjects: CatalogInfo[] = bqData.projects.map((p) => ({
              id: p.id || p.projectReference?.projectId || '',
              name: p.friendlyName || p.id || p.projectReference?.projectId || '',
              type: 'project' as const
            }))

            // Save first project as default
            if (bqProjects.length > 0 && !this.defaultProject) {
              await this.setDefaultProject(bqProjects[0].id)
              logger.info('Set default project', { project: bqProjects[0].id })
            }

            this.cache.set('projects', bqProjects)
            return bqProjects
          }
        } catch (bqError) {
          logger.error('Failed to list projects via BigQuery API', bqError)
        }
      } else {
        // Save first project as default if we don't have one
        if (projects.length > 0 && !this.defaultProject) {
          await this.setDefaultProject(projects[0].id)
          logger.info('Set default project', { project: projects[0].id })
        }
      }

      this.cache.set('projects', projects)
      return projects
    } catch (error) {
      logger.error('Failed to list projects', error)
      // Re-throw authentication errors so UI can show appropriate message
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes('refresh token') || errorMessage.includes('token') || errorMessage.includes('401') || errorMessage.includes('403')) {
        throw error
      }
      // Return empty array for other errors - let the UI show "No projects found"
      return []
    }
  }

  /**
   * List datasets in a project
   */
  async listDatasets(projectId: string): Promise<SchemaInfo[]> {
    const cacheKey = `datasets:${projectId}`
    const cached = this.cache.get<SchemaInfo[]>(cacheKey)
    if (cached) return cached

    const response = await this.apiRequest(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/datasets`
    )

    const data = await response.json() as {
      datasets?: Array<{
        datasetReference: {datasetId: string};
        friendlyName?: string;
        location?: string;
      }>;
    }

    const datasets: SchemaInfo[] = (data.datasets || []).map((dataset) => ({
      id: dataset.datasetReference.datasetId,
      name: dataset.datasetReference.datasetId,
      catalog: projectId,
      description: dataset.friendlyName,
      location: dataset.location
    }))

    this.cache.set(cacheKey, datasets)
    return datasets
  }

  /**
   * List tables in a dataset
   */
  async listTables(projectId: string, datasetId: string): Promise<TableMetadata[]> {
    const cacheKey = `tables:${projectId}:${datasetId}`
    const cached = this.cache.get<TableMetadata[]>(cacheKey)
    if (cached) return cached

    const response = await this.apiRequest(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetId)}/tables`
    )

    const data = await response.json() as {
      tables?: Array<{
        tableReference: {tableId: string};
        type?: string;
        numRows?: string;
        numBytes?: string;
        creationTime?: string;
        lastModifiedTime?: string;
        friendlyName?: string;
        labels?: Record<string, string>;
      }>;
    }

    const tables: TableMetadata[] = (data.tables || []).map((table) => ({
      id: table.tableReference.tableId,
      name: table.tableReference.tableId,
      catalog: projectId,
      schema: datasetId,
      type: table.type?.toLowerCase() || 'table',
      rowCount: table.numRows ? parseInt(table.numRows) : undefined,
      sizeBytes: table.numBytes ? parseInt(table.numBytes) : undefined,
      created: table.creationTime ? new Date(parseInt(table.creationTime)) : undefined,
      modified: table.lastModifiedTime ? new Date(parseInt(table.lastModifiedTime)) : undefined,
      description: table.friendlyName,
      labels: table.labels
    }))

    this.cache.set(cacheKey, tables)
    return tables
  }

  /**
   * Get detailed metadata for a specific table
   */
  async getTableMetadata(projectId: string, datasetId: string, tableId: string): Promise<TableMetadata> {
    const cacheKey = `table:${projectId}:${datasetId}:${tableId}`
    const cached = this.cache.get<TableMetadata>(cacheKey)
    if (cached) return cached

    const response = await this.apiRequest(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetId)}/tables/${encodeURIComponent(tableId)}`
    )

    const table = await response.json() as {
      tableReference: {tableId: string};
      type?: string;
      schema?: {fields: BigQueryField[]};
      numRows?: string;
      numBytes?: string;
      creationTime?: string;
      lastModifiedTime?: string;
      description?: string;
      friendlyName?: string;
      labels?: Record<string, string>;
    }

    // Convert BigQuery schema to our ColumnInfo format
    const columns: ColumnInfo[] = (table.schema?.fields || []).map((field) => ({
      name: field.name,
      type: field.type,
      nullable: field.mode !== 'REQUIRED',
      comment: field.description
    }))

    const metadata: TableMetadata = {
      id: table.tableReference.tableId,
      name: table.tableReference.tableId,
      catalog: projectId,
      schema: datasetId,
      type: table.type?.toLowerCase() || 'table',
      columns,
      rowCount: table.numRows ? parseInt(table.numRows) : undefined,
      sizeBytes: table.numBytes ? parseInt(table.numBytes) : undefined,
      created: table.creationTime ? new Date(parseInt(table.creationTime)) : undefined,
      modified: table.lastModifiedTime ? new Date(parseInt(table.lastModifiedTime)) : undefined,
      description: table.description || table.friendlyName,
      labels: table.labels
    }

    this.cache.set(cacheKey, metadata)
    return metadata
  }

  /**
   * Get complete schema for a project
   */
  async getSchema(projectId?: string): Promise<Schema> {
    await this.loadToken()
    // Prioritize: explicit projectId > defaultProject (never use token's project_id - it's the OAuth app)
    let project = projectId
    if (!project) {
      if (!this.defaultProject) await this.loadDefaultProject()
      project = this.defaultProject
    }

    if (!project) {
      logger.warn('No project available for getSchema')
      return { tables: [] }
    }

    try {
      const datasets = await this.listDatasets(project)
      const tables: TableInfo[] = []

      // Fetch tables for each dataset
      for (const dataset of datasets) {
        try {
          const datasetTables = await this.listTables(project, dataset.id)

          for (const table of datasetTables) {
            // Get full table metadata including columns
            const fullMetadata = await this.getTableMetadata(project, dataset.id, table.id)
            tables.push({
              name: table.name,
              schema: dataset.id,
              type: table.type,
              columns: fullMetadata.columns
            })
          }
        } catch (e) {
          logger.error(`Failed to fetch tables for dataset ${dataset.id}`, e)
        }
      }

      return {
        tables,
        database: project
      }
    } catch (error) {
      logger.error('Failed to get schema', error)
      return { tables: [] }
    }
  }

  /**
   * Estimate query cost using dry run
   */
  async estimateQueryCost(sql: string, projectId?: string): Promise<QueryCostEstimate> {
    await this.ensureFreshToken()
    // Prioritize: explicit projectId > defaultProject (never use token's project_id - it's the OAuth app)
    let project = projectId
    if (!project) {
      if (!this.defaultProject) await this.loadDefaultProject()
      project = this.defaultProject
    }
    if (!project) {
      throw new Error('No billing project available. Run a query with explicit project first.')
    }

    const response = await this.apiRequest(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(project)}/queries`,
      {
        method: 'POST',
        body: JSON.stringify({
          query: sql,
          useLegacySql: false,
          dryRun: true // This is the key flag for cost estimation
        })
      }
    )

    const result = await response.json()

    const bytesProcessed = parseInt(result.totalBytesProcessed || '0')
    const bytesInTB = bytesProcessed / (1024 ** 4)
    // BigQuery pricing: $6.25 per TB (first 10TB per month)
    const estimatedCost = bytesInTB * 6.25

    return {
      estimatedBytes: bytesProcessed,
      estimatedCostUSD: estimatedCost,
      cachingPossible: result.cacheHit || false
    }
  }

  /**
   * Test connection to BigQuery
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now()

    try {
      await this.ensureFreshToken()
      // Use defaultProject only (never use token's project_id - it's the OAuth app)
      if (!this.defaultProject) await this.loadDefaultProject()
      const project = this.defaultProject

      if (!project) {
        return {
          success: false,
          latency: Date.now() - startTime,
          error: 'No billing project set. Run a query with explicit project first (e.g., SELECT * FROM `project.dataset.table`)'
        }
      }

      // Simple query that should always work
      const response = await this.apiRequest(
        `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(project)}/queries`,
        {
          method: 'POST',
          body: JSON.stringify({
            query: 'SELECT 1 as test',
            useLegacySql: false
          })
        }
      )

      if (response.ok) {
        const data = await response.json()
        const latencyMs = Date.now() - startTime

        // Try to get user info for metadata
        let userEmail = undefined
        try {
          const userResponse = await this.apiRequest(
            'https://www.googleapis.com/oauth2/v2/userinfo'
          )
          const userInfo = await userResponse.json()
          userEmail = userInfo.email
        } catch (e) {
          // User info is optional
        }

        return {
          success: true,
          latencyMs,
          metadata: {
            project: project,
            user: userEmail,
            jobId: data.jobReference?.jobId
          }
        }
      } else {
        return {
          success: false,
          error: `Connection test failed: ${response.statusText}`,
          latencyMs: Date.now() - startTime
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
        latencyMs: Date.now() - startTime
      }
    }
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.token !== null
  }

  /**
   * Initialize connector from stored credentials.
   * Call this after construction to load token into memory so isConnected() returns true.
   * @returns true if token was loaded successfully, false if no token found
   */
  async initializeFromStorage(): Promise<boolean> {
    const token = await this.loadToken()
    return token !== null
  }

  /**
   * Execute SQL query with pagination support
   */
  async *query(sql: string, opts?: QueryOptions): AsyncGenerator<QueryChunk> {
    const signal = opts?.signal
    if (signal?.aborted) {
      throw new DOMException('Query aborted before start', 'AbortError')
    }
    await this.ensureFreshToken()

    // Determine project ID with priority:
    // 1. Explicit opts.projectId
    // 2. User's default project (from browsing BigQuery)
    // 3. Extract from SQL query
    // 4. Token's project_id (may be OAuth app's project - less reliable)
    let project = opts?.projectId

    if (!project) {
      // Check user's default project first
      if (!this.defaultProject) {
        await this.loadDefaultProject()
      }
      if (this.defaultProject) {
        project = this.defaultProject
        logger.debug('Using default project', { project })
      }
    }

    if (!project) {
      // Try to extract from SQL: `project_id.dataset.table`
      const projectMatch = sql.match(/FROM\s+`([a-zA-Z0-9_-]+)\./i)
      if (projectMatch) {
        project = projectMatch[1]
        logger.debug('Extracted project ID from query', { project })
        // Save as default for future queries without explicit project
        if (!this.defaultProject) {
          await this.setDefaultProject(project)
          logger.debug('Saved extracted project as default', { project })
        }
      }
    }

    if (!project) {
      // Don't use token's project_id - it's likely the OAuth app's project, not the user's
      // Instead, throw a helpful error
      throw new Error(
        'No billing project available. Please run a query that references a table first ' +
        '(e.g., SELECT * FROM `your-project.dataset.table`) to set your default project, ' +
        'or browse BigQuery projects in the explorer.'
      )
    }

    const maxRows = opts?.maxRows || 10000
    const timeout = opts?.timeout || 60000 // Default 60 second timeout

    // Start the query
    const queryResponse = await this.apiRequest(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(project)}/queries`,
      {
        method: 'POST',
        body: JSON.stringify({
          query: sql,
          useLegacySql: false,
          maxResults: Math.min(maxRows, 10000), // BigQuery max per page is 10000
          timeoutMs: timeout
        }),
        signal,
      }
    )

    const initialData = await queryResponse.json()

    logger.debug('Initial response', {
      jobComplete: initialData.jobComplete,
      hasRows: !!initialData.rows,
      rowsLength: initialData.rows?.length,
      hasSchema: !!initialData.schema,
      hasPageToken: !!initialData.pageToken,
      jobId: initialData.jobReference?.jobId
    })

    // Job location must accompany every follow-up call — the REST API
    // requires it for jobs outside the US/EU multi-regions (a job in
    // asia-northeast1 404s on getQueryResults/cancel without it).
    const jobLocation: string | undefined = initialData.jobReference?.location
    const jobId: string | undefined = initialData.jobReference?.jobId

    // Cancel the SERVER job on abort. Previously cancel() was keyed by an
    // internal id no caller ever received, so Stop Query only aborted the
    // fetch while the BigQuery job kept running and billing. `once` so the
    // listener is auto-removed with the (per-query) signal.
    if (jobId && signal) {
      signal.addEventListener(
        'abort',
        () => { this.cancelJob(jobId, project, jobLocation).catch(() => {}) },
        { once: true },
      )
    }

    // If job is not complete OR rows are missing, POLL getQueryResults until
    // the job finishes. Each call long-polls server-side (timeoutMs), so this
    // is one HTTP round-trip every ~10s, not a busy loop. Without the loop, a
    // query slower than the initial timeout returned an empty result that
    // looked like a successful 0-row query — while the job kept running and
    // billing server-side.
    if ((!initialData.jobComplete || !initialData.rows) && initialData.jobReference) {
      logger.debug('Polling getQueryResults until job completes', {
        jobComplete: initialData.jobComplete,
        hasRows: !!initialData.rows,
        location: jobLocation,
      })
      let resultsData: typeof initialData
      for (;;) {
        const params = new URLSearchParams({
          maxResults: Math.min(maxRows, 10000).toString(),
          timeoutMs: '10000',
        })
        if (jobLocation) params.set('location', jobLocation)
        const resultsResponse = await this.apiRequest(
          `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(project)}/queries/${encodeURIComponent(initialData.jobReference.jobId)}?${params}`,
          { signal }
        )
        resultsData = await resultsResponse.json()
        if (resultsData.jobComplete) break
        if (signal?.aborted) {
          const err = new Error('Query aborted by user')
          err.name = 'AbortError'
          throw err
        }
        logger.debug('Job still running; polling again', {
          jobId: initialData.jobReference.jobId,
        })
      }
      logger.debug('Results fetched', {
        jobComplete: resultsData.jobComplete,
        hasRows: !!resultsData.rows,
        rowsLength: resultsData.rows?.length,
        totalRows: resultsData.totalRows,
      })

      // Merge results data with initial data (preserve schema from initial response)
      initialData.rows = resultsData.rows
      initialData.pageToken = resultsData.pageToken
      initialData.totalRows = resultsData.totalRows
      initialData.jobComplete = resultsData.jobComplete

      // Use schema from results if not in initial response
      if (!initialData.schema && resultsData.schema) {
        initialData.schema = resultsData.schema
      }
    }

    // Extract schema from the first response
    let schema: Schema | undefined
    if (initialData.schema?.fields) {
      const columns = initialData.schema.fields.map((field: BigQueryField) => ({
        name: field.name,
        // For REPEATED mode (arrays), encode as ARRAY<type> so formatters know it's an array
        type: field.mode === 'REPEATED' ? `ARRAY<${field.type}>` : field.type,
        nullable: field.mode !== 'REQUIRED',
        comment: field.description
      }))

      schema = {
        tables: [{
          name: 'query_result',
          columns
        }]
      }
    }

    // Parse and yield first batch of rows. parseRowsAsync routes large
    // batches to a Web Worker (≥2000 rows; postMessage overhead would
    // dominate below that) so the main thread stays free for UI updates.
    const rows = await this.parseRowsAsync(initialData.rows || [], initialData.schema)
    logger.debug('First batch', {
      rowCount: rows.length,
      hasPageToken: !!initialData.pageToken,
      initialDataRows: initialData.rows?.length
    })

    yield {
      rows,
      done: !initialData.pageToken,
      schema,
      totalRows: initialData.totalRows ? parseInt(initialData.totalRows) : undefined,
      connectorQueryId: initialData.jobReference?.jobId
    }

    // Handle pagination if there are more results
    let pageToken = initialData.pageToken
    let totalRowsFetched = rows.length
    logger.debug('Pagination check', { pageToken, totalRowsFetched, maxRows })
    while (pageToken && totalRowsFetched < maxRows) {
      const pageParams = new URLSearchParams({
        pageToken,
        maxResults: Math.min(maxRows - totalRowsFetched, 10000).toString()
      })
      if (jobLocation) pageParams.set('location', jobLocation)
      const pageResponse = await this.apiRequest(
        `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(project)}/queries/${encodeURIComponent(initialData.jobReference.jobId)}?${pageParams}`,
        // Abortable: without the signal, Stop Query couldn't even stop the
        // page-fetch loop, let alone the server-side job.
        { signal }
      )

      const pageData = await pageResponse.json()
      const pageRows = await this.parseRowsAsync(pageData.rows || [], pageData.schema)

      logger.debug('Page fetched', {
        pageRowCount: pageRows.length,
        hasNextPage: !!pageData.pageToken
      })

      yield {
        rows: pageRows,
        done: !pageData.pageToken
      }

      totalRowsFetched += pageRows.length
      pageToken = pageData.pageToken
    }
  }

  /**
   * Sync parser — main-thread fallback for small batches and for the
   * test environment (jsdom has no Worker).
   */
  private parseRows(rows: BigQueryRow[], schema: BigQuerySchema): Record<string, unknown>[] {
    return parseBigQueryRows(
      rows as unknown as BigQueryRowLite[],
      schema as unknown as BigQuerySchemaLite,
    )
  }

  /**
   * Async parser. Routes large batches (≥2000 rows) to a Web Worker
   * via WorkerParsePool; small batches stay on the main thread. Worker
   * is lazily constructed; falls back permanently to main-thread on
   * Worker construction failure.
   */
  private async parseRowsAsync(
    rows: BigQueryRow[],
    schema: BigQuerySchema,
  ): Promise<Record<string, unknown>[]> {
    if (!rows || rows.length === 0) return []
    if (!schema?.fields) return rows as unknown as Record<string, unknown>[]

    const SMALL_THRESHOLD = 2000
    if (rows.length < SMALL_THRESHOLD) {
      return this.parseRows(rows, schema)
    }

    if (!this.parserPool) {
      this.parserPool = new WorkerParsePool<
        { type: 'parseRows'; rows: BigQueryRowLite[]; schema: BigQuerySchemaLite },
        { id: string; rows: Record<string, unknown>[] }
      >(
        () => new Worker(new URL('./bigquery-parse.worker.ts', import.meta.url), { type: 'module' }),
        // Must return the same shape the worker posts ({id, rows}) — the
        // caller reads `.rows` off whichever side answered. Returning the
        // bare array here made every fallback (worker crash, timeout, no
        // Worker global) crash the query instead of saving it.
        (req) => ({ id: 'main-thread-fallback', rows: parseBigQueryRows(req.rows, req.schema) }),
        logger,
      )
    }

    const response = await this.parserPool.send({
      type: 'parseRows',
      rows: rows as unknown as BigQueryRowLite[],
      schema: schema as unknown as BigQuerySchemaLite,
    })
    return response.rows
  }

  // parseValue moved to bigquery-parse-shared.ts so the worker can call it.

  /**
   * Cancel a running query
   */
  /** Cancel a BigQuery job by id. Best-effort; location is required for jobs outside US/EU. */
  private async cancelJob(
    jobId: string,
    project: string,
    location?: string,
  ): Promise<void> {
    try {
      const params = new URLSearchParams()
      if (location) params.set('location', location)
      const qs = params.toString()
      await this.apiRequest(
        `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(project)}/jobs/${encodeURIComponent(jobId)}/cancel${qs ? `?${qs}` : ''}`,
        { method: 'POST' },
      )
      logger.debug('BigQuery job cancel requested', { jobId, location })
    } catch (error) {
      logger.error('Failed to cancel BigQuery job', error)
    }
  }

  async cancel(queryId: string): Promise<void> {
    // Retained for the BaseConnector contract. The primary cancel path is the
    // abort listener wired in query(); this handles an explicit id if a caller
    // ever tracks one.
    const jobId = this.activeJobs.get(queryId)
    if (!jobId) return

    await this.ensureFreshToken()
    if (!this.defaultProject) await this.loadDefaultProject()
    const project = this.defaultProject
    if (!project) {
      logger.warn('Cannot cancel job: no billing project available')
      return
    }
    await this.cancelJob(jobId, project)
    this.activeJobs.delete(queryId)
  }

  /**
   * Revoke OAuth tokens and clear credentials
   */
  async revoke(): Promise<void> {
    const tk = await this.loadToken()
    if (!tk) return

    if (tk.access_token) {
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: tk.access_token })
        })
      } catch (e) {
        logger.error('Failed to revoke token', e)
      }
    }

    await this.creds.save(this.credsKey, null)
    this.token = null
    this.cache.clear()
    this.activeJobs.clear()
    // Tear down the parse worker so we don't leak it across reconnects.
    this.parserPool?.terminate()
    this.parserPool = null
  }

  /**
   * Clear metadata cache (projects, datasets, tables)
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Export encrypted credentials
   */
  async exportEncrypted(passphrase: string): Promise<string> {
    const tk = await this.loadToken()
    if (!tk) throw new Error('No token to export')

    const em = new EncryptionManager()
    return await em.encryptWithPassphrase(passphrase, JSON.stringify(tk))
  }

  /**
   * Import encrypted credentials
   */
  async importEncrypted(blob: string, passphrase: string): Promise<void> {
    const em = new EncryptionManager()
    const txt = await em.decryptWithPassphrase(passphrase, blob)
    const obj = JSON.parse(txt)

    await this.creds.save(this.credsKey, obj)
    this.token = obj
    this.cache.clear()
  }
}