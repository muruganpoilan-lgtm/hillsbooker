"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Enter the email you signed up with.");
      return;
    }
    setBusy(true);
    const res = await api("/auth/forgot", { method: "POST", body: { email: email.trim() } });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSent(true);
  }

  return (
    <main className="page auth">
      <h1>Forgot your password?</h1>
      {sent ? (
        <div className="stack">
          <p>
            If <b>{email.trim()}</b> has a Hill Booker account, we have sent a link to choose a new password. It works for 1 hour. Check your spam folder too.
          </p>
          <p className="auth-alt">
            <Link href="/login">Back to log in</Link>
          </p>
        </div>
      ) : (
        <form className="stack" onSubmit={onSubmit} noValidate>
          <p>Enter your email and we will send you a link to set a new password.</p>
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" aria-busy={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
          <p className="auth-alt">
            <Link href="/login">Back to log in</Link>
          </p>
        </form>
      )}
    </main>
  );
}
