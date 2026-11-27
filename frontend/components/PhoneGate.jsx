"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "../lib/api";
import { useAuth } from "./AuthProvider";
import { useLang } from "./LangProvider";

// Every signed-in guest, host and operator must have a mobile number. The email sign-up form already asks for one,
// but "Sign up with Google" never did, so those accounts had none. This box covers the whole page until a number
// is saved: on the first visit after a Google sign-up, and for any existing account without a number.
// Admins are not stopped. The Google return page is skipped so its redirect can finish first.
export default function PhoneGate() {
  const { ready, token, role, logout } = useAuth();
  const { t } = useLang();
  const pathname = usePathname();
  const [needed, setNeeded] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNeeded(false);
    if (!ready || !token || role === "admin") return;
    let live = true;
    api("/auth/phone", { token }).then((res) => {
      if (live && res.ok && !res.data.phone) setNeeded(true);
    });
    return () => {
      live = false;
    };
  }, [ready, token, role]);

  if (!needed || pathname?.startsWith("/auth/")) return null;

  async function save(e) {
    e.preventDefault();
    setError("");
    if (phone.replace(/\D/g, "").length < 10) return setError(t("auth.errPhone"));
    setBusy(true);
    const res = await api("/auth/phone", { method: "PUT", token, body: { phone } });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setNeeded(false);
  }

  return (
    <div className="phone-gate" role="dialog" aria-modal="true" aria-labelledby="phone-gate-title">
      <form className="phone-gate-card stack" onSubmit={save} noValidate>
        <h2 id="phone-gate-title">{t("pg.title")}</h2>
        <p className="meta">{t("pg.body")}</p>
        <label className="field">
          <span>{t("auth.phone")}</span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="98765 43210"
            autoComplete="tel"
            autoFocus
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn" aria-busy={busy}>
          {t("pg.save")}
        </button>
        <button type="button" className="link-button" onClick={logout}>
          {t("pg.logout")}
        </button>
      </form>
    </div>
  );
}
