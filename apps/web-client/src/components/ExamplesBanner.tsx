import React, { useState, useCallback } from "react";
import { ChevronLeftIcon, ChevronRightIcon, GraduationCapIcon, ZapIcon, GlobeIcon, CloudIcon, PackageIcon, BarChartIcon } from "./Icons";
import { exampleGroups, type ExampleGroup } from "../examples/sampleQueries";
import type { ConnectorType } from "../types/data-source";

interface ExamplesBannerProps {
	onInsertQuery: (sql: string, connectorType?: ConnectorType) => void;
	onOpenExamples: () => void;
}

// Get the appropriate icon component for a category
function getCategoryIcon(iconType: ExampleGroup["iconType"]) {
	switch (iconType) {
		case "graduation":
			return GraduationCapIcon;
		case "zap":
			return ZapIcon;
		case "globe":
			return GlobeIcon;
		case "cloud":
			return CloudIcon;
		case "package":
			return PackageIcon;
		case "bar-chart":
			return BarChartIcon;
	}
}

export function ExamplesBanner({ onInsertQuery, onOpenExamples }: ExamplesBannerProps) {
	const [activeIndex, setActiveIndex] = useState(0);
	const groups = exampleGroups;

	const goNext = useCallback(() => {
		setActiveIndex((i) => (i + 1) % groups.length);
	}, [groups.length]);

	const goPrev = useCallback(() => {
		setActiveIndex((i) => (i - 1 + groups.length) % groups.length);
	}, [groups.length]);

	const activeGroup = groups[activeIndex];
	const CategoryIcon = getCategoryIcon(activeGroup.iconType);

	return (
		<div className="examples-carousel">
			{/* Nav button left */}
			<button
				className="examples-carousel-nav prev"
				onClick={goPrev}
				type="button"
				aria-label="Previous category"
			>
				<ChevronLeftIcon size={16} />
			</button>

			{/* Category card */}
			<div
				className="examples-carousel-card"
				style={{ "--category-color": activeGroup.color } as React.CSSProperties}
			>
				<div className="examples-carousel-header" onClick={onOpenExamples}>
					<CategoryIcon size={20} color={activeGroup.color} />
					<span>{activeGroup.label}</span>
				</div>

				{/* Featured examples (first 3) */}
				<div className="examples-carousel-examples">
					{activeGroup.examples.slice(0, 3).map((example, i) => (
						<button
							key={i}
							className="examples-carousel-example"
							onClick={() => onInsertQuery(example.sql, example.connector)}
							type="button"
						>
							<span className="example-label">{example.label}</span>
							{example.hint && <span className="example-hint">{example.hint}</span>}
						</button>
					))}
				</div>

				{/* More count */}
				{activeGroup.examples.length > 3 && (
					<button
						className="examples-carousel-more"
						onClick={onOpenExamples}
						type="button"
					>
						+{activeGroup.examples.length - 3} more examples
					</button>
				)}
			</div>

			{/* Nav button right */}
			<button
				className="examples-carousel-nav next"
				onClick={goNext}
				type="button"
				aria-label="Next category"
			>
				<ChevronRightIcon size={16} />
			</button>

			{/* Dot indicators */}
			<div className="examples-carousel-dots">
				{groups.map((g, i) => (
					<button
						key={g.id}
						className={`examples-carousel-dot ${i === activeIndex ? "active" : ""}`}
						style={{ "--dot-color": g.color } as React.CSSProperties}
						onClick={() => setActiveIndex(i)}
						type="button"
						aria-label={`Go to ${g.label}`}
					/>
				))}
			</div>
		</div>
	);
}
