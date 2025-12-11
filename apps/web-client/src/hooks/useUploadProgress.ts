/**
 * useUploadProgress Hook
 * Manages file upload progress state for user-initiated file uploads
 */

import { useCallback, useState } from "react";

export interface UploadProgress {
	currentFile: string;
	currentIndex: number;
	totalFiles: number;
}

export function useUploadProgress() {
	const [isUploadingFiles, setIsUploadingFiles] = useState(false);
	const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
		currentFile: "",
		currentIndex: 0,
		totalFiles: 0,
	});

	const startUpload = useCallback(
		(totalFiles: number, firstFileName?: string) => {
			setIsUploadingFiles(true);
			setUploadProgress({
				currentFile: firstFileName || "",
				currentIndex: 1,
				totalFiles,
			});
		},
		[],
	);

	const updateUploadProgress = useCallback(
		(currentFile: string, currentIndex: number) => {
			setUploadProgress((prev) => ({
				...prev,
				currentFile,
				currentIndex,
			}));
		},
		[],
	);

	const completeUpload = useCallback(() => {
		setIsUploadingFiles(false);
		setUploadProgress({
			currentFile: "",
			currentIndex: 0,
			totalFiles: 0,
		});
	}, []);

	return {
		isUploadingFiles,
		setIsUploadingFiles,
		uploadProgress,
		setUploadProgress,
		startUpload,
		updateUploadProgress,
		completeUpload,
	};
}
