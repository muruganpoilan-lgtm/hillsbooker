"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import Guard from "../../../components/dashboard/Guard";
import { api, prettyDate } from "../../../lib/api";

const TOPIC = { booking: "Booking help", payment: "Payment or refund", cancellation: "Cancellation", vehicle: "Car or bike rental", host: "Listing my property", app: "App or website problem", other: "Something else" };
const STATUS = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

// Opens in Excel: a comma-separated file, with quotes around every value.
function downloadCsv(rows) {
  const head = ["Ticket", "Received", "Topic", "Name", "Phone", "Email", "Booking", "Message", "Your note", "Status"];
  const lines = rows.map((r) => [`#${r.ticket_no}`, r.created_at.slice(0, 10), TOPIC[r.topic], r.name, `+${r.phone}`, r.email || "", r.booking_ref || "", r.message, r.admin_note || "", STATUS[r.status]]);
  const csv = [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `hillbooker-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const th = { textAlign: "left", padding: "0.5rem 0.7rem", borderBottom: "2px solid var(--line)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--bg, #fff)" };
const td = { padding: "0.5rem 0.7rem", borderBottom: "1px solid var(--line)", verticalAlign: "top", fontSize: "0.92rem" };

function Tickets() {
  const { token, role, logout } = useAuth();
  const [rows, setRows] = useState(null);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("active");

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

  async function save(r, status, note) {
    const res = await api(`/admin/support/${r.id}`, { method: "PUT", body: { status, admin_note: note }, token });
    if (!res.ok) return setError(res.error);
    load();
  }

  const shown = useMemo(() => {
    if (!rows) return [];
    if (filter === "all") return rows;
    if (filter === "active") return rows.filter((r) => r.status !== "resolved");
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  if (role !== "admin") return <p className="empty">Only the Hill Booker admin can open this page.</p>;
  const active = rows ? rows.filter((r) => r.status !== "resolved").length : 0;
  return (
    <>
      <p className="meta"><Link href="/dashboard">← Dashboard</Link></p>
      <h1 className="section-title">Customer-care tickets</h1>
      <p className="meta">Messages sent from hillbooker.com/support. Call or WhatsApp the guest, type a short note, then set the status to Resolved. {rows ? `${active} not resolved.` : ""}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {rows === null ? (
        <p className="meta">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="empty">No tickets yet.</p>
      ) : (
        <>
          <div className="actions" style={{ margin: "0.6rem 0", alignItems: "flex-end" }}>
            <label className="field" style={{ maxWidth: "12rem" }}>
              <span>Show</span>
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="active">Not resolved ({active})</option>
                <option value="all">All ({rows.length})</option>
                {Object.entries(STATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v} ({rows.filter((r) => r.status === k).length})</option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-small" onClick={() => downloadCsv(shown)} disabled={shown.length === 0}>Download for Excel</button>
          </div>
          <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: "10px" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "70rem" }}>
              <thead>
                <tr>
                  {["Ticket", "Received", "Topic", "Name", "Phone", "Email", "Booking", "Message", "Your note (only you see it)", "Status"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} style={{ opacity: r.status === "resolved" ? 0.65 : 1 }}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}><b>#{r.ticket_no}</b></td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{prettyDate(r.created_at.slice(0, 10))}</td>
                    <td style={td}>{TOPIC[r.topic]}</td>
                    <td style={td}><b>{r.name}</b></td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <a href={`tel:+${r.phone}`}>+{r.phone}</a>
                      <div className="meta"><a href={`https://wa.me/${r.phone}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></div>
                    </td>
                    <td style={td}>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : "-"}</td>
                    <td style={td}>{r.booking_ref || "-"}</td>
                    <td style={{ ...td, minWidth: "14rem", whiteSpace: "pre-wrap" }}>{r.message}</td>
                    <td style={{ ...td, minWidth: "12rem" }}>
                      <input
                        value={notes[r.id] ?? ""}
                        maxLength={1000}
                        aria-label={`Note for ticket ${r.ticket_no}`}
                        onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                        onBlur={() => (notes[r.id] ?? "") !== (r.admin_note || "") && save(r, r.status, notes[r.id] ?? "")}
                        style={{ width: "100%" }}
                      />
                    </td>
                    <td style={td}>
                      <select value={r.status} onChange={(e) => save(r, e.target.value, notes[r.id] ?? "")} aria-label={`Status for ticket ${r.ticket_no}`}>
                        {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.length === 0 && <p className="empty">No tickets with this status.</p>}
        </>
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
