"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../components/AuthProvider";
import { api, money, prettyDate } from "../../lib/api";

export default function InvitePage() {
  const { ready, token, logout } = useAuth();
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
  if (!info) return <main className="page"><p className="result-summary">Loading…</p></main>;

  const text = `Book hill-station and beach stays on Hill Booker. Sign up with my link and get ${money(info.friend_amount)} off your first stay: ${info.link}`;
  return (
    <main className="page">
      <h1 className="result-title">Invite friends, get {money(info.referrer_amount)} off</h1>
      <p className="result-summary">
        Your friend gets {money(info.friend_amount)} off their first stay. When that stay is confirmed, you get {money(info.referrer_amount)} off your next one. Both coupons work on stays of {money(info.min_total)} or more.
      </p>

      <section className="card invite-box">
        <p className="meta">Your invite link</p>
        <p className="invite-link">{info.link}</p>
        <div className="actions">
          <button type="button" className="btn btn-primary btn-small" onClick={() => copy(info.link, "link")}>{copied === "link" ? "Copied" : "Copy link"}</button>
          <a className="btn btn-small" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
          <button type="button" className="btn btn-small" onClick={() => copy(info.code, "code")}>{copied === "code" ? "Copied" : `Copy code ${info.code}`}</button>
        </div>
        <p className="meta">Friends invited: {info.invited}. Rewarded so far: {info.rewarded}.</p>
      </section>

      <h2 className="mini-title" style={{ marginTop: "1.5rem" }}>Your coupons</h2>
      {mine.length === 0 ? (
        <p className="meta">You have no coupons right now. They show up here when you earn one.</p>
      ) : (
        <ul className="rows" style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.6rem" }}>
          {mine.map((c) => (
            <li key={c.code} className="card" style={{ padding: "0.8rem" }}>
              <p className="row-name">{c.code} · {money(c.value)} off</p>
              <p className="meta">
                Stays of {money(c.min_total)} or more{c.valid_until ? ` · until ${prettyDate(String(c.valid_until).slice(0, 10))}` : ""}. Type it in the Coupon box when you book.
              </p>
              <button type="button" className="btn btn-small" onClick={() => copy(c.code, c.code)}>{copied === c.code ? "Copied" : "Copy code"}</button>
            </li>
          ))}
        </ul>
      )}
      <p className="meta" style={{ marginTop: "1rem" }}>
        Coupons can't be swapped for cash. See the <Link href="/terms">terms</Link>.
      </p>
    </main>
  );
}
