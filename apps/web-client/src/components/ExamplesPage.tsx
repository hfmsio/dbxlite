/**
 * SQL Examples Page
 *
 * Static page with SQL examples for DuckDB, BigQuery, and Snowflake.
 * Access via /examples route.
 */

import type React from "react";
import { useState } from "react";
import { createLogger } from "../utils/logger";

const logger = createLogger("ExamplesPage");

const containerStyle: React.CSSProperties = {
	minHeight: "100vh",
	backgroundColor: "var(--bg-primary)",
	color: "var(--text-primary)",
	padding: 40,
};

const headerStyle: React.CSSProperties = {
	display: "flex",
	justifyContent: "space-between",
	alignItems: "center",
	marginBottom: 40,
};

const titleStyle: React.CSSProperties = {
	fontSize: 32,
	fontWeight: 700,
	color: "var(--text-primary)",
};

const backLinkStyle: React.CSSProperties = {
	padding: "10px 20px",
	backgroundColor: "var(--accent)",
	color: "white",
	textDecoration: "none",
	borderRadius: 8,
	fontSize: 14,
	fontWeight: 500,
};

const sectionStyle: React.CSSProperties = {
	marginBottom: 48,
};

const sectionTitleStyle: React.CSSProperties = {
	fontSize: 20,
	fontWeight: 600,
	color: "var(--text-primary)",
	marginBottom: 16,
	paddingBottom: 8,
	borderBottom: "2px solid var(--accent)",
	display: "flex",
	alignItems: "center",
	gap: 12,
};

const descriptionStyle: React.CSSProperties = {
	fontSize: 14,
	color: "var(--text-secondary)",
	marginBottom: 16,
	lineHeight: 1.6,
};

const codeBlockStyle: React.CSSProperties = {
	backgroundColor: "var(--bg-secondary)",
	border: "1px solid var(--border)",
	borderRadius: 8,
	padding: 16,
	marginBottom: 16,
	overflowX: "auto",
};

const codeStyle: React.CSSProperties = {
	fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
	fontSize: 13,
	lineHeight: 1.6,
	color: "var(--text-primary)",
	whiteSpace: "pre",
	display: "block",
};

const commentStyle: React.CSSProperties = {
	color: "var(--text-muted)",
	fontStyle: "italic",
};

const keywordStyle: React.CSSProperties = {
	color: "#569cd6",
	fontWeight: 500,
};

const stringStyle: React.CSSProperties = {
	color: "#ce9178",
};

const warningBoxStyle: React.CSSProperties = {
	backgroundColor: "rgba(245, 158, 11, 0.1)",
	border: "1px solid rgba(245, 158, 11, 0.3)",
	borderRadius: 8,
	padding: 16,
	marginTop: 24,
};

const warningTitleStyle: React.CSSProperties = {
	fontSize: 14,
	fontWeight: 600,
	color: "#f59e0b",
	marginBottom: 8,
};

const warningListStyle: React.CSSProperties = {
	fontSize: 13,
	color: "var(--text-secondary)",
	lineHeight: 1.8,
	paddingLeft: 20,
	margin: 0,
};

const badgeStyle: React.CSSProperties = {
	display: "inline-block",
	padding: "2px 8px",
	fontSize: 11,
	fontWeight: 500,
	borderRadius: 4,
	marginLeft: 8,
};

// Simple syntax highlighting for SQL
function formatSQL(sql: string): React.ReactNode[] {
	const keywords = /\b(SELECT|FROM|WHERE|AND|OR|AS|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|ATTACH|DETACH|DESCRIBE|SUMMARIZE|COUNT|AVG|SUM|MIN|MAX|DISTINCT|UNION|ALL|CASE|WHEN|THEN|ELSE|END|NULL|NOT|IN|LIKE|BETWEEN|EXISTS|HAVING|WITH|READ_ONLY|READ_WRITE)\b/gi;
	const strings = /('[^']*'|`[^`]*`)/g;
	const comments = /(--.*$)/gm;

	const lines = sql.split("\n");
	return lines.map((line, lineIndex) => {
		// Check if line is a comment
		if (line.trim().startsWith("--")) {
			return (
				<span key={lineIndex}>
					<span style={commentStyle}>{line}</span>
					{lineIndex < lines.length - 1 ? "\n" : ""}
				</span>
			);
		}

		// Process keywords and strings
		const parts: React.ReactNode[] = [];
		let remaining = line;
		let partIndex = 0;

		// First, extract strings
		const stringMatches: { start: number; end: number; text: string }[] = [];
		let match;
		const stringRegex = /('[^']*'|`[^`]*`)/g;
		while ((match = stringRegex.exec(line)) !== null) {
			stringMatches.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
		}

		// Build the line with highlighting
		let pos = 0;
		for (const strMatch of stringMatches) {
			// Text before string
			if (strMatch.start > pos) {
				const beforeText = line.substring(pos, strMatch.start);
				parts.push(...highlightKeywords(beforeText, partIndex));
				partIndex += 10;
			}
			// The string itself
			parts.push(<span key={partIndex++} style={stringStyle}>{strMatch.text}</span>);
			pos = strMatch.end;
		}
		// Remaining text after last string
		if (pos < line.length) {
			const afterText = line.substring(pos);
			parts.push(...highlightKeywords(afterText, partIndex));
		}

		return (
			<span key={lineIndex}>
				{parts}
				{lineIndex < lines.length - 1 ? "\n" : ""}
			</span>
		);
	});
}

function highlightKeywords(text: string, startIndex: number): React.ReactNode[] {
	const keywords = /\b(SELECT|FROM|WHERE|AND|OR|AS|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|ATTACH|DETACH|DESCRIBE|SUMMARIZE|COUNT|AVG|SUM|MIN|MAX|DISTINCT|UNION|ALL|CASE|WHEN|THEN|ELSE|END|NULL|NOT|IN|LIKE|BETWEEN|EXISTS|HAVING|WITH|READ_ONLY|READ_WRITE)\b/gi;
	const parts: React.ReactNode[] = [];
	let lastIndex = 0;
	let match;
	let index = startIndex;

	while ((match = keywords.exec(text)) !== null) {
		if (match.index > lastIndex) {
			parts.push(<span key={index++}>{text.substring(lastIndex, match.index)}</span>);
		}
		parts.push(<span key={index++} style={keywordStyle}>{match[0]}</span>);
		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < text.length) {
		parts.push(<span key={index++}>{text.substring(lastIndex)}</span>);
	}

	return parts;
}

const copyButtonStyle: React.CSSProperties = {
	position: "absolute",
	top: 8,
	right: 8,
	padding: "4px 8px",
	fontSize: 11,
	fontWeight: 500,
	backgroundColor: "var(--bg-tertiary)",
	border: "1px solid var(--border)",
	borderRadius: 4,
	color: "var(--text-secondary)",
	cursor: "pointer",
	display: "flex",
	alignItems: "center",
	gap: 4,
	transition: "all 0.15s ease",
};

function CodeBlock({ children }: { children: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(children);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			logger.error("Failed to copy to clipboard:", err);
		}
	};

	return (
		<div style={{ ...codeBlockStyle, position: "relative" }}>
			<button
				type="button"
				onClick={handleCopy}
				style={{
					...copyButtonStyle,
					backgroundColor: copied ? "rgba(16, 185, 129, 0.2)" : "var(--bg-tertiary)",
					color: copied ? "#10b981" : "var(--text-secondary)",
					borderColor: copied ? "rgba(16, 185, 129, 0.3)" : "var(--border)",
				}}
				onMouseEnter={(e) => {
					if (!copied) {
						e.currentTarget.style.backgroundColor = "var(--bg-primary)";
						e.currentTarget.style.color = "var(--text-primary)";
					}
				}}
				onMouseLeave={(e) => {
					if (!copied) {
						e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
						e.currentTarget.style.color = "var(--text-secondary)";
					}
				}}
			>
				{copied ? (
					<>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<polyline points="20 6 9 17 4 12" />
						</svg>
						Copied!
					</>
				) : (
					<>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
							<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
						</svg>
						Copy
					</>
				)}
			</button>
			<code style={codeStyle}>{formatSQL(children)}</code>
		</div>
	);
}

function ExamplesPage() {
	return (
		<div style={containerStyle}>
			<header style={headerStyle}>
				<h1 style={titleStyle}>SQL Examples</h1>
				<a href="/" style={backLinkStyle}>
					Back to App
				</a>
			</header>

			{/* DuckDB Section */}
			<section style={sectionStyle}>
				<h2 style={sectionTitleStyle}>
					<span style={{ fontSize: 24 }}>🦆</span>
					DuckDB Examples
					<span style={{ ...badgeStyle, backgroundColor: "rgba(59, 130, 246, 0.2)", color: "#3b82f6" }}>
						Local Engine
					</span>
				</h2>
				<p style={descriptionStyle}>
					DuckDB runs entirely in your browser using WebAssembly. Query local files, remote URLs,
					and create in-memory databases without any server.
				</p>

				<h3 style={{ fontSize: 16, fontWeight: 600, marginTop: 24, marginBottom: 12, color: "var(--text-primary)" }}>
					Query Local Files
				</h3>
				<CodeBlock>{`-- Query a CSV file
SELECT * FROM 'data.csv' LIMIT 100;

-- Query with column selection
SELECT name, email, created_at FROM 'users.csv' WHERE active = true;

-- Query a Parquet file (columnar format, very efficient)
SELECT * FROM 'analytics.parquet' LIMIT 100;

-- Query JSON file
SELECT * FROM 'config.json';

-- Query Excel file (single sheet)
SELECT * FROM 'report.xlsx' LIMIT 100;

-- Query specific Excel sheet
SELECT * FROM read_xlsx('report.xlsx', sheet='Orders');`}</CodeBlock>

				<h3 style={{ fontSize: 16, fontWeight: 600, marginTop: 24, marginBottom: 12, color: "var(--text-primary)" }}>
					Query Remote URLs
				</h3>
				<CodeBlock>{`-- Query remote Parquet file
SELECT * FROM 'https://example.com/data.parquet' LIMIT 100;

-- Query from Hugging Face datasets
SELECT * FROM 'https://huggingface.co/datasets/wikimedia/wikipedia/resolve/main/20231101.ab/train-00000-of-00001.parquet';

-- Query remote CSV
SELECT * FROM 'https://raw.githubusercontent.com/user/repo/main/data.csv';`}</CodeBlock>

				<h3 style={{ fontSize: 16, fontWeight: 600, marginTop: 24, marginBottom: 12, color: "var(--text-primary)" }}>
					Attach External Databases
				</h3>
				<CodeBlock>{`-- Attach database in read-only mode (safe, prevents modifications)
ATTACH 'mydb.duckdb' AS mydb (READ_ONLY);

-- Attach database in read-write mode (allows INSERT/UPDATE/DELETE)
ATTACH 'mydb.duckdb' AS mydb (READ_WRITE);

-- Query attached database
SELECT * FROM mydb.main.users;

-- Detach when done
DETACH mydb;

-- View all attached databases
SELECT * FROM duckdb_databases();`}</CodeBlock>

				<h3 style={{ fontSize: 16, fontWeight: 600, marginTop: 24, marginBottom: 12, color: "var(--text-primary)" }}>
					Create Tables in Session Database
				</h3>
				<p style={descriptionStyle}>
					Tables created without specifying a database go into the local "Session" database.
					These tables persist during your browser session but are lost on page refresh.
				</p>
				<div style={{ ...warningBoxStyle, marginBottom: 16 }}>
					<strong style={{ color: "#f59e0b", fontSize: 12 }}>Memory Warning for DDL/DML Operations</strong>
					<p style={{ margin: "8px 0 0 0", fontSize: 11, color: "var(--text-secondary)" }}>
						CREATE TABLE AS (CTAS) and large INSERT operations load data into memory. For large datasets,
						use LIMIT or process in batches. DDL (CREATE, ALTER, DROP) and DML (INSERT, UPDATE, DELETE)
						operations are powerful but can consume significant memory. Always test with small samples first.
					</p>
				</div>
				<CodeBlock>{`-- Create a simple table in session
CREATE TABLE my_data (id INTEGER, name VARCHAR, value DOUBLE);

-- Insert data
INSERT INTO my_data VALUES (1, 'Alice', 100.5);
INSERT INTO my_data VALUES (2, 'Bob', 200.0), (3, 'Charlie', 150.25);

-- Create table from literal values
CREATE TABLE my_data AS SELECT 1 as id, 'hello' as msg;

-- Create table from file (copies data into session)
CREATE TABLE users AS SELECT * FROM 'users.csv';

-- Create table from query result
CREATE TABLE summary AS
SELECT category, COUNT(*) as count, AVG(price) as avg_price
FROM 'products.parquet'
GROUP BY category;

-- Create table from remote URL
CREATE TABLE wiki_sample AS
SELECT * FROM 'https://huggingface.co/datasets/...' LIMIT 1000;

-- View your session tables
SELECT * FROM information_schema.tables WHERE table_catalog = 'memory';

-- Drop a session table
DROP TABLE my_data;`}</CodeBlock>

				<h3 style={{ fontSize: 16, fontWeight: 600, marginTop: 24, marginBottom: 12, color: "var(--text-primary)" }}>
					Create Tables in Attached Database (Persistent)
				</h3>
				<p style={descriptionStyle}>
					To persist tables, create them in an attached database file. Changes are saved to disk.
				</p>
				<div style={{ ...warningBoxStyle, marginBottom: 16 }}>
					<strong style={{ color: "#f59e0b", fontSize: 12 }}>Caution with Persistent Operations</strong>
					<p style={{ margin: "8px 0 0 0", fontSize: 11, color: "var(--text-secondary)" }}>
						Changes to attached databases (READ_WRITE mode) are written to your actual files on disk.
						INSERT, UPDATE, DELETE, and DROP operations are permanent. Keep backups of important database files.
						For large CTAS operations, consider using LIMIT and batching to avoid memory issues.
					</p>
				</div>
				<CodeBlock>{`-- First attach a database in READ_WRITE mode
ATTACH 'mydb.duckdb' AS mydb (READ_WRITE);

-- Create table in the attached database
CREATE TABLE mydb.main.users (
    id INTEGER PRIMARY KEY,
    name VARCHAR,
    email VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert data into attached database
INSERT INTO mydb.main.users (id, name, email)
VALUES (1, 'Alice', 'alice@example.com');

-- Copy data from file to attached database
CREATE TABLE mydb.main.products AS SELECT * FROM 'products.csv';

-- Copy from session table to attached database
CREATE TABLE mydb.main.backup AS SELECT * FROM my_data;`}</CodeBlock>

				<h3 style={{ fontSize: 16, fontWeight: 600, marginTop: 24, marginBottom: 12, color: "var(--text-primary)" }}>
					System Introspection
				</h3>
				<CodeBlock>{`-- View all attached databases
SELECT * FROM duckdb_databases();

-- View all available functions
SELECT * FROM duckdb_functions();

-- View tables in a database
SELECT * FROM information_schema.tables;

-- View columns of a table
SELECT * FROM information_schema.columns WHERE table_name = 'users';

-- Describe a query result schema
DESCRIBE SELECT * FROM 'data.csv';

-- Profile data statistics
SUMMARIZE SELECT * FROM 'data.parquet';`}</CodeBlock>
			</section>

			{/* BigQuery Section */}
			<section style={sectionStyle}>
				<h2 style={sectionTitleStyle}>
					<span style={{ fontSize: 24 }}>☁️</span>
					BigQuery Examples
					<span style={{ ...badgeStyle, backgroundColor: "rgba(16, 185, 129, 0.2)", color: "#10b981" }}>
						Cloud
					</span>
				</h2>
				<p style={descriptionStyle}>
					Connect to Google BigQuery for cloud data analysis. Authenticate via OAuth in the Connections settings tab.
					Note the backtick syntax for table references.
				</p>

				<CodeBlock>{`-- Basic query (note backtick syntax for project.dataset.table)
SELECT * FROM \`project-id.dataset.table\` LIMIT 100;

-- Aggregation query
SELECT airline, COUNT(*) as flight_count
FROM \`project-id.dataset.flights\`
GROUP BY airline
ORDER BY flight_count DESC;

-- Join tables
SELECT u.name, o.order_id, o.total
FROM \`project-id.dataset.users\` u
JOIN \`project-id.dataset.orders\` o ON u.id = o.user_id
WHERE o.total > 100;

-- Date filtering
SELECT *
FROM \`project-id.dataset.events\`
WHERE DATE(created_at) = CURRENT_DATE()
LIMIT 1000;`}</CodeBlock>
			</section>

			{/* Snowflake Section */}
			<section style={sectionStyle}>
				<h2 style={sectionTitleStyle}>
					<span style={{ fontSize: 24 }}>❄️</span>
					Snowflake Examples
					<span style={{ ...badgeStyle, backgroundColor: "rgba(156, 163, 175, 0.2)", color: "#9ca3af" }}>
						Coming Soon
					</span>
				</h2>
				<p style={descriptionStyle}>
					Snowflake support is planned for a future release. The syntax will follow Snowflake conventions.
				</p>

				<CodeBlock>{`-- Coming soon: Snowflake support
-- Syntax will follow Snowflake conventions

SELECT * FROM database.schema.table LIMIT 100;

SELECT category, SUM(amount) as total
FROM sales.public.transactions
WHERE transaction_date >= '2024-01-01'
GROUP BY category;`}</CodeBlock>
			</section>

			{/* Best Practices */}
			<section style={sectionStyle}>
				<div style={warningBoxStyle}>
					<h3 style={warningTitleStyle}>Best Practices & Warnings</h3>
					<ul style={warningListStyle}>
						<li><strong>Always use LIMIT:</strong> Add LIMIT to exploratory queries to avoid loading too much data into memory</li>
						<li><strong>Avoid ORDER BY on large tables:</strong> Sorting large datasets can cause memory issues in WASM</li>
						<li><strong>Keep separate backups:</strong> Always maintain backups of your SQL files and important data</li>
						<li><strong>Memory limits:</strong> Browser WASM has ~2-4GB memory limit. Avoid operations that load entire large datasets into memory (ORDER BY, window functions on large tables, SELECT * without LIMIT, large JOINs, heavy aggregations). Feel free to experiment - what works depends on your data size!</li>
						<li><strong>Large files are OK:</strong> You can attach databases of any size (50GB+) via OPFS - it's just file permission, not memory loading</li>
						<li><strong>Session tables are temporary:</strong> Data in "Session" tables is lost on page refresh</li>
						<li><strong>Use READ_ONLY mode:</strong> For databases you don't need to modify, use READ_ONLY for safety</li>
						<li><strong>Trash doesn't delete files:</strong> The trash button only clears file handles and memory in dbxlite - your original files remain on disk</li>
					</ul>
				</div>
			</section>

			{/* Quick Reference */}
			<section style={sectionStyle}>
				<h2 style={sectionTitleStyle}>
					<span style={{ fontSize: 24 }}>📋</span>
					Quick Reference
				</h2>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
					<div style={{ ...codeBlockStyle, marginBottom: 0 }}>
						<strong style={{ color: "var(--text-primary)", fontSize: 13 }}>File Formats</strong>
						<ul style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.8 }}>
							<li>CSV, TSV - Comma/tab-separated values</li>
							<li>Parquet - Columnar format (fast, compressed)</li>
							<li>JSON, JSONL - JSON and newline-delimited JSON</li>
							<li>XLSX - Excel files (supports multiple sheets)</li>
							<li>DuckDB - Native database files</li>
						</ul>
					</div>
					<div style={{ ...codeBlockStyle, marginBottom: 0 }}>
						<strong style={{ color: "var(--text-primary)", fontSize: 13 }}>Useful Functions</strong>
						<ul style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.8 }}>
							<li>DESCRIBE - Show query result schema</li>
							<li>SUMMARIZE - Profile data statistics</li>
							<li>read_xlsx(..., sheet='Name') - Read specific Excel sheet</li>
							<li>duckdb_databases() - List attached databases</li>
							<li>duckdb_functions() - List available functions</li>
						</ul>
					</div>
				</div>
			</section>
		</div>
	);
}

export default ExamplesPage;
