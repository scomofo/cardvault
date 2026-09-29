import { useState } from "react";
import { login, submitEarlyAccess, setToken } from "../lib/authApi.js";

export default function LandingView({ onLogin, setupRequired }) {
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [earlyAccessError, setEarlyAccessError] = useState("");
  const [earlyAccessSuccess, setEarlyAccessSuccess] = useState(false);
  const [earlyAccessLoading, setEarlyAccessLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await login(password);
      if (res.ok && res.data?.token) {
        setToken(res.data.token);
        onLogin();
      } else {
        setLoginError(res.data?.error || "Invalid password");
      }
    } catch {
      setLoginError("Could not connect to server");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleEarlyAccess(e) {
    e.preventDefault();
    setEarlyAccessError("");
    if (!email) {
      setEarlyAccessError("Email is required");
      return;
    }
    setEarlyAccessLoading(true);
    try {
      const res = await submitEarlyAccess({ name, email, message });
      if (res.ok) {
        setEarlyAccessSuccess(true);
      } else {
        setEarlyAccessError(res.data?.error || "Could not submit request");
      }
    } catch {
      setEarlyAccessError("Could not connect to server");
    } finally {
      setEarlyAccessLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <h1 className="app-logo" style={{ fontSize: "2rem", marginBottom: "8px" }}>
            <span className="gold">Card</span><span style={{ color: "var(--tx)" }}>Vault</span>
          </h1>
          <p className="text-dim" style={{ fontSize: "0.9rem" }}>Your personal card collection manager</p>
        </div>

        <div className="card" style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "20px", color: "var(--tx)" }}>
            {setupRequired ? "Set up your account" : "Welcome back"}
          </h2>
          <form onSubmit={handleLogin}>
            <div className="fld">
              <label className="lbl">{setupRequired ? "Create password" : "Password"}</label>
              <input
                className="inp"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={setupRequired ? "Choose a password" : "Enter your password"}
                autoComplete={setupRequired ? "new-password" : "current-password"}
                required
              />
            </div>
            {loginError && (
              <p style={{ color: "var(--red)", fontSize: "0.85rem", marginBottom: "12px" }}>{loginError}</p>
            )}
            <button className="btn btn-primary" type="submit" disabled={loginLoading} style={{ width: "100%" }}>
              {loginLoading ? "Signing in…" : setupRequired ? "Set Password" : "Sign In"}
            </button>
          </form>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
          <div style={{ flex: 1, height: "1px", background: "var(--brd)" }} />
          <span className="text-dim" style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>or request early access</span>
          <div style={{ flex: 1, height: "1px", background: "var(--brd)" }} />
        </div>

        <div className="card">
          <h2 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "20px", color: "var(--tx)" }}>Request Early Access</h2>
          {earlyAccessSuccess ? (
            <p style={{ color: "var(--grn)", fontSize: "0.9rem", textAlign: "center", padding: "8px 0" }}>
              Request submitted! We'll be in touch soon.
            </p>
          ) : (
            <form onSubmit={handleEarlyAccess}>
              <div className="fld">
                <label className="lbl">Name <span className="text-dim">(optional)</span></label>
                <input
                  className="inp"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>
              <div className="fld">
                <label className="lbl">Email</label>
                <input
                  className="inp"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="fld">
                <label className="lbl">Message <span className="text-dim">(optional)</span></label>
                <input
                  className="inp"
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us about your collection"
                />
              </div>
              {earlyAccessError && (
                <p style={{ color: "var(--red)", fontSize: "0.85rem", marginBottom: "12px" }}>{earlyAccessError}</p>
              )}
              <button className="btn btn-ghost" type="submit" disabled={earlyAccessLoading} style={{ width: "100%" }}>
                {earlyAccessLoading ? "Submitting…" : "Request Access"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
