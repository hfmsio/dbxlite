import React from "react";
import { exampleGroups, sampleQueries, type SampleQuery, type ExampleGroup } from "../examples/sampleQueries";
import {
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	CopyIcon,
	LightbulbIcon,
	XIcon,
	GraduationCapIcon,
	ZapIcon,
	GlobeIcon,
	CloudIcon,
	PackageIcon,
	BarChartIcon,
} from "./Icons";
import { SqlCodeViewer } from "./SqlCodeViewer";

// Map iconType to Icon component
const iconMap: Record<ExampleGroup["iconType"], React.ComponentType<{ size?: number; color?: string }>> = {
	graduation: GraduationCapIcon,
	zap: ZapIcon,
	globe: GlobeIcon,
	cloud: CloudIcon,
	package: PackageIcon,
	"bar-chart": BarChartIcon,
};

interface ExamplesPanelProps {
	onClose: () => void;
	onInsertQuery: (sql: string, connector: string) => void;
}

export function ExamplesPanel({ onClose, onInsertQuery }: ExamplesPanelProps) {
	const panelRef = React.useRef<HTMLDivElement>(null);

	// Track which groups are expanded
	const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(() => {
		const defaultExpanded = new Set<string>();
		exampleGroups.forEach(g => {
			if (g.defaultExpanded) defaultExpanded.add(g.id);
		});
		return defaultExpanded;
	});

	// Track which example is expanded (only one at a time)
	const [expandedExample, setExpandedExample] = React.useState<string | null>(null);
	const [copiedId, setCopiedId] = React.useState<string | null>(null);

	// Close on Escape
	React.useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onClose]);

	// Close on click outside
	React.useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				panelRef.current &&
				!panelRef.current.contains(event.target as Node)
			) {
				onClose();
			}
		};

		const timeoutId = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
		}, 100);

		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [onClose]);

	const toggleGroup = (groupId: string) => {
		setExpandedGroups(prev => {
			const next = new Set(prev);
			if (next.has(groupId)) {
				next.delete(groupId);
			} else {
				next.add(groupId);
			}
			return next;
		});
	};

	const toggleExample = (exampleId: string) => {
		setExpandedExample(prev => prev === exampleId ? null : exampleId);
	};

	const handleCopy = async (sql: string, id: string) => {
		try {
			await navigator.clipboard.writeText(sql);
			setCopiedId(id);
			setTimeout(() => setCopiedId(null), 2000);
		} catch (err) {
			console.error("Failed to copy:", err);
		}
	};

	const handleInsert = (sample: SampleQuery) => {
		onInsertQuery(sample.sql, sample.connector || "duckdb");
		onClose();
	};

	return (
		<div
			ref={panelRef}
			style={{
				position: "fixed",
				top: 0,
				right: 0,
				bottom: 0,
				width: "480px",
				background: "var(--bg-primary)",
				borderLeft: "1px solid var(--border-light)",
				boxShadow: "-4px 0 12px var(--shadow, rgba(0, 0, 0, 0.15))",
				zIndex: 10000,
				display: "flex",
				flexDirection: "column",
			}}
		>
			{/* Header */}
			<div
				style={{
					padding: "16px 20px",
					borderBottom: "1px solid var(--border-light)",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					background: "linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
					<div
						style={{
							width: "32px",
							height: "32px",
							borderRadius: "8px",
							background: "var(--accent)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<LightbulbIcon size={18} color="white" />
					</div>
					<div>
						<h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
							Examples
						</h3>
						<span
							style={{
								fontSize: "11px",
								color: "var(--text-muted)",
							}}
						>
							{sampleQueries.length} queries in {exampleGroups.length} groups
						</span>
					</div>
				</div>
				<button
					onClick={onClose}
					style={{
						background: "transparent",
						border: "none",
						color: "var(--text-muted)",
						cursor: "pointer",
						padding: "6px",
						width: "32px",
						height: "32px",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						borderRadius: "6px",
						transition: "all 0.2s",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = "var(--bg-quaternary)";
						e.currentTarget.style.color = "var(--text-primary)";
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = "transparent";
						e.currentTarget.style.color = "var(--text-muted)";
					}}
					aria-label="Close examples"
				>
					<XIcon size={18} />
				</button>
			</div>

			{/* Examples List */}
			<div
				style={{
					flex: 1,
					overflowY: "auto",
					padding: "12px",
				}}
			>
				<div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
					{exampleGroups.map((group) => {
						const isGroupExpanded = expandedGroups.has(group.id);
						const GroupIcon = iconMap[group.iconType];

						return (
							<div
								key={group.id}
								style={{
									background: "var(--bg-tertiary)",
									borderRadius: "10px",
									overflow: "hidden",
									border: isGroupExpanded ? `1px solid ${group.color}` : "1px solid var(--border-light)",
									borderLeft: `3px solid ${group.color}`,
								}}
							>
								{/* Group Header */}
								<button
									onClick={() => toggleGroup(group.id)}
									style={{
										width: "100%",
										background: isGroupExpanded ? `${group.color}15` : "transparent",
										border: "none",
										padding: "12px 14px",
										textAlign: "left",
										cursor: "pointer",
										display: "flex",
										alignItems: "center",
										gap: "10px",
										transition: "background 0.2s",
									}}
								>
									<span
										style={{
											color: group.color,
											transition: "transform 0.2s",
											transform: isGroupExpanded ? "rotate(90deg)" : "rotate(0deg)",
										}}
									>
										<ChevronRightIcon size={14} />
									</span>
									{/* Group Icon */}
									<div
										style={{
											width: "28px",
											height: "28px",
											borderRadius: "6px",
											background: `${group.color}20`,
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											flexShrink: 0,
										}}
									>
										<GroupIcon size={16} color={group.color} />
									</div>
									<div style={{ flex: 1 }}>
										<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
											<span
												style={{
													fontSize: "14px",
													fontWeight: 600,
													color: "var(--text-primary)",
												}}
											>
												{group.label}
											</span>
											<span
												style={{
													fontSize: "11px",
													color: "var(--text-muted)",
													background: "var(--bg-quaternary)",
													padding: "2px 6px",
													borderRadius: "4px",
												}}
											>
												{group.examples.length}
											</span>
										</div>
										{group.description && (
											<div
												style={{
													fontSize: "12px",
													color: "var(--text-muted)",
													marginTop: "2px",
												}}
											>
												{group.description}
											</div>
										)}
									</div>
								</button>

								{/* Group Examples */}
								{isGroupExpanded && (
									<div
										style={{
											borderTop: "1px solid var(--border)",
											padding: "8px",
											display: "flex",
											flexDirection: "column",
											gap: "6px",
										}}
									>
										{group.examples.map((sample, idx) => {
											const exampleId = `${group.id}-${idx}`;
											const isExpanded = expandedExample === exampleId;
											const isCopied = copiedId === exampleId;
											const lineCount = sample.sql.split("\n").length;

											return (
												<div
													key={exampleId}
													style={{
														background: isExpanded ? "var(--bg-secondary)" : "var(--bg-primary)",
														border: isExpanded ? "1px solid var(--accent)" : "1px solid var(--border-light)",
														borderRadius: "6px",
														overflow: "hidden",
														transition: "all 0.2s",
													}}
												>
													{/* Example Header */}
													<button
														onClick={() => toggleExample(exampleId)}
														style={{
															width: "100%",
															background: "transparent",
															border: "none",
															padding: "10px 12px",
															textAlign: "left",
															cursor: "pointer",
															display: "flex",
															alignItems: "flex-start",
															gap: "8px",
														}}
													>
														<span
															style={{
																color: isExpanded ? "var(--accent)" : "var(--text-muted)",
																marginTop: "2px",
																flexShrink: 0,
															}}
														>
															{isExpanded ? (
																<ChevronDownIcon size={12} />
															) : (
																<ChevronRightIcon size={12} />
															)}
														</span>
														<div style={{ flex: 1, minWidth: 0 }}>
															<div
																style={{
																	fontSize: "13px",
																	fontWeight: 500,
																	color: "var(--text-primary)",
																}}
															>
																{sample.label}
															</div>
															{sample.hint && (
																<div
																	style={{
																		fontSize: "11px",
																		color: "var(--text-muted)",
																		marginTop: "2px",
																	}}
																>
																	{sample.hint}
																</div>
															)}
														</div>
														<span
															style={{
																fontSize: "10px",
																color: "var(--text-muted)",
																opacity: 0.7,
															}}
														>
															{lineCount} lines
														</span>
													</button>

													{/* Expanded Content */}
													{isExpanded && (
														<div
															style={{
																borderTop: "1px solid var(--border)",
																display: "flex",
																flexDirection: "column",
															}}
														>
															{/* SQL Code Block */}
															<SqlCodeViewer
																value={sample.sql}
																height={Math.min(Math.max(lineCount * 18, 100), 350)}
																fontSize={12}
															/>

															{/* Action Buttons */}
															<div
																style={{
																	display: "flex",
																	gap: "8px",
																	padding: "10px 12px",
																	borderTop: "1px solid var(--border-light)",
																	background: "var(--bg-tertiary)",
																}}
															>
																<button
																	onClick={() => handleInsert(sample)}
																	style={{
																		flex: 1,
																		display: "flex",
																		alignItems: "center",
																		justifyContent: "center",
																		gap: "6px",
																		padding: "8px 12px",
																		background: "var(--accent)",
																		border: "none",
																		borderRadius: "5px",
																		color: "white",
																		fontSize: "12px",
																		fontWeight: 500,
																		cursor: "pointer",
																		transition: "all 0.2s",
																	}}
																	onMouseEnter={(e) => {
																		e.currentTarget.style.opacity = "0.9";
																	}}
																	onMouseLeave={(e) => {
																		e.currentTarget.style.opacity = "1";
																	}}
																>
																	<ChevronLeftIcon size={12} />
																	Insert to Editor
																</button>
																<button
																	onClick={() => handleCopy(sample.sql, exampleId)}
																	style={{
																		display: "flex",
																		alignItems: "center",
																		justifyContent: "center",
																		gap: "5px",
																		padding: "8px 12px",
																		background: isCopied
																			? "var(--success-bg, var(--bg-hover))"
																			: "var(--bg-secondary)",
																		border: isCopied ? "1px solid var(--success)" : "1px solid var(--border-light)",
																		borderRadius: "5px",
																		color: isCopied ? "var(--success)" : "var(--text-primary)",
																		fontSize: "12px",
																		fontWeight: 500,
																		cursor: "pointer",
																		transition: "all 0.2s",
																		minWidth: "80px",
																	}}
																>
																	<CopyIcon size={12} />
																	{isCopied ? "Copied!" : "Copy"}
																</button>
															</div>
														</div>
													)}
												</div>
											);
										})}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>

			{/* Footer hint */}
			<div
				style={{
					padding: "10px 16px",
					borderTop: "1px solid var(--border-light)",
					background: "var(--bg-secondary)",
					fontSize: "11px",
					color: "var(--text-muted)",
					textAlign: "center",
				}}
			>
				Expand groups, then click examples to preview SQL
			</div>
		</div>
	);
}
