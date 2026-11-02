"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, safeNext } from "../../components/AuthProvider";
import GoogleButton from "../../components/GoogleButton";
import { useLang } from "../../components/LangProvider";
import { api } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLang();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError(t("auth.errLogin"));
      return;
    }
    setBusy(true);
    const res = await api("/auth/login", { method: "POST", body: { email: email.trim(), password } });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    login(res.data.token, res.data.role);
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(safeNext(next, "/"));
  }

  return (
    <main className="page auth">
      <h1>{t("auth.login")}</h1>
      <form className="stack" onSubmit={onSubmit} noValidate>
        <label className="field">
          <span>{t("auth.email")}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="field">
          <span>{t("auth.password")}</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <p style={{ margin: 0, textAlign: "right" }}>
          <Link href="/forgot-password">{t("auth.forgot")}</Link>
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" aria-busy={busy}>
          {busy ? t("auth.logging") : t("auth.login")}
        </button>
      </form>
      <div className="stack" style={{ marginTop: "0.8rem" }}>
        <GoogleButton />
      </div>
      <p className="auth-alt">
        {t("auth.newHere")} <Link href="/register">{t("auth.createLink")}</Link>
      </p>
    </main>
  );
}
