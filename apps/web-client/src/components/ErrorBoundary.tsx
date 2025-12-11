/**
 * Error Boundary Component
 *
 * Catches JavaScript errors in child component tree and displays a fallback UI.
 * Logs errors to the structured logger for debugging.
 */

import type React from "react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { createLogger } from "../utils/logger";

const logger = createLogger("ErrorBoundary");

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
	onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
	hasError: boolean;
	error: Error | null;
	errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null,
		};
	}

	static getDerivedStateFromError(error: Error): Partial<State> {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		this.setState({ errorInfo });

		// Log to structured logger
		logger.error("React component error", error, {
			componentStack: errorInfo.componentStack,
		});

		// Call optional error handler
		this.props.onError?.(error, errorInfo);
	}

	handleRetry = (): void => {
		this.setState({
			hasError: false,
			error: null,
			errorInfo: null,
		});
	};

	render(): ReactNode {
		if (this.state.hasError) {
			// Custom fallback if provided
			if (this.props.fallback) {
				return this.props.fallback;
			}

			// Default fallback UI
			return (
				<div className="error-boundary-fallback">
					<div className="error-boundary-content">
						<h2>Something went wrong</h2>
						<p>An unexpected error occurred. Please try again.</p>
						{import.meta.env.DEV && this.state.error && (
							<details className="error-boundary-details">
								<summary>Error Details (Development Only)</summary>
								<pre className="error-boundary-stack">
									{this.state.error.message}
									{this.state.errorInfo?.componentStack}
								</pre>
							</details>
						)}
						<button className="error-boundary-retry" onClick={this.handleRetry}>
							Try Again
						</button>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}

/**
 * Hook-friendly wrapper for error boundaries
 * Wraps a component with an error boundary
 */
export function withErrorBoundary<P extends object>(
	WrappedComponent: React.ComponentType<P>,
	fallback?: ReactNode,
): React.FC<P> {
	const WithErrorBoundary: React.FC<P> = (props) => (
		<ErrorBoundary fallback={fallback}>
			<WrappedComponent {...props} />
		</ErrorBoundary>
	);

	WithErrorBoundary.displayName = `WithErrorBoundary(${WrappedComponent.displayName || WrappedComponent.name || "Component"})`;

	return WithErrorBoundary;
}

export default ErrorBoundary;
