import { CredentialStore } from "@ide/storage";
import { useEffect, useState } from "react";
import { queryService } from "../services/streaming-query-service";
import { connectionHealthChecker } from "../utils/connectionHealthCheck";
import { createLogger } from "../utils/logger";

const logger = createLogger("AppInit");

interface UseAppInitializationOptions {
	showToast: (
		message: string,
		type: "success" | "error" | "info" | "warning",
		duration?: number,
	) => void;
}

interface UseAppInitializationReturn {
	initializing: boolean;
	initError: string | null;
}

/**
 * Hook to manage application initialization
 * - Initializes query service with credential store
 * - Starts connection health checker
 * - Handles BigQuery auto-connect
 */
export function useAppInitialization({
	showToast,
}: UseAppInitializationOptions): UseAppInitializationReturn {
	const [initializing, setInitializing] = useState(true);
	const [initError, setInitError] = useState<string | null>(null);

	useEffect(() => {
		const credentialStore = new CredentialStore();
		queryService
			.initialize(credentialStore)
			.then(async () => {
				setInitializing(false);
				logger.info("Query services initialized successfully");

				// Start connection health checks
				connectionHealthChecker.start();

				// Auto-connect to BigQuery if enabled
				const bigQueryAutoConnect =
					localStorage.getItem("bigquery-auto-connect") === "true";
				if (bigQueryAutoConnect) {
					try {
						const connected = await queryService.restoreBigQueryConnection();
						if (connected) {
							showToast("Connected to BigQuery", "success", 3000);
						}
					} catch (err) {
						logger.error("BigQuery auto-connect error", err);
						// Don't show error toast - user can manually connect if needed
					}
				}
			})
			.catch((err) => {
				setInitializing(false);
				setInitError(
					err instanceof Error ? err.message : "Failed to initialize database",
				);
				logger.error("Failed to initialize query services", err);
			});

		// Cleanup on unmount
		return () => {
			connectionHealthChecker.stop();
		};
	}, [showToast]);

	return {
		initializing,
		initError,
	};
}
