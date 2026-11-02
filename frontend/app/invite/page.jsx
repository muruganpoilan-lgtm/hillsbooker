"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../components/AuthProvider";
import { useLang } from "../../components/LangProvider";
import { api, money, prettyDate } from "../../lib/api";

export default function InvitePage() {
  const { ready, token, logout } = useAuth();
  const { t } = useLang();
  const [info, setInfo] = useState(null);
  const [mine, setMine] = useState([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      window.location.replace("/login?next=/invite");
      return;
    }
    (async () => {
      const [a, b] = await Promise.all([api("/referrals/me", { token }), api("/coupons/mine", { token })]);
      if (a.status === 401) return logout();
      if (!a.ok) return setError(a.error);
      setInfo(a.data);
      if (b.ok) setMine(b.data);
    })();
  }, [ready, token, logout]);

  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setCopied("");
    }
  }

  if (error) return <main className="page"><div className="empty" role="alert"><p>{error}</p></div></main>;
  if (!info) return <main className="page"><p className="result-summary">{t("saved.loading")}</p></main>;

  const text = t("inv.shareText", { amt: money(info.friend_amount), link: info.link });
  return (
    <main className="page">
      <h1 className="result-title">{t("inv.title", { amt: money(info.referrer_amount) })}</h1>
      <p className="result-summary">
        {t("inv.intro", { friend: money(info.friend_amount), me: money(info.referrer_amount), min: money(info.min_total) })}
      </p>

      <section className="card invite-box">
        <p className="meta">{t("inv.link")}</p>
        <p className="invite-link">{info.link}</p>
        <div className="actions">
          <button type="button" className="btn btn-primary btn-small" onClick={() => copy(info.link, "link")}>{copied === "link" ? t("inv.copied") : t("inv.copyLink")}</button>
          <a className="btn btn-small" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">{t("inv.wa")}</a>
          <button type="button" className="btn btn-small" onClick={() => copy(info.code, "code")}>{copied === "code" ? t("inv.copied") : t("inv.copyCode", { c: info.code })}</button>
        </div>
        <p className="meta">{t("inv.stats", { a: info.invited, b: info.rewarded })}</p>
      </section>

      <h2 className="mini-title" style={{ marginTop: "1.5rem" }}>{t("inv.coupons")}</h2>
      {mine.length === 0 ? (
        <p className="meta">{t("inv.noCoupons")}</p>
      ) : (
        <ul className="rows" style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.6rem" }}>
          {mine.map((c) => (
            <li key={c.code} className="card" style={{ padding: "0.8rem" }}>
              <p className="row-name">{t("inv.cpOff", { c: c.code, v: money(c.value) })}</p>
              <p className="meta">
                {t("inv.cpMin", { min: money(c.min_total) })}{c.valid_until ? t("inv.cpUntil", { d: prettyDate(String(c.valid_until).slice(0, 10)) }) : ""}{t("inv.cpHow")}
              </p>
              <button type="button" className="btn btn-small" onClick={() => copy(c.code, c.code)}>{copied === c.code ? t("inv.copied") : t("inv.copyCodeShort")}</button>
            </li>
          ))}
        </ul>
      )}
      <p className="meta" style={{ marginTop: "1rem" }}>
        {t("inv.noCash")} <Link href="/terms">{t("inv.terms")}</Link>.
      </p>
    </main>
  );
}
