import { useState, useEffect } from "react";
import { queryService } from "../../services/streaming-query-service";
import BigQuerySetupDialog from "../BigQuerySetupDialog";
import { BigQueryCostSettings } from "./BigQueryCostSettings";
import { CloudIcon, DatabaseIcon } from "../Icons";

interface ConnectionsSettingsProps {
	showToast?: (
		message: string,
		type?: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
	onConnectionChange?: () => void;
	onClearBigQueryCache?: () => void;
	onReloadBigQueryData?: () => Promise<void>;
}

export default function ConnectionsSettings({
	showToast,
	onConnectionChange,
	onClearBigQueryCache,
	onReloadBigQueryData,
}: ConnectionsSettingsProps) {
	const [showBigQuerySetup, setShowBigQuerySetup] = useState(false);
	const [isBigQueryConnected, setIsBigQueryConnected] = useState(
		queryService.isBigQueryConnected(),
	);
	const [bigQueryAutoConnect, setBigQueryAutoConnect] = useState(() => {
		return localStorage.getItem("bigquery-auto-connect") === "true";
	});
	const [billingProject, setBillingProject] = useState<string>("");
	const [availableProjects, setAvailableProjects] = useState<Array<{ id: string; name: string }>>([]);
	const [loadingProjects, setLoadingProjects] = useState(false);

	// Load billing project and available projects on mount
	useEffect(() => {
		if (isBigQueryConnected) {
			// Load current default project
			queryService.getBigQueryDefaultProject().then((project) => {
				if (project) {
					setBillingProject(project);
				}
			});
			// Load available projects
			setLoadingProjects(true);
			queryService.getBigQueryProjects().then((projects) => {
				setAvailableProjects(projects.map(p => ({ id: p.id, name: p.name })));
			}).catch(() => {
				// Ignore errors - user can still type manually
			}).finally(() => {
				setLoadingProjects(false);
			});
		}
	}, [isBigQueryConnected]);

	return (
		<>
			<div style={{ padding: "8px 0" }}>
				{/* Two-column layout for connections */}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 1fr",
						gap: "12px",
					}}
				>
					{/* DuckDB Card */}
					<div
						style={{
							padding: 14,
							background: "var(--bg-secondary)",
							border: "1px solid var(--border)",
							borderRadius: 8,
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 10,
								marginBottom: 12,
							}}
						>
							<DatabaseIcon size={24} color="var(--accent)" />
							<div>
								<div
									style={{
										fontWeight: 600,
										color: "var(--text-primary)",
										fontSize: 13,
									}}
								>
									DuckDB
								</div>
								<div style={{ fontSize: 11, color: "var(--text-muted)" }}>
									Local database engine
								</div>
							</div>
						</div>
						<div
							style={{
								padding: "6px 10px",
								background: "var(--success)",
								color: "white",
								borderRadius: 4,
								fontSize: 11,
								fontWeight: 500,
								textAlign: "center",
							}}
						>
							Always Available
						</div>
						<p
							style={{
								fontSize: 11,
								color: "var(--text-muted)",
								marginTop: 10,
								marginBottom: 0,
								lineHeight: 1.4,
							}}
						>
							Embedded in-browser database. No configuration required.
						</p>
					</div>

					{/* BigQuery Card */}
					<div
						style={{
							padding: 14,
							background: "var(--bg-secondary)",
							border: "1px solid var(--border)",
							borderRadius: 8,
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 10,
								marginBottom: 12,
							}}
						>
							<CloudIcon size={24} color="#4285f4" />
							<div>
								<div
									style={{
										fontWeight: 600,
										color: "var(--text-primary)",
										fontSize: 13,
									}}
								>
									BigQuery
								</div>
								<div style={{ fontSize: 11, color: "var(--text-muted)" }}>
									Google Cloud
								</div>
							</div>
						</div>

						{isBigQueryConnected ? (
							<>
								<div
									style={{
										padding: "6px 10px",
										background: "var(--success)",
										color: "white",
										borderRadius: 4,
										fontSize: 11,
										fontWeight: 500,
										textAlign: "center",
										marginBottom: 10,
									}}
								>
									Connected
								</div>
								{/* Billing Project Dropdown */}
								<div style={{ marginBottom: 10 }}>
									<label
										style={{
											display: "block",
											fontSize: 10,
											color: "var(--text-muted)",
											marginBottom: 4,
										}}
									>
										Billing Project
									</label>
									<select
										value={billingProject}
										onChange={async (e) => {
											const projectId = e.target.value;
											if (projectId) {
												try {
													await queryService.setBigQueryDefaultProject(projectId);
													setBillingProject(projectId);
													showToast?.("Billing project saved", "success", 3000);
												} catch (err) {
													showToast?.(
														`Failed: ${err instanceof Error ? err.message : String(err)}`,
														"error",
														5000
													);
												}
											}
										}}
										style={{
											width: "100%",
											padding: "6px 8px",
											background: "var(--bg-tertiary)",
											color: "var(--text-primary)",
											border: "1px solid var(--border)",
											borderRadius: 4,
											fontSize: 11,
											cursor: "pointer",
										}}
									>
										<option value="">
											{loadingProjects ? "Loading projects..." : "Select a project"}
										</option>
										{availableProjects.map((project) => (
											<option key={project.id} value={project.id}>
												{project.name} ({project.id})
											</option>
										))}
									</select>
									{availableProjects.length === 0 && !loadingProjects && (
										<div
											style={{
												fontSize: 10,
												color: "var(--text-muted)",
												marginTop: 4,
											}}
										>
											No projects found. Check your GCP permissions.
										</div>
									)}
								</div>
								<div style={{ display: "flex", gap: 6 }}>
									<button
										onClick={async () => {
											if (
												window.confirm(
													"Clear BigQuery cache? This will reload fresh data from the cloud.",
												)
											) {
												queryService.clearBigQueryCache();
												onClearBigQueryCache?.();
												showToast?.("Clearing cache...", "info", 2000);
												await onReloadBigQueryData?.();
												showToast?.("BigQuery data refreshed", "success", 3000);
											}
										}}
										style={{
											flex: 1,
											padding: "5px 8px",
											background: "var(--bg-tertiary)",
											color: "var(--text-primary)",
											border: "1px solid var(--border)",
											borderRadius: 4,
											cursor: "pointer",
											fontSize: 11,
										}}
									>
										Clear Cache
									</button>
									<button
										onClick={async () => {
											if (window.confirm("Disconnect from BigQuery?")) {
												try {
													await queryService.disconnectBigQuery();
													setIsBigQueryConnected(false);
													onConnectionChange?.();
													showToast?.("Disconnected", "info", 3000);
												} catch (err) {
													showToast?.(
														`Failed: ${err instanceof Error ? err.message : String(err)}`,
														"error",
														5000,
													);
												}
											}
										}}
										style={{
											flex: 1,
											padding: "5px 8px",
											background: "var(--error)",
											color: "white",
											border: "none",
											borderRadius: 4,
											cursor: "pointer",
											fontSize: 11,
										}}
									>
										Disconnect
									</button>
								</div>
								{/* BigQuery Cost Warning Settings */}
								<BigQueryCostSettings />
							</>
						) : (
							<>
								<button
									onClick={() => setShowBigQuerySetup(true)}
									style={{
										width: "100%",
										padding: "6px 10px",
										background: "var(--accent)",
										color: "white",
										border: "none",
										borderRadius: 4,
										cursor: "pointer",
										fontSize: 11,
										fontWeight: 500,
									}}
								>
									Configure
								</button>
								<p
									style={{
										fontSize: 11,
										color: "var(--text-muted)",
										marginTop: 10,
										marginBottom: 0,
										lineHeight: 1.4,
									}}
								>
									Requires Google Cloud OAuth credentials.
								</p>
							</>
						)}
					</div>
				</div>

				{/* BigQuery Auto-Connect Toggle */}
				{isBigQueryConnected && (
					<div
						style={{
							marginTop: 12,
							padding: 12,
							background: "var(--bg-secondary)",
							border: "1px solid var(--border)",
							borderRadius: 8,
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
							}}
						>
							<div>
								<div
									style={{
										fontWeight: 500,
										color: "var(--text-primary)",
										fontSize: 12,
									}}
								>
									Auto-connect to BigQuery
								</div>
								<div style={{ fontSize: 11, color: "var(--text-muted)" }}>
									Reconnect automatically when app loads
								</div>
							</div>
							<label
								style={{
									position: "relative",
									display: "inline-block",
									width: 40,
									height: 20,
									cursor: "pointer",
								}}
							>
								<input
									type="checkbox"
									checked={bigQueryAutoConnect}
									onChange={(e) => {
										const enabled = e.target.checked;
										setBigQueryAutoConnect(enabled);
										localStorage.setItem(
											"bigquery-auto-connect",
											enabled ? "true" : "false",
										);
										showToast?.(
											enabled
												? "Auto-connect enabled"
												: "Auto-connect disabled",
											"success",
											3000,
										);
									}}
									style={{ opacity: 0, width: 0, height: 0 }}
								/>
								<span
									style={{
										position: "absolute",
										cursor: "pointer",
										top: 0,
										left: 0,
										right: 0,
										bottom: 0,
										backgroundColor: bigQueryAutoConnect
											? "var(--accent)"
											: "var(--border)",
										transition: "0.3s",
										borderRadius: 20,
									}}
								>
									<span
										style={{
											position: "absolute",
											height: 14,
											width: 14,
											left: bigQueryAutoConnect ? 22 : 3,
											bottom: 3,
											backgroundColor: "white",
											transition: "0.3s",
											borderRadius: "50%",
										}}
									></span>
								</span>
							</label>
						</div>
					</div>
				)}

				{/* Info Box */}
				<div
					style={{
						marginTop: 12,
						padding: 12,
						background: "var(--bg-secondary)",
						borderRadius: 6,
						fontSize: 11,
						color: "var(--text-muted)",
						border: "1px solid var(--border)",
						lineHeight: 1.5,
					}}
				>
					<strong style={{ color: "var(--text-secondary)" }}>Note:</strong>{" "}
					DuckDB is embedded and always available. BigQuery requires a Google
					Cloud OAuth Client ID from your GCP project. Credentials are stored
					securely in browser local storage.
				</div>
			</div>

			{/* BigQuery Setup Dialog */}
			{showBigQuerySetup && (
				<BigQuerySetupDialog
					onClose={() => setShowBigQuerySetup(false)}
					onSuccess={() => {
						setIsBigQueryConnected(true);
						onConnectionChange?.();
					}}
					showToast={showToast}
				/>
			)}
		</>
	);
}
