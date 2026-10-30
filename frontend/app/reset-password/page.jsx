"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") || "");
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Your password needs at least 8 characters.");
      return;
    }
    if (password !== again) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    const res = await api("/auth/reset", { method: "POST", body: { token, password } });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main className="page auth">
        <h1>Password changed</h1>
        <p>Your password is updated. You can log in with it now.</p>
        <p className="auth-alt">
          <Link href="/login">Log in</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="page auth">
      <h1>Choose a new password</h1>
      {!token ? (
        <p>
          This link is not complete. <Link href="/forgot-password">Ask for a new one</Link>.
        </p>
      ) : (
        <form className="stack" onSubmit={onSubmit} noValidate>
          <label className="field">
            <span>New password (at least 8 characters)</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <label className="field">
            <span>Type it again</span>
            <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}{" "}
              {error.includes("expired") && <Link href="/forgot-password">Ask for a new link</Link>}
            </p>
          )}
          <button type="submit" className="btn btn-primary" aria-busy={busy}>
            {busy ? "Saving…" : "Save new password"}
          </button>
        </form>
      )}
    </main>
  );
}
