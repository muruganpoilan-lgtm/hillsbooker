"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import Guard from "../../../components/dashboard/Guard";
import { api, prettyDate } from "../../../lib/api";

const STATUSES = ["new", "contacted", "won", "lost"];
const KIND = { group: "Group tour", corporate: "Corporate tour", package: "Trip package" };

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
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    const res = await api("/admin/enquiries", { token });
    if (res.status === 401) return logout();
    if (!res.ok) return setError(res.error);
    setError("");
    setRows(res.data);
  }, [token, logout]);

  useEffect(() => {
    if (role === "admin") load();
  }, [load, role]);

  async function setStatus(id, status) {
    const res = await api(`/admin/enquiries/${id}`, { method: "PUT", body: { status }, token });
    if (!res.ok) return setError(res.error);
    load();
  }

  const shown = useMemo(() => (rows ? rows.filter((r) => filter === "all" || r.status === filter) : []), [rows, filter]);

  if (role !== "admin") return <p className="empty">Only the Hill Booker admin can open this page.</p>;
  return (
    <>
      <p className="meta"><Link href="/dashboard">← Dashboard</Link></p>
      <h1 className="section-title">Tour enquiries</h1>
      {error && <p className="form-error" role="alert">{error}</p>}
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.length === 0 && <p className="empty">No enquiries with this status.</p>}
        </>
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
