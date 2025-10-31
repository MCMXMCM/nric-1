import React, { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error Boundary caught an error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "var(--app-bg-color)",
            border: "1px dotted var(--border-color)",
            color: "var(--text-color)",

            fontSize: "var(--font-size-base)",
            textAlign: "center",
          }}
        >
          <div style={{ marginBottom: "0.5rem" }}>⚠️ Component Error</div>
          <div style={{ opacity: 0.7 }}>
            {this.state.error?.message || "An unexpected error occurred"}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// React function component error boundary for hooks
export const NoteCardErrorBoundary: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  return (
    <ErrorBoundary
      fallback={
        <div
          style={{
            padding: "1rem",
            backgroundColor: "var(--app-bg-color)",
            border: "1px dotted var(--border-color)",
            color: "var(--text-color)",

            fontSize: "var(--font-size-base)",
            textAlign: "center",
            opacity: 0.7,
          }}
        >
          Note temporarily unavailable
        </div>
      }
      onError={(error, errorInfo) => {
        console.error("NoteCard Error:", error);
        console.error("Component Stack:", errorInfo.componentStack);
      }}
    >
      {children}
    </ErrorBoundary>
  );
};
