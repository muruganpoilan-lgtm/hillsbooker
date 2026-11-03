"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import Guard from "../../../components/dashboard/Guard";
import { api, prettyDate } from "../../../lib/api";

const TOPIC = { booking: "Booking help", payment: "Payment or refund", cancellation: "Cancellation", vehicle: "Car or bike rental", host: "Listing my property", app: "App or website problem", other: "Something else" };
const STATUS = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

function Tickets() {
  const { token, role, logout } = useAuth();
  const [rows, setRows] = useState(null);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await api("/admin/support", { token });
    if (res.status === 401) return logout();
    if (!res.ok) return setError(res.error);
    setError("");
    setRows(res.data);
    setNotes(Object.fromEntries(res.data.map((r) => [r.id, r.admin_note || ""])));
  }, [token, logout]);

  useEffect(() => {
    if (role === "admin") load();
  }, [load, role]);

  async function save(r, status) {
    const res = await api(`/admin/support/${r.id}`, { method: "PUT", body: { status, admin_note: notes[r.id] || "" }, token });
    if (!res.ok) return setError(res.error);
    load();
  }

  if (role !== "admin") return <p className="empty">Only the Hill Booker admin can open this page.</p>;
  const open = rows ? rows.filter((r) => r.status !== "resolved").length : 0;
  return (
    <>
      <p className="meta"><Link href="/dashboard">← Dashboard</Link></p>
      <h1 className="section-title">Customer-care tickets</h1>
      <p className="meta">Messages sent from hillbooker.com/support. Call or WhatsApp the guest, then write a short note and mark the ticket resolved.{rows ? ` ${open} still open.` : ""}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {rows === null ? (
        <p className="meta">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="empty">No tickets yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.8rem" }}>
          {rows.map((r) => (
            <li key={r.id} className="card" style={{ padding: "0.9rem", opacity: r.status === "resolved" ? 0.7 : 1 }}>
              <p className="row-name">#{r.ticket_no} · {TOPIC[r.topic]} · {STATUS[r.status]}</p>
              <p className="meta">
                {r.name} · <a href={`tel:+${r.phone}`}>+{r.phone}</a> · <a href={`https://wa.me/${r.phone}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                {r.email ? <> · <a href={`mailto:${r.email}`}>{r.email}</a></> : null}
              </p>
              {r.booking_ref && <p className="meta">Booking: {r.booking_ref}</p>}
              <p style={{ whiteSpace: "pre-wrap", margin: "0.4rem 0" }}>{r.message}</p>
              <label className="field">
                <span>Your note (only you see this)</span>
                <input value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} maxLength={1000} />
              </label>
              <div className="actions">
                {r.status !== "in_progress" && r.status !== "resolved" && <button type="button" className="btn btn-small" onClick={() => save(r, "in_progress")}>Mark in progress</button>}
                {r.status !== "resolved" ? <button type="button" className="btn btn-small btn-primary" onClick={() => save(r, "resolved")}>Mark resolved</button> : <button type="button" className="btn btn-small" onClick={() => save(r, "open")}>Reopen</button>}
                <button type="button" className="btn btn-small" onClick={() => save(r, r.status)}>Save note</button>
              </div>
              <p className="meta">Received {prettyDate(r.created_at.slice(0, 10))}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Guard>
      <Tickets />
    </Guard>
  );
}
