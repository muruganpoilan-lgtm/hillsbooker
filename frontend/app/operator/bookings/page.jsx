"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import OperatorGuard from "../../../components/dashboard/OperatorGuard";
import { api, money, plural, prettyDate } from "../../../lib/api";

function Bookings() {
  const { token, logout } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  // Loads now, then again every 30 seconds and whenever the tab is opened, so cancellations and new bookings appear by themselves.
  useEffect(() => {
    const load = () =>
      api("/operator/vehicle-bookings", { token }).then((res) => {
        if (res.status === 401) return logout();
        if (!res.ok) return setError(res.error);
        setError("");
        setRows(res.data);
      });
    load();
    const id = setInterval(load, 30000);
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [token, logout]);

  return (
    <>
      <p className="meta">
        <Link href="/operator">← Your vehicles</Link>
      </p>
      <h1 className="section-title">Vehicle bookings</h1>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {rows === null && !error && <p className="empty">Loading…</p>}
      {rows && rows.length === 0 && <p className="empty">No confirmed bookings yet.</p>}
      {rows && rows.length > 0 && (
        <ul className="rows">
          {rows.map((b) => (
            <li key={b.id} className="plain-row">
              <div>
                <p className="row-name">
                  {b.guest}
                  {b.guest_phone ? ` · ${b.guest_phone}` : ""}
                </p>
                <p className="meta">
                  {b.vehicle}
                  {b.count > 1 ? ` × ${b.count}` : ""} · {b.trip || "By the day"} · {plural(b.passengers, "passenger")}
                </p>
                <p className="meta">
                  {b.start_date === b.end_date ? prettyDate(b.start_date) : `${prettyDate(b.start_date)} to ${prettyDate(b.end_date)}`}
                  {b.pickup ? ` · pickup ${b.pickup}` : ""}
                </p>
                {b.note && <p className="meta">Note: {b.note}</p>}
              </div>
              <div>
                <p className="price">{money(b.total_amount)}</p>
                {b.status === "confirmed" && Number(b.balance_due) > 0 && <p className="meta">Collect {money(b.balance_due)}</p>}
                <span className={`status status-${b.status}`}>{b.status === "confirmed" ? "Confirmed" : "Cancelled"}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function OperatorBookingsPage() {
  return (
    <OperatorGuard>
      <Bookings />
    </OperatorGuard>
  );
}
