/**
 * ShareTabModal - build a shareable link for the current tab's SQL.
 *
 * The user picks which of the deep-link options to bake in (theme, results
 * layout, auto-run, explorer, tab name), sees a live URL preview, and copies
 * it. For SQL too long to fit in a URL, an opt-in GitHub Gist path (requires a
 * locally-stored token) uploads the SQL and shares a short `?share=gist:` link
 * carrying the same options.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import { themes } from "../themes";
import {
	type TokenCheck,
	shareWith,
	verifyGithubToken,
} from "../utils/sharingProviders";
import {
	type SharedLayout,
	generateCustomSQLURL,
} from "../utils/urlParams";
import {
	AlertTriangleIcon,
	CheckCircleIcon,
	CloseIcon,
	CopyIcon,
	PanelBottomIcon,
	PanelHiddenIcon,
	PanelRightIcon,
	ShareIcon,
} from "./Icons";

interface ShareTabModalProps {
	sql: string;
	tabName: string;
	onClose: () => void;
}

// URLs above this get unreliable in some browsers/servers; nudge to Gist.
const URL_LENGTH_LIMIT = 2000;

type LayoutChoice = SharedLayout | "";

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		// Fallback for insecure contexts / older browsers
		try {
			const ta = document.createElement("textarea");
			ta.value = text;
			ta.style.position = "fixed";
			ta.style.opacity = "0";
			document.body.appendChild(ta);
			ta.select();
			const ok = document.execCommand("copy");
			document.body.removeChild(ta);
			return ok;
		} catch {
			return false;
		}
	}
}

export default function ShareTabModal({
	sql,
	tabName,
	onClose,
}: ShareTabModalProps) {
	const editorTheme = useSettingsStore((s) => s.editorTheme);
	const resultsLayout = useSettingsStore((s) => s.resultsLayout);
	const githubToken = useSettingsStore((s) => s.githubToken);
	const setGithubToken = useSettingsStore((s) => s.setGithubToken);

	// Link options, prefilled from the user's current environment.
	const [tabNameInput, setTabNameInput] = useState(tabName);
	const [theme, setTheme] = useState<string>(editorTheme);
	const [layout, setLayout] = useState<LayoutChoice>(resultsLayout);
	const [autoRun, setAutoRun] = useState(true);
	const [showExplorer, setShowExplorer] = useState(false);

	const [copied, setCopied] = useState(false);
	const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Gist state
	const [tokenInput, setTokenInput] = useState(githubToken);
	const [tokenCheck, setTokenCheck] = useState<TokenCheck | null>(
		githubToken ? { valid: true, hasGistScope: true, message: "Saved token" } : null,
	);
	const [verifying, setVerifying] = useState(false);
	const [creatingGist, setCreatingGist] = useState(false);
	const [gistUrl, setGistUrl] = useState<string | null>(null);
	const [gistError, setGistError] = useState<string | null>(null);
	const [gistCopied, setGistCopied] = useState(false);

	// Build the shared-option query pieces once, reused by both link kinds.
	const optionParams = useMemo(() => {
		const opts: {
			tabName?: string;
			theme?: string;
			layout?: SharedLayout;
			autoRun?: boolean;
			showExplorer?: boolean;
		} = {};
		if (tabNameInput.trim()) opts.tabName = tabNameInput.trim();
		if (theme) opts.theme = theme;
		if (layout) opts.layout = layout;
		if (autoRun) opts.autoRun = true;
		if (showExplorer) opts.showExplorer = true;
		return opts;
	}, [tabNameInput, theme, layout, autoRun, showExplorer]);

	const directUrl = useMemo(
		() => generateCustomSQLURL(sql, optionParams),
		[sql, optionParams],
	);
	const tooLong = directUrl.length > URL_LENGTH_LIMIT;

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);

	useEffect(
		() => () => {
			if (copyTimer.current) clearTimeout(copyTimer.current);
		},
		[],
	);

	const handleCopy = async () => {
		if (await copyText(directUrl)) {
			setCopied(true);
			if (copyTimer.current) clearTimeout(copyTimer.current);
			copyTimer.current = setTimeout(() => setCopied(false), 1600);
		}
	};

	const handleVerifyToken = async () => {
		setVerifying(true);
		setGistError(null);
		const check = await verifyGithubToken(tokenInput);
		setTokenCheck(check);
		if (check.valid) setGithubToken(tokenInput);
		setVerifying(false);
	};

	const appendOptions = (baseUrl: string): string => {
		const u = new URL(baseUrl);
		if (optionParams.tabName) u.searchParams.set("tab", optionParams.tabName);
		if (optionParams.autoRun) u.searchParams.set("run", "true");
		if (optionParams.theme) u.searchParams.set("theme", optionParams.theme);
		if (optionParams.showExplorer)
			u.searchParams.set("explorer", "true");
		if (optionParams.layout) u.searchParams.set("layout", optionParams.layout);
		return u.toString();
	};

	const handleCreateGist = async () => {
		setCreatingGist(true);
		setGistError(null);
		setGistUrl(null);
		try {
			const result = await shareWith("gist", {
				sql,
				tabName: tabNameInput.trim() || undefined,
				filename: "query.sql",
				token: tokenInput.trim(),
			});
			setGistUrl(appendOptions(result.url));
		} catch (err) {
			setGistError(err instanceof Error ? err.message : String(err));
		} finally {
			setCreatingGist(false);
		}
	};

	const handleCopyGist = async () => {
		if (gistUrl && (await copyText(gistUrl))) {
			setGistCopied(true);
			setTimeout(() => setGistCopied(false), 1600);
		}
	};

	const darkThemes = themes.filter((t) => t.type === "dark");
	const lightThemes = themes.filter((t) => t.type === "light");

	const layoutOptions: {
		value: LayoutChoice;
		label: string;
		icon: React.ReactNode;
		title: string;
	}[] = [
		{ value: "", label: "Don't set", icon: null, title: "Let the viewer keep their own layout" },
		{ value: "bottom", label: "Below", icon: <PanelBottomIcon size={15} />, title: "Results below the editor" },
		{ value: "right", label: "Beside", icon: <PanelRightIcon size={15} />, title: "Results beside the editor" },
		{ value: "hidden", label: "Hidden", icon: <PanelHiddenIcon size={15} />, title: "Editor only until a query runs" },
	];

	const tokenValid = tokenCheck?.valid ?? false;

	return (
		<div
			role="presentation"
			onClick={onClose}
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0, 0, 0, 0.6)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 10000,
				backdropFilter: "blur(2px)",
				padding: "16px",
			}}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="share-tab-title"
				onClick={(e) => e.stopPropagation()}
				style={{
					background: "var(--bg-secondary)",
					borderRadius: "12px",
					width: "min(560px, 100%)",
					maxHeight: "90vh",
					overflowY: "auto",
					border: "1px solid var(--border-light)",
					boxShadow:
						"0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)",
				}}
			>
				{/* Header */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "10px",
						padding: "20px 24px 12px",
					}}
				>
					<ShareIcon size={18} color="var(--accent-primary, #a78bfa)" />
					<h3
						id="share-tab-title"
						style={{
							margin: 0,
							flex: 1,
							color: "var(--text-primary)",
							fontSize: "17px",
							fontWeight: 600,
						}}
					>
						Share this query
					</h3>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						title="Close (Esc)"
						style={{
							background: "transparent",
							border: "none",
							color: "var(--text-muted)",
							cursor: "pointer",
							display: "flex",
							padding: "4px",
							borderRadius: "6px",
						}}
					>
						<CloseIcon size={18} />
					</button>
				</div>

				<div
					style={{
						padding: "0 24px 24px",
						display: "flex",
						flexDirection: "column",
						gap: "16px",
					}}
				>
					{/* Tab name */}
					<Field label="Tab name">
						<input
							type="text"
							value={tabNameInput}
							onChange={(e) => setTabNameInput(e.target.value)}
							placeholder="(none)"
							style={inputStyle}
						/>
					</Field>

					{/* Theme */}
					<Field label="Theme">
						<select
							value={theme}
							onChange={(e) => setTheme(e.target.value)}
							style={inputStyle}
						>
							<option value="">Don't set (keep viewer's theme)</option>
							<optgroup label="Dark">
								{darkThemes.map((t) => (
									<option key={t.id} value={t.id}>
										{t.label}
									</option>
								))}
							</optgroup>
							<optgroup label="Light">
								{lightThemes.map((t) => (
									<option key={t.id} value={t.id}>
										{t.label}
									</option>
								))}
							</optgroup>
						</select>
					</Field>

					{/* Layout */}
					<Field label="Results layout">
						<div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
							{layoutOptions.map((opt) => {
								const active = layout === opt.value;
								return (
									<button
										key={opt.value || "none"}
										type="button"
										title={opt.title}
										onClick={() => setLayout(opt.value)}
										style={{
											display: "flex",
											alignItems: "center",
											gap: "6px",
											padding: "7px 12px",
											borderRadius: "8px",
											fontSize: "13px",
											cursor: "pointer",
											border: `1px solid ${active ? "var(--accent-primary, #a78bfa)" : "var(--border)"}`,
											background: active
												? "var(--accent-soft, rgba(167,139,250,0.15))"
												: "var(--bg-tertiary)",
											color: active
												? "var(--text-primary)"
												: "var(--text-secondary)",
										}}
									>
										{opt.icon}
										{opt.label}
									</button>
								);
							})}
						</div>
					</Field>

					{/* Toggles */}
					<div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
						<Checkbox
							checked={autoRun}
							onChange={setAutoRun}
							label="Run on open"
							title="Auto-execute the query when the link is opened (run=true)"
						/>
						<Checkbox
							checked={showExplorer}
							onChange={setShowExplorer}
							label="Show explorer"
							title="Open the file explorer panel (explorer=true)"
						/>
					</div>

					{/* URL preview */}
					<Field label={`Link (${directUrl.length} chars)`}>
						<textarea
							readOnly
							value={directUrl}
							rows={3}
							onFocus={(e) => e.currentTarget.select()}
							style={{
								...inputStyle,
								resize: "vertical",
								fontFamily: "var(--font-mono, monospace)",
								fontSize: "12px",
								lineHeight: 1.5,
							}}
						/>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: "10px",
								marginTop: "8px",
							}}
						>
							<button
								type="button"
								onClick={handleCopy}
								style={primaryButtonStyle}
							>
								{copied ? (
									<CheckCircleIcon size={15} />
								) : (
									<CopyIcon size={15} />
								)}
								{copied ? "Copied!" : "Copy link"}
							</button>
						</div>
						{tooLong && (
							<Warning>
								This link is long ({directUrl.length} chars) and may be
								truncated by some browsers or chat apps. Consider the Gist
								option below for a short, reliable link.
							</Warning>
						)}
					</Field>

					{/* Gist section */}
					<div
						style={{
							borderTop: "1px solid var(--border)",
							paddingTop: "16px",
							display: "flex",
							flexDirection: "column",
							gap: "10px",
						}}
					>
						<div style={{ color: "var(--text-primary)", fontSize: "14px", fontWeight: 600 }}>
							Share as a GitHub Gist
						</div>
						<p style={{ margin: 0, color: "var(--text-muted)", fontSize: "12px", lineHeight: 1.5 }}>
							Best for long queries. Needs a GitHub token with the{" "}
							<code>gist</code> scope. It is stored only in this browser and
							sent only to GitHub when you create a gist.
						</p>

						<div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
							<input
								type="password"
								value={tokenInput}
								onChange={(e) => {
									setTokenInput(e.target.value);
									setTokenCheck(null);
								}}
								placeholder="ghp_... or github_pat_..."
								autoComplete="off"
								style={{ ...inputStyle, flex: 1 }}
							/>
							<button
								type="button"
								onClick={handleVerifyToken}
								disabled={!tokenInput.trim() || verifying}
								style={{
									...secondaryButtonStyle,
									opacity: !tokenInput.trim() || verifying ? 0.6 : 1,
									cursor:
										!tokenInput.trim() || verifying ? "default" : "pointer",
								}}
							>
								{verifying ? "Checking…" : "Verify"}
							</button>
						</div>

						{tokenCheck && (
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "7px",
									fontSize: "12.5px",
									color: tokenValid
										? tokenCheck.hasGistScope
											? "var(--success, #34d399)"
											: "var(--warning, #fbbf24)"
										: "var(--danger, #f87171)",
								}}
							>
								{tokenValid ? (
									<CheckCircleIcon size={15} />
								) : (
									<AlertTriangleIcon size={15} />
								)}
								{tokenCheck.message}
							</div>
						)}

						<div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
							<button
								type="button"
								onClick={handleCreateGist}
								disabled={!tokenValid || creatingGist}
								style={{
									...primaryButtonStyle,
									opacity: !tokenValid || creatingGist ? 0.6 : 1,
									cursor: !tokenValid || creatingGist ? "default" : "pointer",
								}}
								title={
									tokenValid
										? "Upload the SQL to a secret gist and build a short link"
										: "Verify a GitHub token first"
								}
							>
								<ShareIcon size={15} />
								{creatingGist ? "Creating…" : "Create Gist link"}
							</button>
						</div>

						{gistError && <Warning>{gistError}</Warning>}

						{gistUrl && (
							<Field label="Gist link">
								<textarea
									readOnly
									value={gistUrl}
									rows={2}
									onFocus={(e) => e.currentTarget.select()}
									style={{
										...inputStyle,
										resize: "vertical",
										fontFamily: "var(--font-mono, monospace)",
										fontSize: "12px",
									}}
								/>
								<button
									type="button"
									onClick={handleCopyGist}
									style={{ ...primaryButtonStyle, marginTop: "8px" }}
								>
									{gistCopied ? (
										<CheckCircleIcon size={15} />
									) : (
										<CopyIcon size={15} />
									)}
									{gistCopied ? "Copied!" : "Copy Gist link"}
								</button>
							</Field>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

// --- small local building blocks ---

const inputStyle: React.CSSProperties = {
	width: "100%",
	boxSizing: "border-box",
	background: "var(--bg-tertiary)",
	color: "var(--text-primary)",
	border: "1px solid var(--border)",
	borderRadius: "8px",
	padding: "9px 11px",
	fontSize: "13px",
};

const primaryButtonStyle: React.CSSProperties = {
	display: "inline-flex",
	alignItems: "center",
	gap: "7px",
	background: "var(--accent-primary, #7c3aed)",
	color: "white",
	border: "none",
	padding: "9px 16px",
	borderRadius: "8px",
	fontSize: "13px",
	fontWeight: 500,
	cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
	display: "inline-flex",
	alignItems: "center",
	gap: "7px",
	background: "var(--bg-tertiary)",
	color: "var(--text-primary)",
	border: "1px solid var(--border)",
	padding: "9px 16px",
	borderRadius: "8px",
	fontSize: "13px",
	fontWeight: 500,
};

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
			<span
				style={{
					fontSize: "12px",
					fontWeight: 600,
					color: "var(--text-secondary)",
					textTransform: "uppercase",
					letterSpacing: "0.03em",
				}}
			>
				{label}
			</span>
			{children}
		</label>
	);
}

function Checkbox({
	checked,
	onChange,
	label,
	title,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
	label: string;
	title: string;
}) {
	return (
		<label
			title={title}
			style={{
				display: "flex",
				alignItems: "center",
				gap: "8px",
				fontSize: "13px",
				color: "var(--text-primary)",
				cursor: "pointer",
			}}
		>
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
			/>
			{label}
		</label>
	);
}

function Warning({ children }: { children: React.ReactNode }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "flex-start",
				gap: "8px",
				marginTop: "8px",
				padding: "9px 11px",
				borderRadius: "8px",
				background: "var(--warning-soft, rgba(251,191,36,0.12))",
				color: "var(--text-secondary)",
				fontSize: "12px",
				lineHeight: 1.5,
			}}
		>
			<AlertTriangleIcon size={15} color="var(--warning, #fbbf24)" />
			<span>{children}</span>
		</div>
	);
}
