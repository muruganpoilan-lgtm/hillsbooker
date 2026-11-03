"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import Guard from "../../../components/dashboard/Guard";
import { api, prettyDate } from "../../../lib/api";

const REASONS = ["Too dark or blurry", "Not a photo of this place", "Has a watermark or phone number", "Photo belongs to someone else"];

function Review() {
  const { token, role, logout } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(null); // { items, label }
  const [reason, setReason] = useState(REASONS[0]);

  const load = useCallback(async () => {
    const res = await api("/admin/photos/pending", { token });
    if (res.status === 401) return logout();
    if (!res.ok) return setError(res.error);
    setError("");
    setRows(res.data);
  }, [token, logout]);

  useEffect(() => {
    if (role === "admin") load();
  }, [load, role]);

  const groups = useMemo(() => {
    const m = new Map();
    for (const r of rows || []) {
      const key = `${r.kind === "vehicle" ? "v" : "p"}${r.listing_id}`;
      if (!m.has(key)) m.set(key, { key, kind: r.kind, id: r.listing_id, name: r.listing, city: r.city, host: r.host, photos: [] });
      m.get(key).photos.push(r);
    }
    return [...m.values()];
  }, [rows]);

  async function review(items, action, why) {
    setBusy(true);
    setError("");
    const res = await api("/admin/photos/review", { method: "POST", body: { items: items.map((p) => ({ kind: p.kind, id: p.id })), action, reason: why || null }, token });
    setBusy(false);
    if (res.status === 401) return logout();
    if (!res.ok) return setError(res.error);
    setRejecting(null);
    load();
  }

  if (role !== "admin") return <p className="empty">Only the Hill Booker admin can open this page.</p>;
  return (
    <>
      <h1 className="section-title">Photo review</h1>
      <p className="meta">Photos that hosts upload stay hidden from guests until you approve them. Click a photo to see it full size. If you reject one, the host sees your reason and can upload a better photo.</p>
      {error && <p className="form-error" role="alert">{error}</p>}

      {rejecting && (
        <section className="ov-panel" style={{ margin: "1rem 0", borderColor: "var(--brick)" }} role="dialog" aria-label="Reject photos">
          <h2>Reject {rejecting.items.length === 1 ? "this photo" : `these ${rejecting.items.length} photos`}?</h2>
          <label className="field" style={{ maxWidth: "26rem" }}>
            <span>Reason the host will see</span>
            <select value={REASONS.includes(reason) ? reason : "other"} onChange={(e) => setReason(e.target.value === "other" ? "" : e.target.value)}>
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              <option value="other">Other (write below)</option>
            </select>
          </label>
          {!REASONS.includes(reason) && (
            <label className="field" style={{ maxWidth: "26rem" }}>
              <span>Write the reason</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
            </label>
          )}
          <div className="actions" style={{ marginTop: "0.6rem" }}>
            <button type="button" className="btn btn-small btn-danger" disabled={busy || reason.trim().length < 3} onClick={() => review(rejecting.items, "reject", reason)}>
              {busy ? "Saving…" : "Reject"}
            </button>
            <button type="button" className="btn btn-small" onClick={() => setRejecting(null)}>Cancel</button>
          </div>
        </section>
      )}

      {rows === null ? (
        <p className="meta">Loading…</p>
      ) : groups.length === 0 ? (
        <div className="ov-panel" style={{ marginTop: "1rem" }}>
          <p className="ov-clear">All clear. No photos are waiting.</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="ov-panel" style={{ marginTop: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <h2 style={{ marginBottom: 0 }}>{g.name}</h2>
                <p className="meta">{g.city} · host {g.host} · {g.kind === "vehicle" ? "vehicle" : "stay"} · {g.photos.length} {g.photos.length === 1 ? "photo" : "photos"}</p>
              </div>
              <div className="actions">
                <Link className="btn btn-small" href={g.kind === "vehicle" ? `/operator/vehicles/${g.id}` : `/dashboard/properties/${g.id}`}>Open listing</Link>
                <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => review(g.photos, "approve")}>Approve all {g.photos.length}</button>
              </div>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: "0.8rem 0 0", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))", gap: "0.8rem" }}>
              {g.photos.map((p) => (
                <li key={`${p.kind}${p.id}`} style={{ border: "1px solid var(--line)", borderRadius: "10px", overflow: "hidden", background: "var(--paper)" }}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" title="Open full size">
                    <img src={p.url} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block" }} />
                  </a>
                  <div style={{ padding: "0.5rem 0.6rem" }}>
                    <p className="meta">{p.room ? `Room: ${p.room}` : p.kind === "vehicle" ? "Vehicle photo" : "Property photo"} · {prettyDate(String(p.created_at).slice(0, 10))}</p>
                    <div className="actions" style={{ marginTop: "0.4rem" }}>
                      <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => review([p], "approve")}>Approve</button>
                      <button type="button" className="btn btn-small" disabled={busy} onClick={() => { setReason(REASONS[0]); setRejecting({ items: [p] }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Reject</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

export default function Page() {
  return (
    <Guard>
      <Review />
    </Guard>
  );
}
