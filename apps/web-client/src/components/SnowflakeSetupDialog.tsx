import type React from "react"
import { useEffect, useState } from "react"
import { queryService } from "../services/streaming-query-service"
import { SNOWFLAKE_OAUTH_AUTO_CONNECT_KEY } from "../utils/oauth-constants"

interface SnowflakeSetupDialogProps {
	onClose: () => void
	onSuccess: () => void
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void
	/** When provided, dialog is in edit mode (warehouse/role/db/schema only). */
	initialConfig?: {
		account?: string
		clientId?: string
		warehouse?: string
		role?: string
		database?: string
		schema?: string
	}
}

// Connect or edit mode. Edit mode locks account + auth fields and only
// exposes warehouse/role/db/schema. The OAuth tab renders the redirect URI
// using window.location.origin so users can copy-paste an exact match into
// Snowflake — redirect_uri_mismatch is one of OAuth's worst error messages.
type AuthMode = "oauth" | "pat"

export default function SnowflakeSetupDialog({
	onClose,
	onSuccess,
	showToast,
	initialConfig,
}: SnowflakeSetupDialogProps) {
	const isEditing = !!(initialConfig?.account && initialConfig?.clientId)

	// Auth mode tab. Edit mode is fixed to whatever connected — we don't
	// expose tabs there; warehouse/role/db/schema are the only editable
	// fields, identical for both auth modes.
	const [authMode, setAuthMode] = useState<AuthMode>("oauth")

	const [account, setAccount] = useState(initialConfig?.account ?? "")
	const [clientId, setClientId] = useState(initialConfig?.clientId ?? "")
	const [clientSecret, setClientSecret] = useState("")
	const [pat, setPat] = useState("")
	const [warehouse, setWarehouse] = useState(initialConfig?.warehouse ?? "")
	const [role, setRole] = useState(initialConfig?.role ?? "PUBLIC")
	const [database, setDatabase] = useState(initialConfig?.database ?? "")
	const [schema, setSchema] = useState(initialConfig?.schema ?? "")
	const [showAdvanced, setShowAdvanced] = useState(false)
	const [isConnecting, setIsConnecting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Auto-expand advanced section if either field is already set
	useEffect(() => {
		if (initialConfig?.database || initialConfig?.schema) {
			setShowAdvanced(true)
		}
	}, [initialConfig?.database, initialConfig?.schema])

	// Submit gating differs per auth mode. OAuth needs account + clientId;
	// PAT needs account + token. Both need warehouse.
	const submitDisabled =
		isConnecting ||
		!warehouse.trim() ||
		(!isEditing &&
			(!account.trim() ||
				(authMode === "oauth" ? !clientId.trim() : !pat.trim())))

	const handleSubmit = async () => {
		if (!warehouse.trim()) {
			setError("Warehouse is required")
			return
		}
		if (!isEditing) {
			if (!account.trim()) {
				setError("Account identifier is required")
				return
			}
			if (authMode === "oauth" && !clientId.trim()) {
				setError("Client ID is required")
				return
			}
			if (authMode === "pat" && !pat.trim()) {
				setError("Personal Access Token is required")
				return
			}
		}

		setIsConnecting(true)
		setError(null)
		try {
			if (isEditing) {
				await queryService.updateSnowflakeConfig({
					warehouse: warehouse.trim(),
					database: database.trim() || undefined,
					schema: schema.trim() || undefined,
					role: role.trim() || "PUBLIC",
				})
				showToast?.("Snowflake configuration updated", "success", 3000)
			} else if (authMode === "pat") {
				await queryService.setupSnowflake({
					account: account.trim(),
					auth: { mode: "pat", token: pat.trim() },
					warehouse: warehouse.trim(),
					role: role.trim() || "PUBLIC",
					database: database.trim() || undefined,
					schema: schema.trim() || undefined,
				})
				localStorage.setItem(SNOWFLAKE_OAUTH_AUTO_CONNECT_KEY, "true")
				showToast?.("Connected to Snowflake", "success", 3000)
			} else {
				await queryService.setupSnowflake({
					account: account.trim(),
					clientId: clientId.trim(),
					// undefined → public client (PKCE-only); a non-empty
					// string → confidential client (HTTP Basic on token endpoint)
					clientSecret: clientSecret.trim() || undefined,
					warehouse: warehouse.trim(),
					role: role.trim() || "PUBLIC",
					database: database.trim() || undefined,
					schema: schema.trim() || undefined,
				})
				localStorage.setItem(SNOWFLAKE_OAUTH_AUTO_CONNECT_KEY, "true")
				showToast?.("Connected to Snowflake", "success", 3000)
			}
			onSuccess()
			onClose()
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to connect to Snowflake"
			setError(msg)
			showToast?.(msg, "error", 5000)
		} finally {
			setIsConnecting(false)
		}
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !submitDisabled) {
			handleSubmit()
		} else if (e.key === "Escape") {
			onClose()
		}
	}

	const inputBaseStyle: React.CSSProperties = {
		width: "100%",
		padding: "10px 12px",
		fontSize: "14px",
		fontFamily: "monospace",
		border: `1px solid ${error ? "var(--error)" : "var(--border)"}`,
		borderRadius: "4px",
		background: "var(--bg-primary)",
		color: "var(--text-primary)",
		outline: "none",
		transition: "border-color 0.2s",
	}
	const lockedStyle: React.CSSProperties = {
		opacity: 0.6,
		cursor: "not-allowed",
	}

	return (
		<div
			className="modal-overlay"
			onClick={onClose}
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				background: "rgba(0,0,0,0.7)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 10000,
			}}
		>
			<div
				className="modal-content"
				role="dialog"
				aria-modal="true"
				aria-labelledby="snowflake-setup-title"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={handleKeyDown}
				style={{
					background: "var(--bg-primary)",
					border: "2px solid var(--border)",
					borderRadius: "8px",
					width: "600px",
					maxWidth: "92vw",
					maxHeight: "92vh",
					overflow: "hidden",
					display: "flex",
					flexDirection: "column",
				}}
			>
				{/* Header */}
				<div
					style={{
						padding: "16px 20px",
						borderBottom: "1px solid var(--border)",
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						background: "var(--bg-secondary)",
					}}
				>
					<h2
						id="snowflake-setup-title"
						style={{
							margin: 0,
							fontSize: "18px",
							color: "var(--text-primary)",
						}}
					>
						{isEditing ? "Edit Snowflake Configuration" : "Configure Snowflake Connection"}
					</h2>
					<button
						onClick={onClose}
						disabled={isConnecting}
						aria-label="Close dialog"
						style={{
							background: "none",
							border: "none",
							fontSize: "24px",
							cursor: isConnecting ? "not-allowed" : "pointer",
							color: "var(--text-secondary)",
							opacity: isConnecting ? 0.5 : 1,
						}}
						title="Close (Esc)"
					>
						<span aria-hidden="true">×</span>
					</button>
				</div>

				{/* Body */}
				<div style={{ padding: "24px", overflowY: "auto", flex: 1 }}>
					{!isEditing && (
						<>
							{/* Auth-mode tabs. Only shown on first-time connect; in
							    edit mode we keep whatever auth the connection was
							    established with. */}
							<div
								role="tablist"
								aria-label="Authentication method"
								style={{
									display: "flex",
									gap: 4,
									marginBottom: 16,
									borderBottom: "1px solid var(--border)",
								}}
							>
								<TabButton
									label="OAuth (recommended)"
									active={authMode === "oauth"}
									disabled={isConnecting}
									onClick={() => {
										setAuthMode("oauth")
										setError(null)
									}}
								/>
								<TabButton
									label="Personal Access Token (no admin)"
									active={authMode === "pat"}
									disabled={isConnecting}
									onClick={() => {
										setAuthMode("pat")
										setError(null)
									}}
								/>
							</div>

							<Field label="Account Identifier" hint="e.g. xy12345.us-east-2.aws or your full Snowflake URL">
								<input
									type="text"
									value={account}
									onChange={(e) => {
										setAccount(e.target.value)
										setError(null)
									}}
									placeholder="xy12345.us-east-2.aws"
									disabled={isConnecting || isEditing}
									style={{
										...inputBaseStyle,
										...((isConnecting || isEditing) ? lockedStyle : {}),
									}}
								/>
							</Field>

							{authMode === "oauth" ? (
								<>
									<Field label="OAuth Client ID">
										<input
											type="text"
											value={clientId}
											onChange={(e) => {
												setClientId(e.target.value)
												setError(null)
											}}
											placeholder="Snowflake OAuth Client ID"
											disabled={isConnecting || isEditing}
											style={{
												...inputBaseStyle,
												...((isConnecting || isEditing) ? lockedStyle : {}),
											}}
										/>
									</Field>

									<Field
										label="OAuth Client Secret"
										hint="Optional — leave blank for OAUTH_CLIENT_TYPE='PUBLIC' (PKCE-only, recommended). Required only for OAUTH_CLIENT_TYPE='CONFIDENTIAL'."
									>
										<input
											type="password"
											value={clientSecret}
											onChange={(e) => {
												setClientSecret(e.target.value)
												setError(null)
											}}
											placeholder="(blank for public client)"
											disabled={isConnecting || isEditing}
											style={{
												...inputBaseStyle,
												...((isConnecting || isEditing) ? lockedStyle : {}),
											}}
										/>
									</Field>
								</>
							) : (
								<Field
									label="Personal Access Token"
									required
									hint="Generate in Snowsight → My Profile → Programmatic Access Tokens. The token is bound to the role it was created with."
								>
									<input
										type="password"
										value={pat}
										onChange={(e) => {
											setPat(e.target.value)
											setError(null)
										}}
										placeholder="paste PAT here"
										disabled={isConnecting}
										style={inputBaseStyle}
										autoComplete="off"
									/>
								</Field>
							)}
						</>
					)}

					<Field label="Warehouse" required hint="Required. The warehouse used to execute queries.">
						<input
							type="text"
							value={warehouse}
							onChange={(e) => {
								setWarehouse(e.target.value)
								setError(null)
							}}
							placeholder="COMPUTE_WH"
							disabled={isConnecting}
							style={inputBaseStyle}
						/>
					</Field>

					<Field label="Role" hint="Defaults to PUBLIC. Required for the OAuth scope.">
						<input
							type="text"
							value={role}
							onChange={(e) => {
								setRole(e.target.value)
								setError(null)
							}}
							placeholder="PUBLIC"
							disabled={isConnecting}
							style={inputBaseStyle}
						/>
					</Field>

					<button
						type="button"
						onClick={() => setShowAdvanced(!showAdvanced)}
						style={{
							marginTop: "8px",
							marginBottom: "12px",
							background: "none",
							border: "none",
							color: "var(--accent)",
							cursor: "pointer",
							padding: 0,
							fontSize: "13px",
						}}
					>
						{showAdvanced ? "Hide advanced ▲" : "Show advanced (database, schema) ▼"}
					</button>

					{showAdvanced && (
						<>
							<Field label="Default Database">
								<input
									type="text"
									value={database}
									onChange={(e) => setDatabase(e.target.value)}
									placeholder="(optional)"
									disabled={isConnecting}
									style={inputBaseStyle}
								/>
							</Field>
							<Field label="Default Schema">
								<input
									type="text"
									value={schema}
									onChange={(e) => setSchema(e.target.value)}
									placeholder="(optional)"
									disabled={isConnecting}
									style={inputBaseStyle}
								/>
							</Field>
						</>
					)}

					{error && (
						<div
							style={{
								marginTop: "8px",
								marginBottom: "16px",
								padding: "10px 12px",
								background: "var(--bg-secondary)",
								border: "1px solid var(--error)",
								borderRadius: "4px",
								color: "var(--error)",
								fontSize: "13px",
								display: "flex",
								alignItems: "flex-start",
								gap: "6px",
							}}
						>
							<span>⚠️</span>
							<span style={{ whiteSpace: "pre-wrap" }}>{error}</span>
						</div>
					)}

					{!isEditing && authMode === "oauth" && <SecurityIntegrationGuide />}
					{!isEditing && authMode === "pat" && <PatGuide />}
				</div>

				{/* Footer */}
				<div
					style={{
						padding: "16px 20px",
						borderTop: "1px solid var(--border)",
						display: "flex",
						justifyContent: "flex-end",
						gap: "12px",
						background: "var(--bg-secondary)",
					}}
				>
					<button
						onClick={onClose}
						disabled={isConnecting}
						style={{
							padding: "8px 16px",
							fontSize: "14px",
							background: "var(--bg-tertiary)",
							border: "1px solid var(--border)",
							borderRadius: "4px",
							cursor: isConnecting ? "not-allowed" : "pointer",
							color: "var(--text-primary)",
							opacity: isConnecting ? 0.5 : 1,
						}}
					>
						Cancel
					</button>
					<button
						onClick={handleSubmit}
						disabled={submitDisabled}
						style={{
							padding: "8px 20px",
							fontSize: "14px",
							background: submitDisabled ? "var(--bg-tertiary)" : "var(--accent)",
							border: "none",
							borderRadius: "4px",
							cursor: submitDisabled ? "not-allowed" : "pointer",
							color: submitDisabled ? "var(--text-muted)" : "white",
							fontWeight: 500,
							display: "flex",
							alignItems: "center",
							gap: "8px",
						}}
					>
						{isConnecting ? (
							<>
								<span className="spinner" style={{ width: 14, height: 14 }} />
								<span>{isEditing ? "Saving…" : "Connecting…"}</span>
							</>
						) : isEditing ? (
							"Save"
						) : (
							"Connect to Snowflake"
						)}
					</button>
				</div>
			</div>
		</div>
	)
}

function TabButton({
	label,
	active,
	disabled,
	onClick,
}: {
	label: string
	active: boolean
	disabled?: boolean
	onClick: () => void
}) {
	return (
		<button
			role="tab"
			aria-selected={active}
			type="button"
			onClick={onClick}
			disabled={disabled}
			style={{
				padding: "8px 14px",
				fontSize: 13,
				fontWeight: active ? 600 : 400,
				background: "transparent",
				color: active ? "var(--text-primary)" : "var(--text-secondary)",
				border: "none",
				borderBottom: active
					? "2px solid var(--accent)"
					: "2px solid transparent",
				cursor: disabled ? "not-allowed" : "pointer",
				opacity: disabled ? 0.6 : 1,
				marginBottom: -1,
			}}
		>
			{label}
		</button>
	)
}

function PatGuide() {
	return (
		<details
			style={{
				marginTop: 20,
				border: "1px solid var(--border)",
				borderRadius: 8,
				background: "var(--bg-secondary)",
				overflow: "hidden",
			}}
			open
		>
			<summary
				style={{
					padding: "12px 16px",
					fontWeight: 600,
					fontSize: 13,
					color: "var(--text-primary)",
					cursor: "pointer",
					display: "flex",
					alignItems: "center",
					gap: 8,
					listStyle: "none",
				}}
			>
				<span>🔑</span>
				<span>How to generate a Personal Access Token (no admin)</span>
			</summary>
			<div
				style={{
					padding: "0 16px 16px",
					fontSize: 13,
					color: "var(--text-secondary)",
					lineHeight: 1.55,
				}}
			>
				<p style={{ marginTop: 0 }}>
					PATs let you connect without ACCOUNTADMIN. The token is
					generated on your own user, scoped to a single role you
					choose at creation time.
				</p>
				<Step number={1} title="Open Programmatic Access Tokens in Snowsight">
					<p style={{ margin: 0 }}>
						In Snowsight: click your name in the bottom-left → My
						Profile → Programmatic Access Tokens.
					</p>
				</Step>
				<Step number={2} title="Generate a token">
					<p style={{ margin: 0 }}>
						Click <strong>Generate new token</strong>. Pick the role
						you want dbxlite to use (PATs are bound to a single
						role — to switch roles later, generate a new token).
						Set an expiry (max 90 days). Snowflake shows the token{" "}
						<strong>only once</strong>; copy it immediately.
					</p>
				</Step>
				<Step number={3} title="Network policy" optional>
					<p style={{ margin: 0 }}>
						Snowflake requires a network policy on the user before
						PATs work. If you hit{" "}
						<code style={inlineCode}>403 / IP not allowed</code>,
						ask your admin to attach a network policy that includes
						your IP.
					</p>
				</Step>
				<div
					style={{
						marginTop: 14,
						padding: "10px 12px",
						background: "var(--bg-primary)",
						borderRadius: 6,
						borderLeft: "3px solid var(--accent)",
						fontSize: 12,
						lineHeight: 1.5,
					}}
				>
					<strong style={{ color: "var(--text-primary)" }}>
						Tip:
					</strong>{" "}
					PATs are stored encrypted in your browser (AES-GCM). They
					never leave your device except as a Bearer token to
					Snowflake's SQL API.
				</div>
			</div>
		</details>
	)
}

function SecurityIntegrationGuide() {
	const redirectUri = `${window.location.origin}/oauth-callback.html`
	const integrationName = "DBXLITE_LOCAL"
	// Snowflake requires a TLS (https) redirect URI by default. For local dev
	// over http we have to opt in via OAUTH_ALLOW_NON_TLS_REDIRECT_URI = TRUE.
	const isNonTls = window.location.protocol !== "https:"
	// PUBLIC client type: PKCE-only, no client secret to store.
	// Recommended for browser deployments — RFC 8252 §8.5.
	const createSql = `CREATE OR REPLACE SECURITY INTEGRATION ${integrationName}
  TYPE = OAUTH
  ENABLED = TRUE
  OAUTH_CLIENT = CUSTOM
  OAUTH_CLIENT_TYPE = 'PUBLIC'
  OAUTH_REDIRECT_URI = '${redirectUri}'${
		isNonTls ? `\n  OAUTH_ALLOW_NON_TLS_REDIRECT_URI = TRUE` : ""
	}
  OAUTH_ISSUE_REFRESH_TOKENS = TRUE
  OAUTH_REFRESH_TOKEN_VALIDITY = 7776000;`
	// For PUBLIC clients, only the OAUTH_CLIENT_ID is needed (no secret).
	const showSecretsSql = `DESCRIBE SECURITY INTEGRATION ${integrationName};
-- Copy the OAUTH_CLIENT_ID value from the result.
-- (Public clients have no secret; leave the Client Secret field blank.)`

	return (
		<details
			style={{
				marginTop: 20,
				border: "1px solid var(--border)",
				borderRadius: 8,
				background: "var(--bg-secondary)",
				overflow: "hidden",
			}}
			open
		>
			<summary
				style={{
					padding: "12px 16px",
					fontWeight: 600,
					fontSize: 13,
					color: "var(--text-primary)",
					cursor: "pointer",
					display: "flex",
					alignItems: "center",
					gap: 8,
					listStyle: "none",
				}}
			>
				<span>📘</span>
				<span>How to set up Snowflake OAuth (one-time)</span>
			</summary>

			<div style={{ padding: "0 16px 16px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
				<p style={{ marginTop: 0 }}>
					You need a <strong>Snowflake Security Integration</strong> with OAuth
					enabled. Run the SQL below in a Snowflake worksheet as{" "}
					<code style={inlineCode}>ACCOUNTADMIN</code>.
				</p>

				<Step number={1} title="Create the integration">
					<CopyBlock code={createSql} language="sql" />
					{isNonTls && (
						<div
							style={{
								marginTop: 8,
								padding: "8px 10px",
								background: "var(--bg-primary)",
								borderRadius: 4,
								borderLeft: "3px solid var(--warning, #d97706)",
								fontSize: 12,
								lineHeight: 1.5,
							}}
						>
							<strong style={{ color: "var(--text-primary)" }}>
								Local dev (http) note:
							</strong>{" "}
							Snowflake requires a TLS (https) redirect URI by default. The SQL
							above includes <code style={inlineCode}>OAUTH_ALLOW_NON_TLS_REDIRECT_URI = TRUE</code>{" "}
							so the OAuth flow works against{" "}
							<code style={inlineCode}>{window.location.origin}</code>. Remove
							that line for production https deployments.
						</div>
					)}
				</Step>

				<Step number={2} title="Verify the redirect URI matches">
					<p style={{ margin: "0 0 8px" }}>
						This is the most common source of errors. The URI in Snowflake must
						match this app's URL <em>exactly</em> — same host, same port, same
						path:
					</p>
					<CopyBlock code={redirectUri} mono compact />
				</Step>

				<Step number={3} title="Get the Client ID">
					<CopyBlock code={showSecretsSql} language="sql" />
					<p style={{ margin: "8px 0 0" }}>
						Find the row where{" "}
						<code style={inlineCode}>property = OAUTH_CLIENT_ID</code> and copy
						its <code style={inlineCode}>property_value</code> into the form
						above. Leave the Client Secret field blank — public clients
						(PKCE-only) have no secret to copy.
					</p>
				</Step>

				<Step number={4} title="Grant the integration to your role" optional>
					<p style={{ margin: 0 }}>
						If you're using a non-default role, grant access:
					</p>
					<CopyBlock
						code={`GRANT USAGE ON INTEGRATION ${integrationName} TO ROLE <YOUR_ROLE>;`}
						language="sql"
					/>
				</Step>

				<div
					style={{
						marginTop: 14,
						padding: "10px 12px",
						background: "var(--bg-primary)",
						borderRadius: 6,
						borderLeft: "3px solid var(--accent)",
						fontSize: 12,
						lineHeight: 1.5,
					}}
				>
					<strong style={{ color: "var(--text-primary)" }}>Tip:</strong> Your
					account identifier is the part of your Snowflake URL before{" "}
					<code style={inlineCode}>.snowflakecomputing.com</code> — e.g. for{" "}
					<code style={inlineCode}>https://xy12345.us-east-2.aws.snowflakecomputing.com</code>{" "}
					the identifier is <code style={inlineCode}>xy12345.us-east-2.aws</code>.
				</div>
			</div>
		</details>
	)
}

function Step(props: {
	number: number
	title: string
	optional?: boolean
	children: React.ReactNode
}) {
	return (
		<div style={{ marginTop: 14 }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginBottom: 6,
				}}
			>
				<span
					style={{
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						width: 22,
						height: 22,
						borderRadius: "50%",
						background: "var(--accent)",
						color: "white",
						fontSize: 12,
						fontWeight: 700,
						flexShrink: 0,
					}}
				>
					{props.number}
				</span>
				<span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>
					{props.title}
					{props.optional && (
						<span
							style={{
								marginLeft: 8,
								fontSize: 11,
								fontWeight: 400,
								color: "var(--text-muted)",
							}}
						>
							optional
						</span>
					)}
				</span>
			</div>
			<div style={{ paddingLeft: 30 }}>{props.children}</div>
		</div>
	)
}

function CopyBlock(props: {
	code: string
	language?: string
	mono?: boolean
	compact?: boolean
}) {
	const [copied, setCopied] = useState(false)

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(props.code)
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		} catch {
			// clipboard API can fail in non-secure contexts
		}
	}

	return (
		<div
			style={{
				position: "relative",
				background: "var(--bg-primary)",
				border: "1px solid var(--border)",
				borderRadius: 6,
				padding: props.compact ? "8px 12px" : "10px 12px",
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
				fontSize: props.compact ? 13 : 12,
				color: "var(--text-primary)",
				overflowX: "auto",
				whiteSpace: "pre",
				lineHeight: 1.5,
			}}
		>
			<button
				type="button"
				onClick={handleCopy}
				style={{
					position: "absolute",
					top: 6,
					right: 6,
					padding: "3px 8px",
					fontSize: 11,
					background: copied ? "var(--success)" : "var(--bg-tertiary)",
					color: copied ? "white" : "var(--text-secondary)",
					border: "1px solid var(--border)",
					borderRadius: 4,
					cursor: "pointer",
					fontFamily: "system-ui, sans-serif",
				}}
				aria-label="Copy to clipboard"
				title="Copy"
			>
				{copied ? "Copied" : "Copy"}
			</button>
			<span style={{ paddingRight: 60 }}>{props.code}</span>
		</div>
	)
}

const inlineCode: React.CSSProperties = {
	background: "var(--bg-primary)",
	padding: "1px 5px",
	borderRadius: 3,
	fontSize: 11.5,
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
}

function Field(props: {
	label: string
	hint?: string
	required?: boolean
	children: React.ReactNode
}) {
	return (
		<div style={{ marginBottom: 16 }}>
			<label
				style={{
					display: "block",
					fontSize: 14,
					fontWeight: 600,
					marginBottom: 6,
					color: "var(--text-primary)",
				}}
			>
				{props.label}
				{props.required && <span style={{ color: "var(--error)" }}> *</span>}
			</label>
			{props.children}
			{props.hint && (
				<div
					style={{
						marginTop: 4,
						fontSize: 12,
						color: "var(--text-secondary)",
					}}
				>
					{props.hint}
				</div>
			)}
		</div>
	)
}
