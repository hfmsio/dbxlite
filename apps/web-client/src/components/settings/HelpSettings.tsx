import type React from "react";

// Shared styles
const sectionStyle: React.CSSProperties = {
	marginBottom: 24,
};

const sectionTitleStyle: React.CSSProperties = {
	fontSize: 14,
	fontWeight: 600,
	color: "var(--text-primary)",
	marginBottom: 12,
	borderBottom: "1px solid var(--border)",
	paddingBottom: 8,
};

const tableStyle: React.CSSProperties = {
	width: "100%",
	borderCollapse: "collapse",
	fontSize: 12,
};

const thStyle: React.CSSProperties = {
	textAlign: "left",
	padding: "6px 12px",
	borderBottom: "1px solid var(--border)",
	color: "var(--text-secondary)",
	fontWeight: 500,
};

const tdStyle: React.CSSProperties = {
	padding: "6px 12px",
	borderBottom: "1px solid var(--border-light)",
	color: "var(--text-primary)",
};

const kbdStyle: React.CSSProperties = {
	display: "inline-block",
	padding: "2px 6px",
	fontSize: 11,
	fontFamily: "monospace",
	backgroundColor: "var(--bg-tertiary)",
	border: "1px solid var(--border)",
	borderRadius: 4,
	marginRight: 4,
};

const noteStyle: React.CSSProperties = {
	fontSize: 12,
	color: "var(--text-muted)",
	marginTop: 8,
	padding: "8px 12px",
	backgroundColor: "var(--bg-secondary)",
	borderRadius: 6,
	borderLeft: "3px solid var(--accent)",
};

const warningStyle: React.CSSProperties = {
	fontSize: 12,
	color: "var(--text-primary)",
	marginTop: 8,
	padding: "12px",
	backgroundColor: "rgba(245, 158, 11, 0.1)",
	borderRadius: 6,
	borderLeft: "3px solid #f59e0b",
};

const linkStyle: React.CSSProperties = {
	color: "var(--accent)",
	textDecoration: "none",
	fontWeight: 500,
};

function Kbd({ children }: { children: React.ReactNode }) {
	return <span style={kbdStyle}>{children}</span>;
}

function HelpSettings() {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
			{/* Warning Banner */}
			<div style={warningStyle}>
				<strong style={{ color: "#f59e0b" }}>EXPERIMENTAL SOFTWARE</strong>
				<p style={{ margin: "8px 0 0 0", fontSize: 11 }}>
					dbxlite is experimental software in active development. All features are subject to change without notice.
					Always keep separate backups of your SQL files and data.
				</p>
			</div>

			{/* Quick Links */}
			<div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
				<a href="/examples" style={linkStyle}>SQL Examples</a>
				<a href="/screenshots" style={linkStyle}>Screenshots</a>
			</div>

			{/* Two Column Layout */}
			<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
				{/* Left Column */}
				<div>
					{/* Editor Shortcuts */}
					<div style={sectionStyle}>
						<h3 style={sectionTitleStyle}>Editor Shortcuts</h3>
						<table style={tableStyle}>
							<thead>
								<tr>
									<th style={{ ...thStyle, width: "55%" }}>Shortcut</th>
									<th style={thStyle}>Action</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td style={tdStyle}><Kbd>Cmd/Ctrl</Kbd>+<Kbd>Enter</Kbd></td>
									<td style={tdStyle}>Execute query (or selection)</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>Cmd/Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>F</Kbd></td>
									<td style={tdStyle}>Format SQL</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>Cmd/Ctrl</Kbd>+<Kbd>S</Kbd></td>
									<td style={tdStyle}>Save query</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>Cmd/Ctrl</Kbd>+<Kbd>O</Kbd></td>
									<td style={tdStyle}>Open file</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>Cmd/Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>E</Kbd></td>
									<td style={tdStyle}>Toggle explorer</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>Cmd/Ctrl</Kbd>+<Kbd>⌥/Alt</Kbd>+<Kbd>T</Kbd></td>
									<td style={tdStyle}>New tab</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>Cmd/Ctrl</Kbd>+<Kbd>⌥/Alt</Kbd>+<Kbd>W</Kbd></td>
									<td style={tdStyle}>Close tab</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>⌥/Alt</Kbd>+<Kbd>]</Kbd></td>
									<td style={tdStyle}>Next tab</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>⌥/Alt</Kbd>+<Kbd>[</Kbd></td>
									<td style={tdStyle}>Previous tab</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>Cmd/Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>K</Kbd></td>
									<td style={tdStyle}>Rotate theme</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>Escape</Kbd></td>
									<td style={tdStyle}>Close dialogs</td>
								</tr>
							</tbody>
						</table>
					</div>

					{/* Explorer Tree Shortcuts */}
					<div style={sectionStyle}>
						<h3 style={sectionTitleStyle}>Explorer Tree</h3>
						<table style={tableStyle}>
							<thead>
								<tr>
									<th style={{ ...thStyle, width: "55%" }}>Shortcut</th>
									<th style={thStyle}>Action</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td style={tdStyle}><Kbd>↑</Kbd> <Kbd>↓</Kbd></td>
									<td style={tdStyle}>Navigate tree nodes</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>→</Kbd></td>
									<td style={tdStyle}>Expand node</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>←</Kbd></td>
									<td style={tdStyle}>Collapse node</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>Enter</Kbd></td>
									<td style={tdStyle}>Open context menu</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>Delete</Kbd> / <Kbd>Backspace</Kbd></td>
									<td style={tdStyle}>Remove file</td>
								</tr>
							</tbody>
						</table>
					</div>

					{/* Results Grid Shortcuts */}
					<div style={sectionStyle}>
						<h3 style={sectionTitleStyle}>Results Grid</h3>
						<table style={tableStyle}>
							<thead>
								<tr>
									<th style={{ ...thStyle, width: "55%" }}>Shortcut</th>
									<th style={thStyle}>Action</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td style={tdStyle}><Kbd>Enter</Kbd></td>
									<td style={tdStyle}>Open cell in modal</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>↑</Kbd> <Kbd>↓</Kbd> <Kbd>←</Kbd> <Kbd>→</Kbd> (in modal)</td>
									<td style={tdStyle}>Navigate cells</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>Shift</Kbd>+<Kbd>↑↓←→</Kbd></td>
									<td style={tdStyle}>Multi-cell selection</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>Page Up</Kbd> / <Kbd>Page Down</Kbd></td>
									<td style={tdStyle}>Scroll results</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>Cmd/Ctrl</Kbd>+<Kbd>↑↓←→</Kbd></td>
									<td style={tdStyle}>Jump to first/last row/col</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>Cmd/Ctrl</Kbd>+<Kbd>C</Kbd></td>
									<td style={tdStyle}>Copy cells</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>Shift</Kbd>+<Kbd>Cmd/Ctrl</Kbd>+<Kbd>C</Kbd></td>
									<td style={tdStyle}>Copy with headers</td>
								</tr>
							</tbody>
						</table>
					</div>

					{/* Drag & Drop */}
					<div style={sectionStyle}>
						<h3 style={sectionTitleStyle}>Drag & Drop</h3>
						<table style={tableStyle}>
							<thead>
								<tr>
									<th style={{ ...thStyle, width: "55%" }}>Action</th>
									<th style={thStyle}>Result</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td style={tdStyle}>Upload button</td>
									<td style={tdStyle}>Zero-copy (file handle)</td>
								</tr>
								<tr>
									<td style={tdStyle}>Drag from Finder</td>
									<td style={tdStyle}>Loads to memory</td>
								</tr>
								<tr>
									<td style={tdStyle}>Drag to Editor</td>
									<td style={tdStyle}>Insert SQL query</td>
								</tr>
								<tr>
									<td style={tdStyle}>Drag to Trash</td>
									<td style={tdStyle}>Delete file</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>

				{/* Right Column */}
				<div>
					{/* Context Menu - Files */}
					<div style={sectionStyle}>
						<h3 style={sectionTitleStyle}>Context Menu - Files</h3>
						<table style={tableStyle}>
							<thead>
								<tr>
									<th style={{ ...thStyle, width: "55%" }}>Action</th>
									<th style={thStyle}>Description</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td style={tdStyle}>Select All Columns</td>
									<td style={tdStyle}>SELECT * FROM file</td>
								</tr>
								<tr>
									<td style={tdStyle}>Select with Columns</td>
									<td style={tdStyle}>SELECT col1, col2, ...</td>
								</tr>
								<tr>
									<td style={tdStyle}>Preview Data</td>
									<td style={tdStyle}>SELECT * ... LIMIT 100</td>
								</tr>
								<tr>
									<td style={tdStyle}>Describe Schema</td>
									<td style={tdStyle}>DESCRIBE SELECT * FROM ...</td>
								</tr>
								<tr>
									<td style={tdStyle}>Profile Data</td>
									<td style={tdStyle}>SUMMARIZE SELECT * FROM ...</td>
								</tr>
								<tr>
									<td style={tdStyle}>Refresh Metadata</td>
									<td style={tdStyle}>Re-introspect schema/rows</td>
								</tr>
								<tr>
									<td style={tdStyle}>Re-upload File</td>
									<td style={tdStyle}>Replace from disk</td>
								</tr>
								<tr>
									<td style={tdStyle}>Remove from Workspace</td>
									<td style={tdStyle}>Delete from explorer</td>
								</tr>
							</tbody>
						</table>
					</div>

					{/* Context Menu - Databases */}
					<div style={sectionStyle}>
						<h3 style={sectionTitleStyle}>Context Menu - Databases</h3>
						<table style={tableStyle}>
							<thead>
								<tr>
									<th style={{ ...thStyle, width: "55%" }}>Action</th>
									<th style={thStyle}>Description</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td style={tdStyle}>Refresh Metadata</td>
									<td style={tdStyle}>Refresh schema info</td>
								</tr>
								<tr>
									<td style={tdStyle}>Enable Write Mode</td>
									<td style={tdStyle}>Reattach as READ_WRITE</td>
								</tr>
								<tr>
									<td style={tdStyle}>Enable Read-Only</td>
									<td style={tdStyle}>Reattach as READ_ONLY</td>
								</tr>
								<tr>
									<td style={tdStyle}>Reattach Database</td>
									<td style={tdStyle}>Re-introspect from disk</td>
								</tr>
								<tr>
									<td style={tdStyle}>Detach Database</td>
									<td style={tdStyle}>Remove from session</td>
								</tr>
							</tbody>
						</table>
					</div>

					{/* Context Menu - Tables */}
					<div style={sectionStyle}>
						<h3 style={sectionTitleStyle}>Context Menu - Tables</h3>
						<table style={tableStyle}>
							<thead>
								<tr>
									<th style={{ ...thStyle, width: "55%" }}>Action</th>
									<th style={thStyle}>Description</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td style={tdStyle}>Select All Columns</td>
									<td style={tdStyle}>SELECT * FROM table</td>
								</tr>
								<tr>
									<td style={tdStyle}>Select with Columns</td>
									<td style={tdStyle}>SELECT col1, col2, ...</td>
								</tr>
								<tr>
									<td style={tdStyle}>Preview Data</td>
									<td style={tdStyle}>SELECT * ... LIMIT 100</td>
								</tr>
								<tr>
									<td style={tdStyle}>Count Rows</td>
									<td style={tdStyle}>SELECT COUNT(*)</td>
								</tr>
							</tbody>
						</table>
					</div>

					{/* Mouse Actions */}
					<div style={sectionStyle}>
						<h3 style={sectionTitleStyle}>Mouse Actions</h3>
						<table style={tableStyle}>
							<thead>
								<tr>
									<th style={{ ...thStyle, width: "55%" }}>Action</th>
									<th style={thStyle}>Result</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td style={tdStyle}>Click row number</td>
									<td style={tdStyle}>Select entire row</td>
								</tr>
								<tr>
									<td style={tdStyle}>Click column header</td>
									<td style={tdStyle}>Sort by column</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>Option/Alt</Kbd>+click header</td>
									<td style={tdStyle}>Select entire column</td>
								</tr>
								<tr>
									<td style={tdStyle}><Kbd>Shift</Kbd>+click header</td>
									<td style={tdStyle}>Add column to selection</td>
								</tr>
								<tr>
									<td style={tdStyle}>Double-click table</td>
									<td style={tdStyle}>Run SELECT * query</td>
								</tr>
								<tr>
									<td style={tdStyle}>Right-click</td>
									<td style={tdStyle}>Context menu</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
			</div>

			{/* ReadOnly vs ReadWrite */}
			<div style={sectionStyle}>
				<h3 style={sectionTitleStyle}>DuckDB Read/Write Modes</h3>
				<table style={tableStyle}>
					<thead>
						<tr>
							<th style={{ ...thStyle, width: "20%" }}>Mode</th>
							<th style={{ ...thStyle, width: "15%" }}>Badge</th>
							<th style={{ ...thStyle, width: "35%" }}>How to Set</th>
							<th style={thStyle}>Capabilities</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td style={tdStyle}>READ_ONLY</td>
							<td style={tdStyle}>🔒 RO</td>
							<td style={tdStyle}>Upload via button (default)</td>
							<td style={tdStyle}>SELECT only, safe</td>
						</tr>
						<tr>
							<td style={tdStyle}>READ_WRITE</td>
							<td style={tdStyle}>✏️ RW</td>
							<td style={tdStyle}>Drag & drop, or toggle in context menu</td>
							<td style={tdStyle}>CREATE, INSERT, UPDATE, DELETE</td>
						</tr>
					</tbody>
				</table>
				<div style={{ ...noteStyle, marginTop: 12 }}>
					<strong>Toggle Mode:</strong> Right-click database → "Enable Write Mode" or "Enable Read-Only"<br/>
					<strong>Warning:</strong> Changes in READ_WRITE mode persist to the original file on disk.
				</div>
			</div>

			{/* File Persistence */}
			<div style={sectionStyle}>
				<h3 style={sectionTitleStyle}>File Persistence (Zero-Copy)</h3>
				<div style={noteStyle}>
					When you upload files using the <strong>Upload button</strong> (not drag & drop):
					<ul style={{ margin: "8px 0 0 16px", padding: 0 }}>
						<li>Files are accessed via OPFS (file handle)</li>
						<li>On your next visit, files show a "Reattach" option</li>
						<li>Grant browser permission when asked</li>
						<li>Access files across sessions without re-uploading</li>
					</ul>
				</div>
			</div>

			{/* Themes */}
			<div style={sectionStyle}>
				<h3 style={sectionTitleStyle}>Available Themes</h3>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
					<div style={{
						padding: 12,
						borderRadius: 6,
						backgroundColor: "#1e1e1e",
						color: "#d4d4d4",
						textAlign: "center",
						fontSize: 11,
						border: "1px solid #333",
					}}>
						VS Dark
					</div>
					<div style={{
						padding: 12,
						borderRadius: 6,
						backgroundColor: "#ffffff",
						color: "#000000",
						textAlign: "center",
						fontSize: 11,
						border: "1px solid #ddd",
					}}>
						VS Light
					</div>
					<div style={{
						padding: 12,
						borderRadius: 6,
						backgroundColor: "#fdf6e3",
						color: "#657b83",
						textAlign: "center",
						fontSize: 11,
						border: "1px solid #d3cbb7",
					}}>
						Solarized
					</div>
					<div style={{
						padding: 12,
						borderRadius: 6,
						backgroundColor: "#fafafa",
						color: "#5c6166",
						textAlign: "center",
						fontSize: 11,
						border: "1px solid #d9d9d9",
					}}>
						Ayu Light
					</div>
					<div style={{
						padding: 12,
						borderRadius: 6,
						backgroundColor: "#282a36",
						color: "#f8f8f2",
						textAlign: "center",
						fontSize: 11,
						border: "1px solid #44475a",
					}}>
						Dracula
					</div>
					<div style={{
						padding: 12,
						borderRadius: 6,
						backgroundColor: "#282c34",
						color: "#abb2bf",
						textAlign: "center",
						fontSize: 11,
						border: "1px solid #3e4451",
					}}>
						One Dark
					</div>
					<div style={{
						padding: 12,
						borderRadius: 6,
						backgroundColor: "#2e3440",
						color: "#eceff4",
						textAlign: "center",
						fontSize: 11,
						border: "1px solid #3b4252",
					}}>
						Nord
					</div>
					<div style={{
						padding: 12,
						borderRadius: 6,
						backgroundColor: "#1a1b26",
						color: "#a9b1d6",
						textAlign: "center",
						fontSize: 11,
						border: "1px solid #24283b",
					}}>
						Tokyo Night
					</div>
					<div style={{
						padding: 12,
						borderRadius: 6,
						backgroundColor: "#ffffff",
						color: "#24292e",
						textAlign: "center",
						fontSize: 11,
						border: "1px solid #e1e4e8",
					}}>
						GitHub Light
					</div>
					<div style={{
						padding: 12,
						borderRadius: 6,
						backgroundColor: "#1e1e2e",
						color: "#cdd6f4",
						textAlign: "center",
						fontSize: 11,
						border: "1px solid #313244",
					}}>
						Catppuccin
					</div>
				</div>
				<div style={{ ...noteStyle, marginTop: 12 }}>
					Change theme via dropdown or <Kbd>Cmd/Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>K</Kbd> to rotate.
				</div>
			</div>

			{/* Export Options */}
			<div style={sectionStyle}>
				<h3 style={sectionTitleStyle}>Export Options</h3>
				<table style={tableStyle}>
					<thead>
						<tr>
							<th style={{ ...thStyle, width: "30%" }}>Format</th>
							<th style={thStyle}>Use Case</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td style={tdStyle}>CSV</td>
							<td style={tdStyle}>Spreadsheets, general use</td>
						</tr>
						<tr>
							<td style={tdStyle}>JSON</td>
							<td style={tdStyle}>APIs, structured data</td>
						</tr>
						<tr>
							<td style={tdStyle}>Parquet</td>
							<td style={tdStyle}>Analytics, columnar storage</td>
						</tr>
						<tr>
							<td style={tdStyle}>Clipboard</td>
							<td style={tdStyle}>Paste into other apps</td>
						</tr>
					</tbody>
				</table>
				<div style={{ ...noteStyle, marginTop: 12 }}>
					<strong>Tip:</strong> Configure copy delimiter (Tab/Comma/Pipe) in Formatting settings.
				</div>
			</div>

			{/* Best Practices */}
			<div style={sectionStyle}>
				<h3 style={sectionTitleStyle}>Best Practices</h3>
				<div style={warningStyle}>
					<ul style={{ margin: 0, paddingLeft: 20, fontSize: 11, lineHeight: 1.6 }}>
						<li><strong>Keep backups:</strong> Always maintain a separate copy of your SQL files and data</li>
						<li><strong>Avoid ORDER BY on large tables:</strong> Can cause memory issues in WASM</li>
						<li><strong>Use LIMIT:</strong> Always add LIMIT to exploratory queries</li>
						<li><strong>Memory limits:</strong> Browser WASM has ~2-4GB memory limit. Avoid operations that load entire large datasets into memory (e.g., ORDER BY, window functions on large tables, SELECT * without LIMIT, large JOINs, heavy aggregations). Feel free to experiment - what works depends on your data size!</li>
						<li><strong>Large files are OK:</strong> You can attach databases of any size (50GB+) via OPFS - it's just file permission, not memory loading</li>
						<li><strong>Session data:</strong> Data in "Session" tables is lost on page refresh</li>
					</ul>
				</div>
			</div>

			{/* DDL/DML Warnings */}
			<div style={sectionStyle}>
				<h3 style={sectionTitleStyle}>DDL/DML Operations</h3>
				<div style={warningStyle}>
					<strong style={{ color: "#f59e0b" }}>CREATE, INSERT, UPDATE, DELETE Caution</strong>
					<ul style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 11, lineHeight: 1.6 }}>
						<li><strong>CTAS (CREATE TABLE AS):</strong> Loads entire result set into memory. Use LIMIT for large datasets or process in batches.</li>
						<li><strong>Large INSERTs:</strong> Bulk inserts consume memory. Consider batching (e.g., INSERT ... LIMIT 100000 OFFSET 0, then OFFSET 100000, etc.)</li>
						<li><strong>Session tables:</strong> DDL/DML on session tables only affects memory - lost on refresh</li>
						<li><strong>Attached databases (READ_WRITE):</strong> Changes are permanent and written to your actual files on disk. Keep backups!</li>
						<li><strong>Test first:</strong> Always test DDL/DML operations with small samples before running on large datasets</li>
					</ul>
				</div>
			</div>

			{/* File Management Note */}
			<div style={sectionStyle}>
				<h3 style={sectionTitleStyle}>File Management</h3>
				<div style={noteStyle}>
					<strong>Trash / Remove:</strong> The trash button and "Remove from Workspace" do NOT delete your actual files.
					They only clear file handles and memory references in dbxlite. Your original files on disk remain untouched.
				</div>
			</div>

			{/* BigQuery Connection Guide */}
			<div style={sectionStyle}>
				<h3 style={sectionTitleStyle}>How to Connect BigQuery</h3>
				<p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
					Connect to Google BigQuery for cloud data analysis. You'll need to create OAuth credentials in Google Cloud Console.
				</p>

				<div style={{ marginBottom: 16 }}>
					<strong style={{ fontSize: 12, color: "var(--text-primary)" }}>Step 1: Google Cloud Console Setup</strong>
					<ol style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.8 }}>
						<li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" style={linkStyle}>console.cloud.google.com</a></li>
						<li>Create a new project or select an existing one</li>
						<li>Make sure BigQuery API is enabled:
							<ul style={{ margin: "4px 0", paddingLeft: 16 }}>
								<li>Go to <strong>APIs & Services → Library</strong></li>
								<li>Search for "BigQuery API"</li>
								<li>Click <strong>Enable</strong> if not already enabled</li>
							</ul>
						</li>
					</ol>
				</div>

				<div style={{ marginBottom: 16 }}>
					<strong style={{ fontSize: 12, color: "var(--text-primary)" }}>Step 2: Create OAuth Credentials</strong>
					<ol style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.8 }}>
						<li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={linkStyle}>APIs & Services → Credentials</a></li>
						<li>Click <strong>+ CREATE CREDENTIALS</strong> → <strong>OAuth client ID</strong></li>
						<li>If prompted, configure the OAuth consent screen first:
							<ul style={{ margin: "4px 0", paddingLeft: 16 }}>
								<li>User Type: <strong>External</strong> (or Internal if you have Google Workspace)</li>
								<li>App name: anything (e.g., "dbxlite")</li>
								<li>User support email: your email</li>
								<li>Developer contact: your email</li>
								<li>Save and continue through the remaining steps</li>
							</ul>
						</li>
						<li>Back to Credentials, create OAuth client ID:
							<ul style={{ margin: "4px 0", paddingLeft: 16 }}>
								<li>Application type: <strong>Web application</strong></li>
								<li>Name: anything (e.g., "dbxlite-client")</li>
								<li>Authorized JavaScript origins (add both for local + production):
									<div style={{ marginTop: 4, marginBottom: 4 }}>
										<code style={{ fontSize: 10, backgroundColor: "var(--bg-tertiary)", padding: "2px 6px", borderRadius: 3, display: "inline-block", marginBottom: 2 }}>http://localhost:5173</code><br/>
										<code style={{ fontSize: 10, backgroundColor: "var(--bg-tertiary)", padding: "2px 6px", borderRadius: 3, display: "inline-block" }}>https://dbxlite.vercel.app</code>
									</div>
								</li>
								<li>Authorized redirect URIs (add both):
									<div style={{ marginTop: 4, marginBottom: 4 }}>
										<code style={{ fontSize: 10, backgroundColor: "var(--bg-tertiary)", padding: "2px 6px", borderRadius: 3, display: "inline-block", marginBottom: 2 }}>http://localhost:5173/oauth-callback</code><br/>
										<code style={{ fontSize: 10, backgroundColor: "var(--bg-tertiary)", padding: "2px 6px", borderRadius: 3, display: "inline-block" }}>https://dbxlite.vercel.app/oauth-callback</code>
									</div>
								</li>
							</ul>
						</li>
						<li>Click <strong>Create</strong></li>
						<li>Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> from the popup</li>
					</ol>
				</div>

				<div style={{ marginBottom: 16 }}>
					<strong style={{ fontSize: 12, color: "var(--text-primary)" }}>Step 3: Connect in dbxlite</strong>
					<ol style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.8 }}>
						<li>Go to <strong>Settings → Connections</strong> tab</li>
						<li>Click <strong>Configure</strong> on the BigQuery card</li>
						<li>Paste your <strong>Client ID</strong> (ends with <code style={{ fontSize: 10 }}>.apps.googleusercontent.com</code>)</li>
						<li>Paste your <strong>Client Secret</strong> (starts with <code style={{ fontSize: 10 }}>GOCSPX-</code>)</li>
						<li>Click <strong>Connect to BigQuery</strong></li>
						<li>A Google sign-in popup will appear - sign in and grant permissions</li>
						<li>Once connected, expand the <strong>BigQuery (Cloud)</strong> section in the explorer</li>
						<li>Double-click "Double-click to load" to load your projects/datasets</li>
					</ol>
				</div>

				<div style={noteStyle}>
					<strong>Troubleshooting:</strong>
					<ul style={{ margin: "4px 0 0 0", paddingLeft: 16, fontSize: 11 }}>
						<li><strong>Popup blocked:</strong> Allow popups for this site in your browser settings</li>
						<li><strong>"Access blocked":</strong> If your OAuth consent screen is in "Testing" mode, add your email to "Test users" in GCP Console</li>
						<li><strong>No datasets showing:</strong> Ensure your Google account has BigQuery access to the projects</li>
						<li><strong>Credentials stored locally:</strong> Your credentials are stored in browser local storage only - never sent to any server</li>
					</ul>
				</div>
			</div>

			{/* Execution Modes */}
			<div style={sectionStyle}>
				<h3 style={sectionTitleStyle}>Execution Modes</h3>
				<p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
					dbxlite can run in two modes depending on how you access it. The mode is auto-detected and shown in the header badge.
				</p>
				<table style={tableStyle}>
					<thead>
						<tr>
							<th style={{ ...thStyle, width: "15%" }}>Mode</th>
							<th style={{ ...thStyle, width: "25%" }}>How to Use</th>
							<th style={{ ...thStyle, width: "30%" }}>Capabilities</th>
							<th style={thStyle}>Limitations</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td style={tdStyle}>
								<span style={{
									display: "inline-block",
									padding: "2px 8px",
									backgroundColor: "rgba(59, 130, 246, 0.15)",
									color: "#3b82f6",
									borderRadius: 4,
									fontSize: 11,
									fontWeight: 600,
								}}>WASM</span>
							</td>
							<td style={tdStyle}>
								Visit <code style={{ fontSize: 10 }}>sql.dbxlite.com</code> directly in browser
							</td>
							<td style={tdStyle}>
								<ul style={{ margin: 0, paddingLeft: 16, fontSize: 11 }}>
									<li>Zero-copy file handles (Chrome)</li>
									<li>BigQuery browser connector</li>
									<li>Works offline after first load</li>
								</ul>
							</td>
							<td style={tdStyle}>
								<ul style={{ margin: 0, paddingLeft: 16, fontSize: 11 }}>
									<li>~2-4GB memory limit</li>
									<li>Limited extensions</li>
									<li>No filesystem access</li>
								</ul>
							</td>
						</tr>
						<tr>
							<td style={tdStyle}>
								<span style={{
									display: "inline-block",
									padding: "2px 8px",
									backgroundColor: "rgba(34, 197, 94, 0.15)",
									color: "#22c55e",
									borderRadius: 4,
									fontSize: 11,
									fontWeight: 600,
								}}>Server</span>
							</td>
							<td style={tdStyle}>
								Run <code style={{ fontSize: 10 }}>duckdb -ui</code> with custom UI URL
							</td>
							<td style={tdStyle}>
								<ul style={{ margin: 0, paddingLeft: 16, fontSize: 11 }}>
									<li>Full native DuckDB engine</li>
									<li>All extensions available</li>
									<li>Direct filesystem access</li>
									<li>No memory limits</li>
								</ul>
							</td>
							<td style={tdStyle}>
								<ul style={{ margin: 0, paddingLeft: 16, fontSize: 11 }}>
									<li>Requires DuckDB CLI</li>
									<li>Local machine only</li>
								</ul>
							</td>
						</tr>
					</tbody>
				</table>

				<div style={{ marginTop: 16 }}>
					<strong style={{ fontSize: 12, color: "var(--text-primary)" }}>How to Use Server Mode</strong>
					<ol style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.8 }}>
						<li>Install DuckDB CLI: <a href="https://duckdb.org/docs/installation" target="_blank" rel="noopener noreferrer" style={linkStyle}>duckdb.org/docs/installation</a></li>
						<li>Set the custom UI URL:
							<div style={{ marginTop: 4 }}>
								<code style={{ fontSize: 10, backgroundColor: "var(--bg-tertiary)", padding: "4px 8px", borderRadius: 3, display: "block" }}>
									export ui_remote_url="https://sql.dbxlite.com"
								</code>
							</div>
						</li>
						<li>Launch DuckDB with UI:
							<div style={{ marginTop: 4 }}>
								<code style={{ fontSize: 10, backgroundColor: "var(--bg-tertiary)", padding: "4px 8px", borderRadius: 3, display: "block" }}>
									duckdb -unsigned -ui
								</code>
							</div>
						</li>
						<li>Open <code style={{ fontSize: 10 }}>http://localhost:4213</code> in your browser</li>
					</ol>
				</div>

				<div style={{ ...noteStyle, marginTop: 16 }}>
					<strong>Note:</strong> The <code style={{ fontSize: 10 }}>-unsigned</code> flag is required for custom UI URLs. This is a DuckDB security measure since custom UIs have full access to your data.
				</div>

				<div style={{ marginTop: 16 }}>
					<strong style={{ fontSize: 12, color: "var(--text-primary)" }}>BigQuery in Server Mode</strong>
					<p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "8px 0" }}>
						In Server mode, use DuckDB's native BigQuery extension instead of the browser connector:
					</p>
					<code style={{ fontSize: 10, backgroundColor: "var(--bg-tertiary)", padding: "8px", borderRadius: 3, display: "block", lineHeight: 1.6 }}>
						INSTALL bigquery;<br/>
						LOAD bigquery;<br/>
						SELECT * FROM bigquery_scan('project.dataset.table');
					</code>
					<p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
						See <a href="https://duckdb.org/docs/extensions/bigquery" target="_blank" rel="noopener noreferrer" style={linkStyle}>DuckDB BigQuery Extension docs</a> for authentication setup.
					</p>
				</div>
			</div>

			{/* Browser Compatibility */}
			<div style={sectionStyle}>
				<h3 style={sectionTitleStyle}>Browser Compatibility</h3>
				<div style={warningStyle}>
					<strong style={{ color: "#f59e0b" }}>Only tested in Google Chrome</strong>
					<p style={{ margin: "8px 0 0 0", fontSize: 11 }}>
						dbxlite is developed and tested in Google Chrome. Other browsers may have limited functionality or unexpected behavior.
					</p>
				</div>
				<table style={{ ...tableStyle, marginTop: 12 }}>
					<thead>
						<tr>
							<th style={{ ...thStyle, width: "30%" }}>Browser</th>
							<th style={{ ...thStyle, width: "35%" }}>Zero-Copy (File Handle)</th>
							<th style={thStyle}>Basic Features</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td style={tdStyle}>Chrome / Edge</td>
							<td style={tdStyle}>86+ Full</td>
							<td style={tdStyle}>Full</td>
						</tr>
						<tr>
							<td style={tdStyle}>Firefox</td>
							<td style={{ ...tdStyle, color: "#ef4444" }}>Not supported</td>
							<td style={tdStyle}>Partial (drag & drop only)</td>
						</tr>
						<tr>
							<td style={tdStyle}>Safari</td>
							<td style={{ ...tdStyle, color: "#ef4444" }}>Not supported</td>
							<td style={tdStyle}>Partial (drag & drop only)</td>
						</tr>
					</tbody>
				</table>
				<div style={{ ...noteStyle, marginTop: 12 }}>
					<strong>Zero-Copy</strong> uses File System Access API (showOpenFilePicker) - only available in Chromium browsers.<br/>
					Firefox/Safari users can still use drag & drop, which loads files into memory.
				</div>
			</div>

		</div>
	);
}

export default HelpSettings;
