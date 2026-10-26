"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../components/AuthProvider";
import OperatorGuard from "../../components/dashboard/OperatorGuard";
import { api, money } from "../../lib/api";
import { KIND_LABEL } from "../../lib/vehicles";

const STATUS = { pending: "Waiting for approval", approved: "Live", rejected: "Not approved" };

function Operator() {
  const { token, role, logout } = useAuth();
  const [rows, setRows] = useState(null);
  const [pending, setPending] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await api("/operator/vehicles", { token });
    if (res.status === 401) return logout();
    if (!res.ok) return setError(res.error);
    setError("");
    setRows(res.data);
    if (role === "admin") {
      const p = await api("/admin/vehicles/pending", { token });
      if (p.ok) setPending(p.data);
    }
  }, [token, role, logout]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id, action) {
    const res = await api(`/admin/vehicles/${id}/${action}`, { method: "POST", token });
    if (res.status === 401) return logout();
    if (!res.ok) setError(res.error);
    load();
  }

  return (
    <>
      <div className="dash-head">
        <h1 className="section-title">{role === "admin" ? "All vehicles" : "Your vehicles"}</h1>
        <div className="actions">
          <Link href="/operator/bookings" className="btn btn-small">
            Bookings
          </Link>
          <Link href="/operator/new" className="btn btn-small btn-primary">
            Add a vehicle
          </Link>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {role === "admin" && pending.length > 0 && (
        <section className="notice">
          <h2 className="mini-title">Waiting for your approval</h2>
          <ul className="rows">
            {pending.map((v) => (
              <li key={v.id} className="plain-row">
                <div>
                  <Link href={`/operator/vehicles/${v.id}`} className="row-name">
                    {v.name}
                  </Link>
                  <p className="meta">
                    {KIND_LABEL[v.kind] || v.kind} · {v.seats} seats · {v.city} · {money(v.price_per_day)}/day · {v.operator} ({v.operator_email})
                  </p>
                </div>
                <div className="actions">
                  <button type="button" className="btn btn-small btn-primary" onClick={() => decide(v.id, "approve")}>
                    Approve
                  </button>
                  <button type="button" className="btn btn-small btn-danger" onClick={() => decide(v.id, "reject")}>
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {rows === null && !error && <p className="empty">Loading…</p>}
      {rows && rows.length === 0 && (
        <div className="empty">
          <h2>No vehicles yet</h2>
          <p>
            <Link href="/operator/new">Add your first vehicle</Link>, then its photos and fixed-price trips.
          </p>
        </div>
      )}
      {rows && rows.length > 0 && (
        <ul className="rows">
          {rows.map((v) => (
            <li key={v.id} className="plain-row">
              <div>
                <Link href={`/operator/vehicles/${v.id}`} className="row-name">
                  {v.name}
                </Link>
                <p className="meta">
                  {KIND_LABEL[v.kind] || v.kind} · {v.seats} seats · {v.city} · {money(v.price_per_day)}/day
                </p>
              </div>
              <span className={`status status-${v.status === "approved" ? "confirmed" : v.status === "pending" ? "held" : "cancelled"}`}>
                {STATUS[v.status] || v.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function OperatorPage() {
  return (
    <OperatorGuard>
      <Operator />
    </OperatorGuard>
  );
}
