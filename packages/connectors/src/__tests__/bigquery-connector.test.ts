import { BigQueryConnector } from '../bigquery-connector'
import { CredentialStore } from '@ide/storage'
import {
  CatalogInfo,
  SchemaInfo,
  TableMetadata,
  QueryCostEstimate,
  ConnectionTestResult,
  QueryChunk
} from '../base'

// Mock fetch globally
global.fetch = jest.fn()

interface CryptoMock {
  getRandomValues: (array: Uint8Array) => Uint8Array
  subtle: {
    digest: jest.Mock
  }
}

// Mock crypto for OAuth PKCE
global.crypto = {
  getRandomValues: (array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256)
    }
    return array
  },
  subtle: {
    digest: jest.fn().mockResolvedValue(new ArrayBuffer(32))
  }
} as unknown as Crypto

interface WindowMock {
  open: jest.Mock
  addEventListener: jest.Mock
  removeEventListener: jest.Mock
  location: {
    origin: string
  }
}

// Mock window.open for OAuth flow
global.window = {
  open: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  location: {
    origin: 'http://localhost:3000'
  }
} as unknown as Window & typeof globalThis

describe('BigQueryConnector', () => {
  let connector: BigQueryConnector
  let mockCredentialStore: jest.Mocked<CredentialStore>
  const clientId = 'test-client-id'

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks()
    ;(global.fetch as jest.Mock).mockReset()

    // Create mock credential store
    mockCredentialStore = {
      save: jest.fn(),
      load: jest.fn(),
      listKeys: jest.fn()
    } as jest.Mocked<CredentialStore>

    // Create connector instance
    connector = new BigQueryConnector(mockCredentialStore, clientId)
  })

  describe('Authentication', () => {
    it('should connect using OAuth 2.0 with PKCE', async () => {
      const mockCode = 'test-auth-code'
      const mockToken = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600
      }

      // Mock window message event for OAuth callback
      ;(window.addEventListener as jest.Mock).mockImplementation((event, handler) => {
        if (event === 'message') {
          setTimeout(() => {
            handler({
              origin: 'http://localhost:3000',
              data: {
                type: 'oauth_code',
                code: mockCode,
                state: expect.any(String)
              }
            })
          }, 100)
        }
      })

      // Mock token exchange
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockToken
      })

      await connector.connect({ options: {} })

      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining('https://accounts.google.com/o/oauth2/v2/auth'),
        'oauth',
        'width=600,height=700'
      )

      expect(global.fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(URLSearchParams)
        })
      )

      expect(mockCredentialStore.save).toHaveBeenCalledWith(
        'bigquery-token',
        expect.objectContaining({
          access_token: mockToken.access_token,
          refresh_token: mockToken.refresh_token,
          obtained_at: expect.any(Number)
        })
      )
    })

    it('should refresh expired tokens', async () => {
      const expiredToken = {
        access_token: 'expired-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        obtained_at: Date.now() - 4000000 // Expired
      }

      const newToken = {
        access_token: 'new-access-token',
        expires_in: 3600
      }

      mockCredentialStore.load.mockResolvedValue(expiredToken)

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => newToken
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true })
        })

      // Trigger token refresh by calling a method that requires auth
      await connector.testConnection()

      expect(global.fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining(
            new URLSearchParams({
              client_id: clientId,
              grant_type: 'refresh_token',
              refresh_token: expiredToken.refresh_token
            })
          )
        })
      )

      expect(mockCredentialStore.save).toHaveBeenCalledWith(
        'bigquery-token',
        expect.objectContaining({
          access_token: newToken.access_token
        })
      )
    })

    it('should handle invalid credentials gracefully', async () => {
      mockCredentialStore.load.mockResolvedValue(null)

      await expect(connector.testConnection()).rejects.toThrow(
        'Not authenticated. Please connect first.'
      )
    })

    it('should revoke tokens on disconnect', async () => {
      const token = {
        access_token: 'test-token',
        refresh_token: 'refresh-token'
      }

      mockCredentialStore.load.mockResolvedValue(token)
      ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true })

      await connector.revoke()

      expect(global.fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/revoke',
        expect.objectContaining({
          method: 'POST',
          body: new URLSearchParams({ token: token.access_token })
        })
      )

      expect(mockCredentialStore.save).toHaveBeenCalledWith('bigquery-token', null)
    })
  })

  describe('Catalog Discovery', () => {
    beforeEach(() => {
      // Set up authenticated state
      const token = {
        access_token: 'test-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        obtained_at: Date.now()
      }
      mockCredentialStore.load.mockResolvedValue(token)
    })

    it('should list projects', async () => {
      const mockProjects = {
        projects: [
          {
            projectId: 'project-1',
            name: 'Project One',
            projectNumber: '12345'
          },
          {
            projectId: 'project-2',
            name: 'Project Two',
            projectNumber: '67890'
          }
        ]
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProjects
      })

      const projects = await connector.listProjects()

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('cloudresourcemanager.googleapis.com'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token'
          })
        })
      )

      expect(projects).toEqual([
        {
          id: 'project-1',
          name: 'Project One',
          type: 'project',
          description: 'Project #12345'
        },
        {
          id: 'project-2',
          name: 'Project Two',
          type: 'project',
          description: 'Project #67890'
        }
      ])
    })

    it('should list datasets for a project', async () => {
      const mockDatasets = {
        datasets: [
          {
            datasetReference: { datasetId: 'dataset1' },
            friendlyName: 'Dataset One',
            location: 'US'
          },
          {
            datasetReference: { datasetId: 'dataset2' },
            friendlyName: 'Dataset Two',
            location: 'EU'
          }
        ]
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDatasets
      })

      const datasets = await connector.listDatasets('project-1')

      expect(global.fetch).toHaveBeenCalledWith(
        'https://bigquery.googleapis.com/bigquery/v2/projects/project-1/datasets',
        expect.any(Object)
      )

      expect(datasets).toEqual([
        {
          id: 'dataset1',
          name: 'dataset1',
          catalog: 'project-1',
          description: 'Dataset One',
          location: 'US'
        },
        {
          id: 'dataset2',
          name: 'dataset2',
          catalog: 'project-1',
          description: 'Dataset Two',
          location: 'EU'
        }
      ])
    })

    it('should list tables for a dataset', async () => {
      const mockTables = {
        tables: [
          {
            tableReference: { tableId: 'table1' },
            type: 'TABLE',
            numRows: '1000',
            numBytes: '50000',
            creationTime: '1609459200000',
            lastModifiedTime: '1609545600000',
            friendlyName: 'Table One'
          },
          {
            tableReference: { tableId: 'view1' },
            type: 'VIEW',
            numRows: '500',
            numBytes: '25000'
          }
        ]
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTables
      })

      const tables = await connector.listTables('project-1', 'dataset1')

      expect(global.fetch).toHaveBeenCalledWith(
        'https://bigquery.googleapis.com/bigquery/v2/projects/project-1/datasets/dataset1/tables',
        expect.any(Object)
      )

      expect(tables).toEqual([
        {
          id: 'table1',
          name: 'table1',
          catalog: 'project-1',
          schema: 'dataset1',
          type: 'table',
          rowCount: 1000,
          sizeBytes: 50000,
          created: new Date(1609459200000),
          modified: new Date(1609545600000),
          description: 'Table One',
          labels: undefined
        },
        {
          id: 'view1',
          name: 'view1',
          catalog: 'project-1',
          schema: 'dataset1',
          type: 'view',
          rowCount: 500,
          sizeBytes: 25000,
          created: undefined,
          modified: undefined,
          description: undefined,
          labels: undefined
        }
      ])
    })

    it('should get table metadata with schema', async () => {
      const mockTable = {
        tableReference: { tableId: 'table1' },
        type: 'TABLE',
        numRows: '1000',
        numBytes: '50000',
        description: 'Test table',
        schema: {
          fields: [
            {
              name: 'id',
              type: 'INTEGER',
              mode: 'REQUIRED'
            },
            {
              name: 'name',
              type: 'STRING',
              mode: 'NULLABLE',
              description: 'User name'
            },
            {
              name: 'created_at',
              type: 'TIMESTAMP',
              mode: 'REQUIRED'
            }
          ]
        }
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTable
      })

      const metadata = await connector.getTableMetadata('project-1', 'dataset1', 'table1')

      expect(metadata).toEqual({
        id: 'table1',
        name: 'table1',
        catalog: 'project-1',
        schema: 'dataset1',
        type: 'table',
        rowCount: 1000,
        sizeBytes: 50000,
        description: 'Test table',
        columns: [
          {
            name: 'id',
            type: 'INTEGER',
            nullable: false,
            comment: undefined
          },
          {
            name: 'name',
            type: 'STRING',
            nullable: true,
            comment: 'User name'
          },
          {
            name: 'created_at',
            type: 'TIMESTAMP',
            nullable: false,
            comment: undefined
          }
        ],
        created: undefined,
        modified: undefined,
        labels: undefined
      })
    })

    it('should cache catalog metadata', async () => {
      const mockProjects = {
        projects: [{ projectId: 'project-1', name: 'Project One' }]
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProjects
      })

      // First call - should fetch from API
      const projects1 = await connector.listProjects()
      expect(global.fetch).toHaveBeenCalledTimes(1)

      // Second call within cache TTL - should use cache
      const projects2 = await connector.listProjects()
      expect(global.fetch).toHaveBeenCalledTimes(1)

      expect(projects1).toEqual(projects2)
    })
  })

  describe('Query Execution', () => {
    beforeEach(() => {
      const token = {
        access_token: 'test-token',
        expires_in: 3600,
        obtained_at: Date.now(),
        project_id: 'test-project'
      }
      mockCredentialStore.load.mockResolvedValue(token)
    })

    it('should execute simple queries', async () => {
      const mockResponse = {
        jobReference: { jobId: 'job-123' },
        schema: {
          fields: [
            { name: 'count', type: 'INTEGER' }
          ]
        },
        rows: [
          { f: [{ v: '42' }] }
        ]
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const chunks: QueryChunk[] = []
      for await (const chunk of connector.query('SELECT COUNT(*) as count FROM table1')) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(1)
      expect(chunks[0].rows).toEqual([{ count: 42 }])
      expect(chunks[0].done).toBe(true)
      expect(chunks[0].schema).toBeDefined()
    })

    it('should handle pagination for large result sets', async () => {
      const page1 = {
        jobReference: { jobId: 'job-123' },
        schema: { fields: [{ name: 'id', type: 'INTEGER' }] },
        rows: [{ f: [{ v: '1' }] }, { f: [{ v: '2' }] }],
        pageToken: 'page2'
      }

      const page2 = {
        rows: [{ f: [{ v: '3' }] }, { f: [{ v: '4' }] }],
        pageToken: null
      }

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => page1
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => page2
        })

      const chunks: QueryChunk[] = []
      for await (const chunk of connector.query('SELECT id FROM large_table')) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(2)
      expect(chunks[0].rows).toEqual([{ id: 1 }, { id: 2 }])
      expect(chunks[0].done).toBe(false)
      expect(chunks[1].rows).toEqual([{ id: 3 }, { id: 4 }])
      expect(chunks[1].done).toBe(true)
    })

    it('should estimate query cost using dry run', async () => {
      const mockResponse = {
        totalBytesProcessed: '1099511627776', // 1TB
        cacheHit: false
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const estimate = await connector.estimateQueryCost('SELECT * FROM large_table')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"dryRun":true')
        })
      )

      expect(estimate).toEqual({
        estimatedBytes: 1099511627776,
        estimatedCostUSD: 6.25, // $6.25 per TB
        cachingPossible: false
      })
    })

    it('should handle query errors gracefully', async () => {
      const errorResponse = {
        error: {
          message: 'Table not found: project.dataset.nonexistent_table',
          errors: [
            {
              message: 'Table not found',
              reason: 'notFound'
            }
          ]
        }
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => errorResponse
      })

      await expect(
        (async () => {
          for await (const chunk of connector.query('SELECT * FROM nonexistent_table')) {
            // Should throw before yielding
          }
        })()
      ).rejects.toThrow('Table not found: project.dataset.nonexistent_table')
    })

    it('should parse different BigQuery data types correctly', async () => {
      const mockResponse = {
        schema: {
          fields: [
            { name: 'int_col', type: 'INTEGER' },
            { name: 'float_col', type: 'FLOAT' },
            { name: 'bool_col', type: 'BOOLEAN' },
            { name: 'string_col', type: 'STRING' },
            { name: 'timestamp_col', type: 'TIMESTAMP' },
            { name: 'null_col', type: 'STRING' }
          ]
        },
        rows: [
          {
            f: [
              { v: '123' },
              { v: '45.67' },
              { v: 'true' },
              { v: 'test string' },
              { v: '1609459200' }, // 2021-01-01 00:00:00 UTC
              { v: null }
            ]
          }
        ]
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const chunks: QueryChunk[] = []
      for await (const chunk of connector.query('SELECT * FROM test_table')) {
        chunks.push(chunk)
      }

      expect(chunks[0].rows[0]).toEqual({
        int_col: 123,
        float_col: 45.67,
        bool_col: true,
        string_col: 'test string',
        timestamp_col: '2021-01-01T00:00:00.000Z',
        null_col: null
      })
    })
  })

  describe('Connection Management', () => {
    beforeEach(() => {
      const token = {
        access_token: 'test-token',
        expires_in: 3600,
        obtained_at: Date.now(),
        project_id: 'test-project'
      }
      mockCredentialStore.load.mockResolvedValue(token)
    })

    it('should test connection successfully', async () => {
      const mockQueryResponse = {
        jobReference: { jobId: 'test-job-123' },
        rows: [{ f: [{ v: '1' }] }]
      }

      const mockUserInfo = {
        email: 'user@example.com'
      }

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockQueryResponse
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUserInfo
        })

      const result = await connector.testConnection()

      expect(result.success).toBe(true)
      expect(result.latencyMs).toBeGreaterThan(0)
      expect(result.metadata).toEqual({
        project: 'test-project',
        user: 'user@example.com',
        jobId: 'test-job-123'
      })
    })

    it('should handle connection test failures', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      )

      const result = await connector.testConnection()

      expect(result.success).toBe(false)
      expect(result.error).toContain('Network error')
      expect(result.latencyMs).toBeGreaterThan(0)
    })

    it('should check connection status', () => {
      expect(connector.isConnected()).toBe(false)

      // Simulate successful connection by setting up mock token
      interface ConnectorWithToken {
        token: unknown
      }
      ;(connector as unknown as ConnectorWithToken).token = { access_token: 'test' }

      expect(connector.isConnected()).toBe(true)
    })
  })

  describe('Error Handling', () => {
    beforeEach(() => {
      const token = {
        access_token: 'test-token',
        expires_in: 3600,
        obtained_at: Date.now()
      }
      mockCredentialStore.load.mockResolvedValue(token)
    })

    it('should handle 403 Forbidden errors with helpful message', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({
          error: { message: 'Access Denied' }
        })
      })

      await expect(connector.listProjects()).rejects.toThrow(
        'Access Denied\n\nPlease ensure you have the necessary permissions in your Google Cloud project.'
      )
    })

    it('should handle rate limiting errors', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({
          error: { message: 'Rate limit exceeded' }
        })
      })

      await expect(connector.listDatasets('project-1')).rejects.toThrow(
        'Rate limit exceeded\n\nRate limit exceeded. Please wait a moment and try again.'
      )
    })

    it('should handle quota errors', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: { message: 'Quota exceeded for budget' }
        })
      })

      await expect(connector.listTables('project-1', 'dataset1')).rejects.toThrow(
        'Quota exceeded for budget\n\nYou may have exceeded your BigQuery quota or budget.'
      )
    })

    it('should handle malformed API responses', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => { throw new Error('Invalid JSON') }
      })

      await expect(connector.testConnection()).rejects.toThrow(
        'BigQuery API error: 500 Internal Server Error'
      )
    })
  })

  describe('getSchema', () => {
    beforeEach(() => {
      const token = {
        access_token: 'test-token',
        expires_in: 3600,
        obtained_at: Date.now(),
        project_id: 'test-project'
      }
      mockCredentialStore.load.mockResolvedValue(token)
    })

    it('should return complete schema for a project', async () => {
      const mockDatasets = {
        datasets: [
          { datasetReference: { datasetId: 'dataset1' } }
        ]
      }

      const mockTables = {
        tables: [
          { tableReference: { tableId: 'table1' }, type: 'TABLE' }
        ]
      }

      const mockTableDetails = {
        tableReference: { tableId: 'table1' },
        type: 'TABLE',
        schema: {
          fields: [
            { name: 'id', type: 'INTEGER', mode: 'REQUIRED' },
            { name: 'name', type: 'STRING' }
          ]
        }
      }

      ;(global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDatasets
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTables
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTableDetails
        })

      const schema = await connector.getSchema('test-project')

      expect(schema).toEqual({
        tables: [
          {
            name: 'table1',
            schema: 'dataset1',
            type: 'table',
            columns: [
              { name: 'id', type: 'INTEGER', nullable: false, comment: undefined },
              { name: 'name', type: 'STRING', nullable: true, comment: undefined }
            ]
          }
        ],
        database: 'test-project'
      })
    })

    it('should return empty schema when no project is available', async () => {
      mockCredentialStore.load.mockResolvedValue(null)

      const schema = await connector.getSchema()

      expect(schema).toEqual({ tables: [] })
    })
  })

  describe('Credential Import/Export', () => {
    it('should export encrypted credentials', async () => {
      const token = {
        access_token: 'test-token',
        refresh_token: 'refresh-token',
        project_id: 'test-project'
      }

      mockCredentialStore.load.mockResolvedValue(token)

      // Mock EncryptionManager
      jest.mock('@ide/storage', () => ({
        EncryptionManager: jest.fn().mockImplementation(() => ({
          encryptWithPassphrase: jest.fn().mockResolvedValue('encrypted-blob')
        }))
      }))

      const encrypted = await connector.exportEncrypted('passphrase123')

      expect(encrypted).toBeTruthy()
    })

    it('should import encrypted credentials', async () => {
      // Mock EncryptionManager
      jest.mock('@ide/storage', () => ({
        EncryptionManager: jest.fn().mockImplementation(() => ({
          decryptWithPassphrase: jest.fn().mockResolvedValue(
            JSON.stringify({
              access_token: 'imported-token',
              refresh_token: 'imported-refresh'
            })
          )
        }))
      }))

      await connector.importEncrypted('encrypted-blob', 'passphrase123')

      expect(mockCredentialStore.save).toHaveBeenCalledWith(
        'bigquery-token',
        expect.objectContaining({
          access_token: 'imported-token',
          refresh_token: 'imported-refresh'
        })
      )
    })

    it('should throw error when no token to export', async () => {
      mockCredentialStore.load.mockResolvedValue(null)

      await expect(connector.exportEncrypted('passphrase')).rejects.toThrow(
        'No token to export'
      )
    })
  })
})