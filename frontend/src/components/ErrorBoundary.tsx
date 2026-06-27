import { Component, type ErrorInfo, type ReactNode } from "react";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";
import RefreshIcon      from "@mui/icons-material/Refresh";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="errorboundary">
          <div className="errorboundary__card">
            <ErrorOutlinedIcon sx={{ fontSize: 48, color: "var(--red)", marginBottom: "12px" }} />
            <h1 className="errorboundary__title">Something went wrong</h1>
            <p className="errorboundary__msg">{this.state.error.message}</p>
            <button className="btn btn--primary" onClick={() => window.location.reload()}>
              <RefreshIcon sx={{ fontSize: 16 }} /> Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
