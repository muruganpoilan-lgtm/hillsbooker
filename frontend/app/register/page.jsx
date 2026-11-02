"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, safeNext } from "../../components/AuthProvider";
import GoogleButton from "../../components/GoogleButton";
import { useLang } from "../../components/LangProvider";
import { api } from "../../lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useLang();
  const { ready, token, role: myRole, login } = useAuth();
  const justRegistered = useRef(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [role, setRole] = useState("guest");

  // Someone who is already logged in has no need to create an account: send them to the host dashboard
  // (a guest account is offered "Become a host" there).
  useEffect(() => {
    if (ready && token && !justRegistered.current) router.replace(myRole === "operator" ? "/operator" : "/dashboard");
  }, [ready, token, myRole, router]);

  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("role");
    if (r === "owner" || r === "operator") setRole(r);
  }, []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [invited, setInvited] = useState(false);

  // Came from a friend's invite link: the code is kept by ReferralClaim; just tell the guest about the offer.
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      setInvited(Boolean(ref) || Boolean(localStorage.getItem("hb_ref")));
    } catch {}
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.trim()) {
      setError(t("auth.errNameEmail"));
      return;
    }
    if (form.phone.replace(/\D/g, "").length < 10) {
      setError(t("auth.errPhone"));
      return;
    }
    if (form.password.length < 8) {
      setError(t("auth.errPass"));
      return;
    }
    setBusy(true);
    const res = await api("/auth/register", {
      method: "POST",
      body: {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        role,
      },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    justRegistered.current = true;
    login(res.data.token, res.data.role);
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(safeNext(next, role === "owner" ? "/dashboard" : role === "operator" ? "/operator" : "/"));
  }

  if (ready && token && !justRegistered.current) return <main className="page" />; // already logged in: being sent to the dashboard

  return (
    <main className="page auth">
      <h1>{t("auth.createTitle")}</h1>
      {invited && <p className="ok">{t("auth.invited")}</p>}
      <form className="stack" onSubmit={onSubmit} noValidate>
        <label className="field">
          <span>{t("auth.name")}</span>
          <input type="text" value={form.name} onChange={set("name")} autoComplete="name" />
        </label>
        <label className="field">
          <span>{t("auth.email")}</span>
          <input type="email" value={form.email} onChange={set("email")} autoComplete="email" />
        </label>
        <label className="field">
          <span>{t("auth.phone")}</span>
          <input type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
        </label>
        <label className="field">
          <span>{t("auth.password")}</span>
          <input type="password" value={form.password} onChange={set("password")} autoComplete="new-password" />
        </label>
        <label className="field">
          <span>{t("auth.iWant")}</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="guest">{t("auth.roleGuest")}</option>
            <option value="owner">{t("auth.roleOwner")}</option>
          </select>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" aria-busy={busy}>
          {busy ? t("auth.creating") : t("auth.create")}
        </button>
      </form>
      <div className="stack" style={{ marginTop: "0.8rem" }}>
        <GoogleButton role={role} label={t("auth.googleSignup")} />
      </div>
      <p className="auth-alt">
        {t("auth.haveAccount")} <Link href="/login">{t("auth.login")}</Link>
      </p>
    </main>
  );
}
