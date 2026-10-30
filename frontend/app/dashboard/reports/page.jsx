"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import Guard from "../../../components/dashboard/Guard";
import { API_BASE, api, money } from "../../../lib/api";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function presets() {
  const n = new Date();
  return [
    ["This month", iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)],
    ["Last month", iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), iso(new Date(n.getFullYear(), n.getMonth(), 0))],
    ["This year", iso(new Date(n.getFullYear(), 0, 1)), iso(n)],
  ];
}

function Reports() {
  const { token, role, logout } = useAuth();
  const admin = role === "admin";
  const [from, setFrom] = useState(() => presets()[0][1]);
  const [to, setTo] = useState(() => presets()[0][2]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!from || !to) return;
    const res = await api(`/reports/summary?from=${from}&to=${to}`, { token });
    if (res.status === 401) return logout();
    if (!res.ok) {
      setData(null);
      return setError(res.error);
    }
    setError("");
    setData(res.data);
  }, [token, logout, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  async function download() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/reports/export.xlsx?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) return logout();
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.detail === "string" ? body.detail : "Could not create the report.");
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `hill-booker-report-${from}-to-${to}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || "Could not create the report.");
    }
    setBusy(false);
  }

  const t = data && data.totals;
  const stats = t
    ? [
        ["Paid bookings", t.payments, false],
        ["Advances received", t.advances_received, true],
        ["Refunded", t.refunded, true],
        ["Commission earned", t.commission, true],
        ["Due to hosts", t.due_to_hosts, true],
        ["Paid out to hosts", t.paid_out, true],
      ]
    : [];

  return (
    <>
      <p className="meta">
        <Link href="/dashboard/payments">← Payments</Link>
      </p>
      <h1 className="section-title">Reports</h1>
      <p className="meta">
        {admin ? "All hosts." : "Your bookings only."} Payments are counted on the day the guest paid (India time).
      </p>
      <div className="actions" style={{ flexWrap: "wrap", margin: "0.8rem 0" }}>
        {presets().map(([label, f, tt]) => (
          <button key={label} type="button" className="btn btn-small" onClick={() => { setFrom(f); setTo(tt); }}>
            {label}
          </button>
        ))}
      </div>
      <div className="actions" style={{ flexWrap: "wrap", alignItems: "flex-end", gap: "0.8rem" }}>
        <label className="field">
          <span>From</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" className="btn btn-primary" onClick={download} disabled={busy || !from || !to}>
          {busy ? "Preparing…" : "Download Excel"}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p className="empty">Loading…</p>}
      {data && (
        <>
          <div className="pay-summary">
            {stats.map(([label, v, isMoney]) => (
              <div className="pay-stat" key={label}>
                <span className="meta">{label}</span>
                <b className="price">{isMoney ? money(v) : v}</b>
              </div>
            ))}
          </div>
          {Number(t.fee_owed_by_hosts) > 0 && (
            <p className="meta">Commission owed by hosts whose guests paid by UPI directly: {money(t.fee_owed_by_hosts)}.</p>
          )}
          {admin && (
            <section className="prop-section">
              <h2>By host</h2>
              {data.by_host.length === 0 && <p className="meta">No payments in this period.</p>}
              {data.by_host.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left" }}>
                        <th>Host</th>
                        <th>Bookings</th>
                        <th>Advances</th>
                        <th>Commission</th>
                        <th>Due</th>
                        <th>Paid out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_host.map((h) => (
                        <tr key={h.host_name}>
                          <td>{h.host_name}</td>
                          <td>{h.payments}</td>
                          <td>{money(h.advances_received)}</td>
                          <td>{money(h.commission)}</td>
                          <td>{money(h.due_to_hosts)}</td>
                          <td>{money(h.paid_out)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          <p className="meta">The Excel file also lists every payment with guest, dates, host share and payout details.</p>
        </>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Guard>
      <Reports />
    </Guard>
  );
}
