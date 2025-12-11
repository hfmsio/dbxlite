/**
 * Logo component for dbxlite
 * Provides consistent branding across the app
 *
 * Design: Database icon in gradient rounded square
 * Based on Settings->About logo which user preferred
 */

import React from "react";

interface LogoProps {
	/** Size in pixels (default: 32) */
	size?: number;
	/** Whether to show only the icon without background (default: false) */
	iconOnly?: boolean;
	/** Custom class name */
	className?: string;
	/** Custom style */
	style?: React.CSSProperties;
}

/**
 * Main logo component - gradient circle with lightning bolt and database design
 * (Recovered from data-ide, an earlier version)
 */
export function Logo({ size = 32, iconOnly = false, className, style }: LogoProps) {
	if (iconOnly) {
		return (
			<svg
				width={size}
				height={size}
				viewBox="0 0 100 100"
				className={className}
				style={style}
			>
				<defs>
					<linearGradient
						id="logo-gradient-simple"
						x1="0%"
						y1="0%"
						x2="100%"
						y2="100%"
					>
						<stop offset="0%" style={{ stopColor: "#3b82f6" }} />
						<stop offset="100%" style={{ stopColor: "#06b6d4" }} />
					</linearGradient>
				</defs>

				{/* Background circle */}
				<circle cx="50" cy="50" r="45" fill="url(#logo-gradient-simple)" />

				{/* Lightning bolt integrated into letterform */}
				<path
					d="M 35 25 L 50 25 L 45 50 L 60 50 L 40 75 L 45 55 L 30 55 Z"
					fill="white"
					opacity="0.95"
				/>

				{/* Database cylinder with DuckDB yellow accent */}
				<ellipse
					cx="65"
					cy="30"
					rx="10"
					ry="4"
					fill="#FFF000"
					opacity="0.9"
				/>
				<rect
					x="55"
					y="30"
					width="20"
					height="8"
					fill="#FFF000"
					opacity="0.7"
				/>
				<ellipse
					cx="65"
					cy="38"
					rx="10"
					ry="4"
					fill="#FFF000"
					opacity="0.9"
				/>
			</svg>
		);
	}

	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 100 100"
			className={className}
			style={{
				flexShrink: 0,
				...style,
			}}
		>
			<defs>
				<linearGradient
					id="logo-gradient"
					x1="0%"
					y1="0%"
					x2="100%"
					y2="100%"
				>
					<stop offset="0%" style={{ stopColor: "#3b82f6" }} />
					<stop offset="100%" style={{ stopColor: "#06b6d4" }} />
				</linearGradient>
			</defs>

			{/* Background circle */}
			<circle cx="50" cy="50" r="45" fill="url(#logo-gradient)" />

			{/* Lightning bolt integrated into letterform */}
			<path
				d="M 35 25 L 50 25 L 45 50 L 60 50 L 40 75 L 45 55 L 30 55 Z"
				fill="white"
				opacity="0.95"
			/>

			{/* Database cylinder with DuckDB yellow accent */}
			<ellipse
				cx="65"
				cy="30"
				rx="10"
				ry="4"
				fill="#FFF000"
				opacity="0.9"
			/>
			<rect
				x="55"
				y="30"
				width="20"
				height="8"
				fill="#FFF000"
				opacity="0.7"
			/>
			<ellipse
				cx="65"
				cy="38"
				rx="10"
				ry="4"
				fill="#FFF000"
				opacity="0.9"
			/>
		</svg>
	);
}

/**
 * Wordmark component - "dbx·lite" text
 */
interface WordmarkProps {
	size?: "sm" | "md" | "lg";
	className?: string;
	style?: React.CSSProperties;
}

export function Wordmark({ size = "md", className, style }: WordmarkProps) {
	const fontSize = size === "sm" ? 16 : size === "md" ? 20 : 24;

	return (
		<span
			className={className}
			style={{
				fontSize,
				fontFamily: "system-ui, -apple-system, sans-serif",
				cursor: "default",
				userSelect: "none",
				WebkitUserSelect: "none",
				...style,
			}}
		>
			<span style={{ fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>dbx</span>
			<span style={{ color: "var(--accent)", fontWeight: 800, margin: "0 1px" }}>·</span>
			<span style={{ fontWeight: 400, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>lite</span>
		</span>
	);
}

/**
 * Combined Logo + Wordmark
 */
interface LogoBrandProps {
	logoSize?: number;
	wordmarkSize?: "sm" | "md" | "lg";
	gap?: number;
	className?: string;
	style?: React.CSSProperties;
}

export function LogoBrand({
	logoSize = 32,
	wordmarkSize = "md",
	gap = 10,
	className,
	style,
}: LogoBrandProps) {
	return (
		<div
			className={className}
			style={{
				display: "flex",
				alignItems: "center",
				gap,
				...style,
			}}
		>
			<Logo size={logoSize} />
			<Wordmark size={wordmarkSize} />
		</div>
	);
}
