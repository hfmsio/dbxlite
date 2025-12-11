import { DownloadIcon, StopIcon, UploadIcon } from "./Icons";

interface UploadProgress {
	currentFile: string;
	currentIndex: number;
	totalFiles: number;
}

interface ExportProgress {
	fileType: string;
	currentStage: string;
	fileName: string;
}

interface OverlaysProps {
	// Long running query overlay
	showLongRunningOverlay: boolean;
	queryElapsedSeconds: number;
	onStopQuery: () => void;

	// Upload progress overlay
	isUploadingFiles: boolean;
	uploadProgress: UploadProgress;

	// Export progress overlay
	isExporting: boolean;
	exportProgress: ExportProgress;
	exportElapsedSeconds: number;
}

export default function Overlays({
	showLongRunningOverlay,
	queryElapsedSeconds,
	onStopQuery,
	isUploadingFiles,
	uploadProgress,
	isExporting,
	exportProgress,
	exportElapsedSeconds,
}: OverlaysProps) {
	// Determine export color variant
	const getExportVariant = () => {
		switch (exportProgress.fileType) {
			case "csv":
				return "success";
			case "json":
				return "warning";
			default:
				return "purple";
		}
	};

	return (
		<>
			{showLongRunningOverlay && (
				<div className="overlay-backdrop">
					<div className="overlay-icon-container accent">
						<div className="overlay-spinner" />
						<div className="overlay-spinner-text">
							{queryElapsedSeconds}s
						</div>
					</div>
					<div className="overlay-title">Executing Query</div>
					<div className="overlay-subtitle">
						This query is taking longer than usual to complete
					</div>
					<button
						onClick={onStopQuery}
						className="overlay-stop-btn"
					>
						<StopIcon size={18} />
						Stop Query
					</button>
					<div className="overlay-cancel-hint">
						or press ESC to cancel
					</div>
				</div>
			)}

			{isUploadingFiles && (
				<div className="overlay-backdrop">
					<div className="overlay-icon-container success">
						<UploadIcon size={64} color="var(--color-success)" />
					</div>
					<div className="overlay-title">Uploading Files...</div>
					<div className="overlay-subtitle narrow">
						{uploadProgress.currentFile && (
							<div className="overlay-current-file">
								{uploadProgress.currentFile}
							</div>
						)}
						Processing file {uploadProgress.currentIndex} of{" "}
						{uploadProgress.totalFiles}
					</div>
					<div className="overlay-hint">
						Please wait while files are being uploaded and processed
					</div>
				</div>
			)}

			{isExporting && (
				<div className="overlay-backdrop">
					<div className={`overlay-icon-container ${getExportVariant()}`}>
						<DownloadIcon
							size={64}
							color={
								exportProgress.fileType === "csv"
									? "var(--color-success)"
									: exportProgress.fileType === "json"
										? "var(--color-warning)"
										: "var(--color-purple)"
							}
						/>
					</div>
					<div className="overlay-title">
						Exporting to {exportProgress.fileType.toUpperCase()}...
						{exportElapsedSeconds > 0 && ` (${exportElapsedSeconds}s)`}
					</div>
					<div className="overlay-subtitle narrow wide">
						{exportProgress.currentStage && (
							<div className={`overlay-current-file ${getExportVariant()}`}>
								{exportProgress.currentStage}
							</div>
						)}
						{exportProgress.fileName && (
							<div className="overlay-hint sm">
								{exportProgress.fileName}
							</div>
						)}
					</div>
					<div className="overlay-hint">
						Please wait while your data is being exported
					</div>
					<div className="overlay-cancel-hint">
						Press ESC to cancel
					</div>
				</div>
			)}
		</>
	);
}
