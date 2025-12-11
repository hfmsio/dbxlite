import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	AlertCircleIcon,
	AlertTriangleIcon,
	CheckIcon,
	InfoIcon,
} from "./Icons";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
	id: string;
	message: string;
	type: ToastType;
	duration?: number;
	timestamp: number;
}

export interface ToastHistoryEntry extends Toast {
	dismissed: boolean;
}

interface ToastContextType {
	toasts: Toast[];
	toastHistory: ToastHistoryEntry[];
	showToast: (message: string, type?: ToastType, duration?: number) => void;
	removeToast: (id: string) => void;
	clearHistory: () => void;
	setShowHistoryHandler: (handler: () => void) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
	const context = useContext(ToastContext);
	if (!context) {
		throw new Error("useToast must be used within ToastProvider");
	}
	return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);
	const [toastHistory, setToastHistory] = useState<ToastHistoryEntry[]>([]);
	const [showHistoryHandler, setShowHistoryHandlerState] = useState<
		(() => void) | null
	>(null);

	const showToast = useCallback(
		(message: string, type: ToastType = "info", duration: number = 4000) => {
			const id = `toast-${Date.now()}-${Math.random()}`;
			const timestamp = Date.now();
			const toast: Toast = { id, message, type, duration, timestamp };

			setToasts((prev) => [...prev, toast]);
			setToastHistory((prev) => [...prev, { ...toast, dismissed: false }]);

			// Timer is now managed in ToastItem component to support pause on hover
		},
		[],
	);

	const removeToast = useCallback((id: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
		setToastHistory((prev) =>
			prev.map((t) => (t.id === id ? { ...t, dismissed: true } : t)),
		);
	}, []);

	const clearHistory = useCallback(() => {
		setToastHistory([]);
	}, []);

	const setShowHistoryHandler = useCallback((handler: () => void) => {
		setShowHistoryHandlerState(() => handler);
	}, []);

	return (
		<ToastContext.Provider
			value={{
				toasts,
				toastHistory,
				showToast,
				removeToast,
				clearHistory,
				setShowHistoryHandler,
			}}
		>
			{children}
			<ToastContainer
				toasts={toasts}
				onRemove={removeToast}
				onShowHistory={showHistoryHandler || undefined}
				historyCount={toastHistory.length}
			/>
		</ToastContext.Provider>
	);
}

interface ToastContainerProps {
	toasts: Toast[];
	onRemove: (id: string) => void;
	onShowHistory?: () => void;
	historyCount?: number;
}

function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
	if (toasts.length === 0) return null;

	return (
		<div
			style={{
				position: "fixed",
				bottom: 0,
				left: 0,
				right: 0,
				zIndex: 9999,
				display: "flex",
				flexDirection: "row-reverse", // Newest on left, older push right
				alignItems: "center",
				gap: "4px",
				padding: "2px 8px",
				pointerEvents: "none",
				overflowX: "hidden", // Hide toasts that overflow to the right
				overflowY: "hidden",
				maxHeight: "32px", // Tiny space at bottom
			}}
		>
			{toasts.map((toast) => (
				<ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
			))}
		</div>
	);
}

function ToastItem({
	toast,
	onRemove,
}: {
	toast: Toast;
	onRemove: (id: string) => void;
}) {
	const [isHovered, _setIsHovered] = useState(false);
	const [isVanishing, setIsVanishing] = useState(false);
	const timerRef = useRef<NodeJS.Timeout | null>(null);
	const startTimeRef = useRef<number>(Date.now());
	const remainingTimeRef = useRef<number>(toast.duration || 0);

	useEffect(() => {
		if (!toast.duration || toast.duration <= 0) return;

		const startTimer = () => {
			startTimeRef.current = Date.now();
			timerRef.current = setTimeout(() => {
				// Trigger vanish animation
				setIsVanishing(true);
				// Remove after animation completes (500ms)
				setTimeout(() => {
					onRemove(toast.id);
				}, 500);
			}, remainingTimeRef.current);
		};

		const pauseTimer = () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
				const elapsed = Date.now() - startTimeRef.current;
				remainingTimeRef.current = Math.max(
					0,
					remainingTimeRef.current - elapsed,
				);
			}
		};

		if (isHovered) {
			pauseTimer();
		} else {
			startTimer();
		}

		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
		};
	}, [isHovered, toast.id, toast.duration, onRemove]);

	const getIcon = () => {
		const iconProps = { size: 12, color: "currentColor" };
		switch (toast.type) {
			case "success":
				return <CheckIcon {...iconProps} />;
			case "error":
				return <AlertCircleIcon {...iconProps} />;
			case "warning":
				return <AlertTriangleIcon {...iconProps} />;
			case "info":
				return <InfoIcon {...iconProps} />;
		}
	};

	const getColors = () => {
		switch (toast.type) {
			case "success":
				return { text: "#10b981", bg: "rgba(16, 185, 129, 0.1)" };
			case "error":
				return { text: "#ef4444", bg: "rgba(239, 68, 68, 0.1)" };
			case "warning":
				return { text: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)" };
			case "info":
				return { text: "#3b82f6", bg: "rgba(59, 130, 246, 0.1)" };
		}
	};

	const colors = getColors();

	return (
		<div
			style={{
				background: colors.bg,
				border: "none",
				borderRadius: "4px",
				color: colors.text,
				padding: "4px 12px",
				display: "inline-flex",
				alignItems: "center",
				gap: "6px",
				animation: isVanishing
					? "vanishToHistory 0.5s cubic-bezier(0.4, 0.0, 1, 1) forwards"
					: "none",
				pointerEvents: "none",
				fontSize: "11px",
				fontWeight: 400,
				height: "24px",
				overflow: "hidden",
				flexShrink: 0, // Don't shrink when space is tight
				whiteSpace: "nowrap",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: "6px",
					overflow: "hidden",
				}}
			>
				<span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
					{getIcon()}
				</span>
				<span
					style={{
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}
				>
					{toast.message}
				</span>
			</div>
			<style>{`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes vanishToHistory {
          0% {
            transform: translateY(0) translateX(0) scale(1);
            opacity: 1;
          }
          50% {
            transform: translateY(10vh) translateX(30vw) scale(0.8);
            opacity: 0.7;
          }
          100% {
            transform: translateY(20vh) translateX(45vw) scale(0.3);
            opacity: 0;
          }
        }
      `}</style>
		</div>
	);
}
