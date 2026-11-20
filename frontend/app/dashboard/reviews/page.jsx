"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import Guard from "../../../components/dashboard/Guard";
import { api, prettyDate } from "../../../lib/api";

const REASONS = ["Abusive or rude language", "Spam or advertising", "Phone number or personal details", "Not about this stay", "Owner complaint, checked"];
const TABS = [
  ["live", "On the site"],
  ["removed", "Removed"],
];

const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);

function Reviews() {
  const { token, role, logout } = useAuth();
  const [show, setShow] = useState("live");
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [removing, setRemoving] = useState(null);
  const [reason, setReason] = useState(REASONS[0]);

  const load = useCallback(async () => {
    const res = await api(`/admin/reviews?show=${show}`, { token });
    if (res.status === 401) return logout();
    if (!res.ok) return setError(res.error);
    setError("");
    setRows(res.data);
  }, [token, logout, show]);

  useEffect(() => {
    if (role === "admin") {
      setRows(null);
      load();
    }
  }, [load, role]);

  async function act(r, action) {
    setBusy(r.id);
    setError("");
    setNotice("");
    const res = await api(`/admin/reviews/${r.id}/${action}`, { method: "POST", token, body: action === "remove" ? { reason } : undefined });
    setBusy("");
    if (res.status === 401) return logout();
    if (!res.ok) return setError(res.error);
    setRemoving(null);
    const score = Number(res.data.rating_count) > 0 ? `${Number(res.data.rating_avg).toFixed(1)} from ${res.data.rating_count} review${res.data.rating_count === 1 ? "" : "s"}` : "no reviews";
    setNotice(`${action === "remove" ? "Review removed" : "Review restored"}. ${r.property} now shows ${score}.`);
    load();
  }

  if (role !== "admin") return <p className="empty">Only the Hill Booker admin can open this page.</p>;

  const needle = q.trim().toLowerCase();
  const list = (rows || []).filter((r) => !needle || [r.property, r.city, r.guest, r.comment].join(" ").toLowerCase().includes(needle));

  return (
    <>
      <h1 className="section-title">Guest reviews</h1>
      <p className="meta">
        Guests review a stay after they check out, and the review shows on the property page straight away. Remove reviews with abuse, spam or
        phone numbers. A removed review is hidden from guests and left out of the star rating; the guest can't post another one for that stay. You can
        restore it from the Removed tab.
      </p>

      <p className="tabs" style={{ marginTop: "1rem" }}>
        {TABS.map(([k, label]) =>
          k === show ? (
            <b key={k}>{label}</b>
          ) : (
            <a key={k} href="#" onClick={(e) => { e.preventDefault(); setShow(k); }}>
              {label}
            </a>
          )
        )}
      </p>

      <input className="rv-filter" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by property, city, guest or words in the review" aria-label="Filter reviews" />

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      {removing && (
        <section className="ov-panel rv-confirm" role="dialog" aria-label="Remove review">
          <h2>Remove this review?</h2>
          <p>
            <b>{removing.guest}</b> on <b>{removing.property}</b>: <span className="rv-stars">{stars(removing.rating)}</span>
          </p>
          {removing.comment && <p className="rv-text">“{removing.comment}”</p>}
          <label className="field">
            <span>Reason (only you see this)</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <div className="actions" style={{ marginTop: "0.8rem" }}>
            <button type="button" className="btn btn-danger" disabled={busy === removing.id} aria-busy={busy === removing.id} onClick={() => act(removing, "remove")}>
              Remove review
            </button>
            <button type="button" className="btn" onClick={() => setRemoving(null)}>
              Keep it
            </button>
          </div>
        </section>
      )}

      {rows === null && !error && <p className="empty">Loading reviews…</p>}
      {rows && list.length === 0 && (
        <p className="empty">{show === "live" ? (needle ? "No reviews match that filter." : "No reviews yet. They appear here as guests review their stays.") : "No removed reviews."}</p>
      )}

      <ul className="rv-list">
        {list.map((r) => (
          <li key={r.id} className={`rv-row${r.removed_at ? " rv-gone" : ""}`}>
            <div className="rv-top">
              <span className="rv-stars" aria-label={`${r.rating} out of 5 stars`}>{stars(r.rating)}</span>
              <Link href={`/properties/${r.property_id}#reviews`} target="_blank" className="rv-prop">
                {r.property}
              </Link>
              <span className="meta">{r.city}</span>
            </div>
            {r.comment ? <p className="rv-text">“{r.comment}”</p> : <p className="meta">No comment, stars only.</p>}
            <p className="meta">
              {r.guest} · {r.guest_phone ? `${r.guest_phone} · ` : ""}
              {r.guest_email} · stayed {prettyDate(String(r.check_in).slice(0, 10))} · reviewed {prettyDate(String(r.created_at).slice(0, 10))}
            </p>
            {r.removed_at && (
              <p className="rv-why">
                Removed {prettyDate(String(r.removed_at).slice(0, 10))}
                {r.removed_reason ? `: ${r.removed_reason}` : ""}
              </p>
            )}
            <div className="actions">
              {r.removed_at ? (
                <button type="button" className="btn btn-small" disabled={busy === r.id} aria-busy={busy === r.id} onClick={() => act(r, "restore")}>
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  disabled={busy === r.id}
                  onClick={() => {
                    setReason(REASONS[0]);
                    setRemoving(r);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Page() {
  return (
    <Guard>
      <Reviews />
    </Guard>
  );
}
