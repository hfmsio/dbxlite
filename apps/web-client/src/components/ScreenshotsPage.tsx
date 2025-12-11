/**
 * Screenshots Gallery Page
 *
 * Static gallery of app screenshots for documentation/marketing.
 * Access via /screenshots route.
 */

import { useState, useEffect, useCallback } from "react";
import type React from "react";

interface Screenshot {
	src: string;
	title: string;
	description: string;
}

// Screenshot gallery data - add images to public/screenshots/
const screenshots: Screenshot[] = [
	{
		src: "/screenshots/main-interface-dark.png",
		title: "Main Interface - Dark Theme",
		description: "Full interface with data explorer, multi-tab SQL editor, and results grid. Shows local files, remote URLs, pagination, and export options."
	},
	{
		src: "/screenshots/main-interface-light.png",
		title: "Main Interface - Light Theme",
		description: "VS Light theme with the same powerful features. Query large CSV files, view remote Parquet from Hugging Face."
	},
	{
		src: "/screenshots/main-interface-dracula.png",
		title: "Main Interface - Dracula Theme",
		description: "Popular Dracula color scheme. Multi-tab editor with syntax highlighting, ZERO-COPY file access for large datasets."
	},
	{
		src: "/screenshots/main-interface-ayu-light.png",
		title: "Main Interface - Ayu Light Theme",
		description: "Clean Ayu Light theme with orange accents. DuckDB database explorer with 21GB database, session tables, and column type badges."
	},
	{
		src: "/screenshots/explorer-multi-themes.png",
		title: "Themes & Data Explorer",
		description: "10 color themes available. Data explorer handles simple tables to deeply nested STRUCTs. Excel files display all sheets with schemas."
	},
	{
		src: "/screenshots/query-execution.png",
		title: "Query Execution Status",
		description: "Long-running query indicator with elapsed time, Stop Query button, and ESC shortcut. Non-blocking UI during execution."
	},
	{
		src: "/screenshots/export-status.png",
		title: "Export to Parquet",
		description: "Export progress overlay showing step-by-step status, elapsed time, filename, and ESC to cancel. Supports CSV, JSON, and Parquet formats."
	},
	{
		src: "/screenshots/schema-modal.png",
		title: "Result Set Schema",
		description: "Schema modal showing column names, data types (Text, Timestamp, Double, Big Integer), and sample values. Quick overview of query results."
	},
];

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

const gridStyle: React.CSSProperties = {
	display: "grid",
	gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))",
	gap: 20,
};

const cardStyle: React.CSSProperties = {
	backgroundColor: "var(--bg-secondary)",
	borderRadius: 12,
	overflow: "hidden",
	border: "1px solid var(--border)",
	cursor: "pointer",
	transition: "transform 0.2s, box-shadow 0.2s",
};

const lightboxOverlayStyle: React.CSSProperties = {
	position: "fixed",
	top: 0,
	left: 0,
	right: 0,
	bottom: 0,
	backgroundColor: "rgba(0, 0, 0, 0.9)",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	zIndex: 1000,
	cursor: "pointer",
	padding: 20,
};

const lightboxImageStyle: React.CSSProperties = {
	maxWidth: "95vw",
	maxHeight: "90vh",
	objectFit: "contain",
	borderRadius: 8,
	boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
};

const lightboxCaptionStyle: React.CSSProperties = {
	position: "fixed",
	bottom: 20,
	left: "50%",
	transform: "translateX(-50%)",
	backgroundColor: "rgba(0, 0, 0, 0.8)",
	color: "white",
	padding: "12px 24px",
	borderRadius: 8,
	textAlign: "center",
	maxWidth: "80vw",
};

const lightboxCloseHintStyle: React.CSSProperties = {
	position: "fixed",
	top: 20,
	left: "50%",
	transform: "translateX(-50%)",
	color: "rgba(255, 255, 255, 0.7)",
	fontSize: 13,
};

const navButtonStyle: React.CSSProperties = {
	position: "fixed",
	top: "50%",
	transform: "translateY(-50%)",
	backgroundColor: "rgba(255, 255, 255, 0.15)",
	border: "none",
	color: "white",
	fontSize: 32,
	width: 50,
	height: 80,
	cursor: "pointer",
	borderRadius: 8,
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
};

const imageStyle: React.CSSProperties = {
	width: "100%",
	height: "auto",
	display: "block",
};

const captionStyle: React.CSSProperties = {
	padding: 16,
};

const captionTitleStyle: React.CSSProperties = {
	fontSize: 16,
	fontWeight: 600,
	marginBottom: 4,
	color: "var(--text-primary)",
};

const captionDescStyle: React.CSSProperties = {
	fontSize: 13,
	color: "var(--text-muted)",
};

const emptyStateStyle: React.CSSProperties = {
	textAlign: "center",
	padding: 60,
	color: "var(--text-muted)",
};

function ScreenshotsPage() {
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

	const selectedImage = selectedIndex !== null ? screenshots[selectedIndex] : null;

	const goToPrev = useCallback(() => {
		if (selectedIndex !== null && selectedIndex > 0) {
			setSelectedIndex(selectedIndex - 1);
		}
	}, [selectedIndex]);

	const goToNext = useCallback(() => {
		if (selectedIndex !== null && selectedIndex < screenshots.length - 1) {
			setSelectedIndex(selectedIndex + 1);
		}
	}, [selectedIndex]);

	const closeLightbox = useCallback(() => {
		setSelectedIndex(null);
	}, []);

	// Keyboard navigation
	useEffect(() => {
		if (selectedIndex === null) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") closeLightbox();
			else if (e.key === "ArrowLeft") goToPrev();
			else if (e.key === "ArrowRight") goToNext();
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [selectedIndex, goToPrev, goToNext, closeLightbox]);

	return (
		<div style={containerStyle}>
			<header style={headerStyle}>
				<h1 style={titleStyle}>
					<span style={{ fontWeight: 700 }}>dbx</span>
					<span style={{ color: "var(--accent)", fontWeight: 400, margin: "0 1px" }}>·</span>
					<span style={{ fontWeight: 500 }}>lite</span>
					{" "}Screenshots
				</h1>
				<a href="/" style={backLinkStyle}>
					Back to App
				</a>
			</header>

			{/* Help text */}
			<div style={{
				marginBottom: 24,
				padding: "12px 16px",
				backgroundColor: "var(--bg-secondary)",
				borderRadius: 8,
				border: "1px solid var(--border)",
				fontSize: 13,
				color: "var(--text-secondary)",
			}}>
				Click any screenshot to view full size. Use{" "}
				<kbd style={{ padding: "2px 6px", backgroundColor: "var(--bg-tertiary)", borderRadius: 4, border: "1px solid var(--border)", fontFamily: "inherit" }}>←</kbd>
				{" "}
				<kbd style={{ padding: "2px 6px", backgroundColor: "var(--bg-tertiary)", borderRadius: 4, border: "1px solid var(--border)", fontFamily: "inherit" }}>→</kbd>
				{" "}arrow keys to navigate. Press{" "}
				<kbd style={{ padding: "2px 6px", backgroundColor: "var(--bg-tertiary)", borderRadius: 4, border: "1px solid var(--border)", fontFamily: "inherit" }}>Esc</kbd>
				{" "}to close.
			</div>

			{screenshots.length === 0 ? (
				<div style={emptyStateStyle}>
					<p style={{ fontSize: 18, marginBottom: 16 }}>No screenshots yet</p>
					<p style={{ fontSize: 14 }}>
						Add images to <code>public/screenshots/</code> and update the screenshots array in this component.
					</p>
				</div>
			) : (
				<div style={gridStyle}>
					{screenshots.map((screenshot, index) => (
						<div
							key={index}
							style={cardStyle}
							onClick={() => setSelectedIndex(index)}
							onKeyDown={(e) => e.key === "Enter" && setSelectedIndex(index)}
							role="button"
							tabIndex={0}
						>
							<img
								src={screenshot.src}
								alt={screenshot.title}
								style={imageStyle}
							/>
							<div style={captionStyle}>
								<div style={captionTitleStyle}>{screenshot.title}</div>
								<div style={captionDescStyle}>{screenshot.description}</div>
								<div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
									Click to enlarge
								</div>
							</div>
						</div>
					))}
				</div>
			)}

			{/* Lightbox Modal */}
			{selectedImage && selectedIndex !== null && (
				<div
					style={lightboxOverlayStyle}
					onClick={closeLightbox}
					role="button"
					tabIndex={0}
				>
					<div style={lightboxCloseHintStyle}>
						<kbd style={{ padding: "2px 6px", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 4, marginRight: 4 }}>Esc</kbd> to close ·
						<kbd style={{ padding: "2px 6px", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 4, margin: "0 4px" }}>←</kbd>
						<kbd style={{ padding: "2px 6px", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 4, marginRight: 4 }}>→</kbd> to navigate · {selectedIndex + 1} / {screenshots.length}
					</div>

					{/* Previous button */}
					{selectedIndex > 0 && (
						<button
							style={{ ...navButtonStyle, left: 20 }}
							onClick={(e) => { e.stopPropagation(); goToPrev(); }}
							aria-label="Previous screenshot"
						>
							‹
						</button>
					)}

					{/* Next button */}
					{selectedIndex < screenshots.length - 1 && (
						<button
							style={{ ...navButtonStyle, right: 20 }}
							onClick={(e) => { e.stopPropagation(); goToNext(); }}
							aria-label="Next screenshot"
						>
							›
						</button>
					)}

					<img
						src={selectedImage.src}
						alt={selectedImage.title}
						style={lightboxImageStyle}
						onClick={(e) => e.stopPropagation()}
					/>
					<div style={lightboxCaptionStyle}>
						<div style={{ fontWeight: 600, marginBottom: 4 }}>{selectedImage.title}</div>
						<div style={{ fontSize: 13, opacity: 0.8 }}>{selectedImage.description}</div>
					</div>
				</div>
			)}
		</div>
	);
}

export default ScreenshotsPage;
