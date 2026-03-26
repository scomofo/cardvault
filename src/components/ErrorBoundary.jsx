import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("CardVault error:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: "100vh", background: "#181a20", display: "flex",
        alignItems: "center", justifyContent: "center", padding: 24,
      }}>
        <div style={{
          background: "#1e2235", borderRadius: 16, padding: 32,
          maxWidth: 420, width: "100%", textAlign: "center",
          border: "1px solid rgba(212,160,23,0.3)",
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>&#9888;</div>
          <h2 style={{ color: "#fff", fontSize: 20, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: "#aaa", fontSize: 13, marginBottom: 20, wordBreak: "break-word" }}>
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                padding: "10px 20px", borderRadius: 8, border: "1px solid #d4a017",
                background: "transparent", color: "#d4a017", cursor: "pointer", fontSize: 14,
              }}
            >
              Try to Recover
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "10px 20px", borderRadius: 8, border: "none",
                background: "linear-gradient(135deg, #d4a017, #b8860b)", color: "#fff",
                cursor: "pointer", fontSize: 14, fontWeight: 600,
              }}
            >
              Reload App
            </button>
          </div>
        </div>
      </div>
    );
  }
}
