"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import Guard from "../../../components/dashboard/Guard";
import { api, prettyDate } from "../../../lib/api";

const STATUSES = ["new", "contacted", "won", "lost"];

function Enquiries() {
  const { token, role, logout } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

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
        <ul className="rows" style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.8rem" }}>
          {rows.map((r) => (
            <li key={r.id} className="card" style={{ padding: "0.9rem" }}>
              <p className="row-name">
                {r.kind === "corporate" ? "Corporate tour" : "Group tour"} · {r.name}
                {r.company ? ` · ${r.company}` : ""}
              </p>
              <p className="meta">
                <a href={`tel:+${r.phone}`}>+{r.phone}</a> · <a href={`https://wa.me/${r.phone}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                {r.email ? <> · {r.email}</> : null}
              </p>
              <p className="meta">
                {r.destination || "Destination not given"} · {r.start_date ? prettyDate(r.start_date) : "date not given"} · {r.people || "?"} people{r.budget ? ` · ${r.budget}` : ""}
              </p>
              {r.notes && <p className="meta">{r.notes}</p>}
              <label className="field" style={{ maxWidth: "12rem" }}>
                <span>Status</span>
                <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
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
      <Enquiries />
    </Guard>
  );
}
