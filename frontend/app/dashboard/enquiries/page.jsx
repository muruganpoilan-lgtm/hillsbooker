"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import Guard from "../../../components/dashboard/Guard";
import { api, prettyDate } from "../../../lib/api";

const STATUSES = ["new", "contacted", "won", "lost", "spam"];
const KIND = { group: "Group tour", corporate: "Corporate tour", package: "Trip package", trip: "Plan my trip" };

// Opens in Excel: a comma-separated file, with quotes around every value.
function downloadCsv(rows) {
  const head = ["Received", "Type", "Name", "Company", "Phone", "Email", "Destination", "Travel date", "People", "Budget", "Notes", "Status"];
  const lines = rows.map((r) => [r.created_at.slice(0, 10), KIND[r.kind] || "Group tour", r.name, r.company || "", `+${r.phone}`, r.email || "", r.destination || "", r.start_date ? String(r.start_date).slice(0, 10) : "", r.people || "", r.budget || "", r.notes || "", r.status]);
  const csv = [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `hillbooker-enquiries-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const th = { textAlign: "left", padding: "0.5rem 0.7rem", borderBottom: "2px solid var(--line)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--bg, #fff)" };
const td = { padding: "0.5rem 0.7rem", borderBottom: "1px solid var(--line)", verticalAlign: "top", fontSize: "0.92rem" };

function Enquiries() {
  const { token, role, logout } = useAuth();
  const [rows, setRows] = useState(null);
  const [blocked, setBlocked] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    const res = await api("/admin/enquiries", { token });
    if (res.status === 401) return logout();
    if (!res.ok) return setError(res.error);
    setError("");
    setRows(res.data);
    const bl = await api("/admin/enquiries/blocklist/all", { token });
    if (bl.ok) setBlocked(bl.data);
  }, [token, logout]);

  useEffect(() => {
    if (role === "admin") load();
  }, [load, role]);

  async function setStatus(id, status) {
    const res = await api(`/admin/enquiries/${id}`, { method: "PUT", body: { status }, token });
    if (!res.ok) return setError(res.error);
    load();
  }

  // Blocks the sender's whole domain, so the same advertiser cannot just switch address.
  async function block(r) {
    const domain = (r.email || "").split("@")[1];
    const kind = domain ? "domain" : "phone";
    const value = domain || r.phone;
    if (!value) return setError("This enquiry has no email or phone to block.");
    if (!window.confirm(`Block ${value}? Everything already in the list from this sender becomes spam, and future enquiries are filed as spam automatically.`)) return;
    const res = await api("/admin/enquiries/blocklist/all", { method: "POST", body: { kind, value, note: `Blocked from the enquiry list (${r.name})` }, token });
    if (!res.ok) return setError(res.error);
    setError("");
    setNotice(`${value} blocked${res.data.also_marked ? `, and ${res.data.also_marked} earlier enquir${res.data.also_marked === 1 ? "y" : "ies"} marked as spam` : ""}.`);
    load();
  }

  async function unblock(b) {
    const res = await api(`/admin/enquiries/blocklist/all/${b.id}`, { method: "DELETE", token });
    if (!res.ok) return setError(res.error);
    setNotice(`${b.value} unblocked. Enquiries already marked as spam stay as they are.`);
    load();
  }

  const shown = useMemo(() => (rows ? rows.filter((r) => filter === "all" || r.status === filter) : []), [rows, filter]);

  if (role !== "admin") return <p className="empty">Only the Hill Booker admin can open this page.</p>;
  return (
    <>
      <p className="meta"><Link href="/dashboard">← Dashboard</Link></p>
      <h1 className="section-title">Tour enquiries</h1>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="meta" role="status">{notice}</p>}
      {rows === null ? (
        <p className="meta">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="empty">No enquiries yet.</p>
      ) : (
        <>
          <div className="actions" style={{ margin: "0.6rem 0", alignItems: "center" }}>
            <label className="field" style={{ maxWidth: "11rem" }}>
              <span>Show</span>
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">All ({rows.length})</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s} ({rows.filter((r) => r.status === s).length})</option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-small" onClick={() => downloadCsv(shown)} disabled={shown.length === 0}>Download for Excel</button>
          </div>
          <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: "10px" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "62rem" }}>
              <thead>
                <tr>
                  {["Received", "Type", "Name", "Phone", "Email", "Destination", "Travel date", "People", "Budget", "Notes", "Status"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{prettyDate(r.created_at.slice(0, 10))}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{KIND[r.kind] || "Group tour"}</td>
                    <td style={td}>
                      <b>{r.name}</b>
                      {r.company && <div className="meta">{r.company}</div>}
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <a href={`tel:+${r.phone}`}>+{r.phone}</a>
                      <div className="meta"><a href={`https://wa.me/${r.phone}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></div>
                    </td>
                    <td style={td}>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : "-"}</td>
                    <td style={td}>{r.destination || "-"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{r.start_date ? prettyDate(String(r.start_date).slice(0, 10)) : "-"}</td>
                    <td style={td}>{r.people || "-"}</td>
                    <td style={td}>{r.budget || "-"}</td>
                    <td style={{ ...td, minWidth: "12rem" }}>{r.notes || "-"}</td>
                    <td style={td}>
                      <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} aria-label={`Status for ${r.name}`}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <div className="meta" style={{ marginTop: "0.3rem" }}>
                        <button type="button" className="btn btn-small" onClick={() => block(r)}>Block sender</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.length === 0 && <p className="empty">No enquiries with this status.</p>}
        </>
      )}
      <h2 className="section-title" style={{ marginTop: "2rem", fontSize: "1.1rem" }}>Blocked senders</h2>
      {blocked.length === 0 ? (
        <p className="meta">Nobody is blocked. Use <b>Block sender</b> on an enquiry to add one.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {blocked.map((b) => (
            <li key={b.id} style={{ display: "flex", gap: "0.8rem", alignItems: "baseline", padding: "0.45rem 0", borderBottom: "1px solid var(--line)" }}>
              <b style={{ minWidth: "14rem" }}>{b.value}</b>
              <span className="meta" style={{ flex: 1 }}>{b.kind}{b.note ? ` · ${b.note}` : ""}</span>
              <button type="button" className="btn btn-small btn-danger" onClick={() => unblock(b)}>Remove</button>
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
      <Enquiries />
    </Guard>
  );
}
