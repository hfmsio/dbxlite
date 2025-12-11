/**
 * useExportProgress Hook
 * Manages file export (CSV/JSON/Parquet) progress state and elapsed time tracking
 */

import { useCallback, useEffect, useState } from "react";

export interface ExportProgress {
	currentStage: string;
	currentStep: number;
	totalSteps: number;
	fileName: string;
	fileType: "csv" | "json" | "parquet" | "";
}

export interface ExportStartParams {
	fileType: "csv" | "json" | "parquet";
	fileName: string;
	totalSteps: number;
}

export interface ExportProgressParams {
	currentStage: string;
	currentStep: number;
}

const initialExportProgress: ExportProgress = {
	currentStage: "",
	currentStep: 0,
	totalSteps: 0,
	fileName: "",
	fileType: "",
};

export function useExportProgress() {
	const [isExporting, setIsExporting] = useState(false);
	const [exportStartTime, setExportStartTime] = useState<number>(0);
	const [exportElapsedSeconds, setExportElapsedSeconds] = useState<number>(0);
	const [exportProgress, setExportProgress] = useState<ExportProgress>(
		initialExportProgress,
	);

	// Update export elapsed time every second
	useEffect(() => {
		if (isExporting && exportStartTime > 0) {
			const interval = setInterval(() => {
				const elapsed = Math.floor((Date.now() - exportStartTime) / 1000);
				setExportElapsedSeconds(elapsed);
			}, 1000);
			return () => clearInterval(interval);
		}
	}, [isExporting, exportStartTime]);

	const handleExportStart = useCallback((params: ExportStartParams) => {
		setIsExporting(true);
		setExportStartTime(Date.now());
		setExportElapsedSeconds(0);
		setExportProgress({
			currentStage: "",
			currentStep: 0,
			totalSteps: params.totalSteps,
			fileName: params.fileName,
			fileType: params.fileType,
		});
	}, []);

	const handleExportProgress = useCallback((params: ExportProgressParams) => {
		setExportProgress((prev) => ({
			...prev,
			currentStage: params.currentStage,
			currentStep: params.currentStep,
		}));
	}, []);

	const handleExportComplete = useCallback(() => {
		setIsExporting(false);
		setExportStartTime(0);
		setExportElapsedSeconds(0);
		setExportProgress(initialExportProgress);
	}, []);

	const handleExportError = useCallback(() => {
		setIsExporting(false);
		setExportStartTime(0);
		setExportElapsedSeconds(0);
		setExportProgress(initialExportProgress);
	}, []);

	return {
		isExporting,
		exportElapsedSeconds,
		exportProgress,
		handleExportStart,
		handleExportProgress,
		handleExportComplete,
		handleExportError,
	};
}
