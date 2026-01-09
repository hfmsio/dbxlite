import { useEffect, useState } from "react";
import { DatabaseIcon } from "./Icons";
import { useMode } from "../hooks/useMode";
import {
	AboutSettings,
	AppearanceSettings,
	ConnectionsSettings,
	FormattingSettings,
	HelpSettings,
	ServerSettings,
} from "./settings";

export type SettingsTab = "appearance" | "connections" | "formatting" | "help" | "about" | "server";

interface SettingsModalProps {
	fontSize: number;
	fontFamily: string;
	gridFontSize: number;
	gridRowHeight: number;
	pageSize: number;
	cacheThreshold: number;
	explorerSortOrder: "none" | "name" | "type" | "size";
	saveStrategy: "auto" | "manual" | "prompt";
	onFontSizeChange: (size: number) => void;
	onFontFamilyChange: (family: string) => void;
	onGridFontSizeChange: (size: number) => void;
	onGridRowHeightChange: (height: number) => void;
	onPageSizeChange: (size: number) => void;
	onCacheThresholdChange: (threshold: number) => void;
	onExplorerSortOrderChange: (order: "none" | "name" | "type" | "size") => void;
	onSaveStrategyChange: (strategy: "auto" | "manual" | "prompt") => void;
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
	onConnectionChange?: () => void;
	onClearBigQueryCache?: () => void;
	onReloadBigQueryData?: () => Promise<void>;
	initialTab?: SettingsTab;
}

export default function SettingsModal({
	fontSize,
	fontFamily,
	gridFontSize,
	gridRowHeight,
	pageSize,
	cacheThreshold,
	explorerSortOrder,
	saveStrategy,
	onFontSizeChange,
	onFontFamilyChange,
	onGridFontSizeChange,
	onGridRowHeightChange,
	onPageSizeChange,
	onCacheThresholdChange,
	onExplorerSortOrderChange,
	onSaveStrategyChange,
	showToast,
	onConnectionChange,
	onClearBigQueryCache,
	onReloadBigQueryData,
	initialTab,
}: SettingsModalProps) {
	const { isHttpMode } = useMode();
	// Default to "server" tab in HTTP mode, "appearance" otherwise
	const defaultTab = isHttpMode ? "server" : "appearance";
	const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || defaultTab);

	// Update active tab when initialTab changes
	useEffect(() => {
		if (initialTab) {
			setActiveTab(initialTab);
		}
	}, [initialTab]);

	return (
		<div
			style={{
				padding: 0,
				border: "none",
				borderRadius: 0,
				background: "transparent",
				color: "var(--text-primary)",
				width: "100%",
			}}
		>
			{/* Tabs */}
			<div
				style={{
					display: "flex",
					gap: 4,
					marginBottom: 24,
					borderBottom: "2px solid var(--border)",
					paddingBottom: 0,
				}}
			>
				{/* Server tab - first position, only visible in HTTP mode */}
				{isHttpMode && (
					<button
						onClick={() => setActiveTab("server")}
						style={{
							padding: "12px 24px",
							background:
								activeTab === "server" ? "var(--accent)" : "transparent",
							color:
								activeTab === "server" ? "white" : "var(--text-secondary)",
							border: "none",
							borderRadius: "8px 8px 0 0",
							cursor: "pointer",
							fontWeight: activeTab === "server" ? "600" : "normal",
							fontSize: "14px",
							transition: "all 0.2s",
							display: "flex",
							alignItems: "center",
							gap: "8px",
						}}
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
							<rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
							<line x1="6" y1="6" x2="6.01" y2="6"></line>
							<line x1="6" y1="18" x2="6.01" y2="18"></line>
						</svg>
						Server
					</button>
				)}
				<button
					onClick={() => setActiveTab("appearance")}
					style={{
						padding: "12px 24px",
						background:
							activeTab === "appearance" ? "var(--accent)" : "transparent",
						color:
							activeTab === "appearance" ? "white" : "var(--text-secondary)",
						border: "none",
						borderRadius: "8px 8px 0 0",
						cursor: "pointer",
						fontWeight: activeTab === "appearance" ? "600" : "normal",
						fontSize: "14px",
						transition: "all 0.2s",
						display: "flex",
						alignItems: "center",
						gap: "8px",
					}}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
					</svg>
					Appearance
				</button>
				<button
					onClick={() => setActiveTab("connections")}
					style={{
						padding: "12px 24px",
						background:
							activeTab === "connections" ? "var(--accent)" : "transparent",
						color:
							activeTab === "connections" ? "white" : "var(--text-secondary)",
						border: "none",
						borderRadius: "8px 8px 0 0",
						cursor: "pointer",
						fontWeight: activeTab === "connections" ? "600" : "normal",
						fontSize: "14px",
						transition: "all 0.2s",
						display: "flex",
						alignItems: "center",
						gap: "8px",
					}}
				>
					<DatabaseIcon size={16} />
					Connections
				</button>
				<button
					onClick={() => setActiveTab("formatting")}
					style={{
						padding: "12px 24px",
						background:
							activeTab === "formatting" ? "var(--accent)" : "transparent",
						color:
							activeTab === "formatting" ? "white" : "var(--text-secondary)",
						border: "none",
						borderRadius: "8px 8px 0 0",
						cursor: "pointer",
						fontWeight: activeTab === "formatting" ? "600" : "normal",
						fontSize: "14px",
						transition: "all 0.2s",
						display: "flex",
						alignItems: "center",
						gap: "8px",
					}}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M4 7V4h16v3M9 20h6M12 4v16"></path>
					</svg>
					Formatting
				</button>
				<button
					onClick={() => setActiveTab("help")}
					style={{
						padding: "12px 24px",
						background:
							activeTab === "help" ? "var(--accent)" : "transparent",
						color:
							activeTab === "help" ? "white" : "var(--text-secondary)",
						border: "none",
						borderRadius: "8px 8px 0 0",
						cursor: "pointer",
						fontWeight: activeTab === "help" ? "600" : "normal",
						fontSize: "14px",
						transition: "all 0.2s",
						display: "flex",
						alignItems: "center",
						gap: "8px",
					}}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<circle cx="12" cy="12" r="10"></circle>
						<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
						<line x1="12" y1="17" x2="12.01" y2="17"></line>
					</svg>
					Help
				</button>
				<button
					onClick={() => setActiveTab("about")}
					style={{
						padding: "12px 24px",
						background:
							activeTab === "about" ? "var(--accent)" : "transparent",
						color:
							activeTab === "about" ? "white" : "var(--text-secondary)",
						border: "none",
						borderRadius: "8px 8px 0 0",
						cursor: "pointer",
						fontWeight: activeTab === "about" ? "600" : "normal",
						fontSize: "14px",
						transition: "all 0.2s",
						display: "flex",
						alignItems: "center",
						gap: "8px",
					}}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<circle cx="12" cy="12" r="10"></circle>
						<line x1="12" y1="16" x2="12" y2="12"></line>
						<line x1="12" y1="8" x2="12.01" y2="8"></line>
					</svg>
					About
				</button>
			</div>

			{/* Tab Content - Fixed height container */}
			<div
				style={{
					height: "620px",
					overflowY: "auto",
					overflowX: "hidden",
				}}
			>
				{/* Appearance Tab */}
				{activeTab === "appearance" && (
					<AppearanceSettings
						fontSize={fontSize}
						fontFamily={fontFamily}
						gridFontSize={gridFontSize}
						gridRowHeight={gridRowHeight}
						pageSize={pageSize}
						cacheThreshold={cacheThreshold}
						explorerSortOrder={explorerSortOrder}
						saveStrategy={saveStrategy}
						onFontSizeChange={onFontSizeChange}
						onFontFamilyChange={onFontFamilyChange}
						onGridFontSizeChange={onGridFontSizeChange}
						onGridRowHeightChange={onGridRowHeightChange}
						onPageSizeChange={onPageSizeChange}
						onCacheThresholdChange={onCacheThresholdChange}
						onExplorerSortOrderChange={onExplorerSortOrderChange}
						onSaveStrategyChange={onSaveStrategyChange}
					/>
				)}

				{/* Connections Tab */}
				{activeTab === "connections" && (
					<ConnectionsSettings
						showToast={showToast}
						onConnectionChange={onConnectionChange}
						onClearBigQueryCache={onClearBigQueryCache}
						onReloadBigQueryData={onReloadBigQueryData}
					/>
				)}

				{/* Formatting Tab */}
				{activeTab === "formatting" && (
					<FormattingSettings showToast={showToast} />
				)}

				{/* Help Tab */}
				{activeTab === "help" && <HelpSettings />}

				{/* About Tab */}
				{activeTab === "about" && <AboutSettings />}

				{/* Server Tab - HTTP mode only */}
				{activeTab === "server" && <ServerSettings />}
			</div>
		</div>
	);
}
