"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import Guard from "../../../components/dashboard/Guard";
import { api, money, prettyDate } from "../../../lib/api";

function Tile({ label, value, sub }) {
  return (
    <div className="card" style={{ padding: "0.9rem" }}>
      <p className="meta">{label}</p>
      <p className="price" style={{ margin: "0.15rem 0" }}>{value}</p>
      {sub && <p className="meta">{sub}</p>}
    </div>
  );
}

// One bar for each of the last 14 days. The bar height follows the number of bookings that day.
function Bars({ days }) {
  const max = Math.max(1, ...days.map((d) => Number(d.bookings)));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "110px", margin: "0.6rem 0 0.2rem" }} role="img" aria-label="Bookings made in the last 14 days">
      {days.map((d) => {
        const n = Number(d.bookings);
        return (
          <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", textAlign: "center" }} title={`${prettyDate(d.day)}: ${n} bookings, ${money(d.value)}`}>
            <span className="meta" style={{ fontSize: "0.7rem" }}>{n || ""}</span>
            <div style={{ height: `${Math.max(n ? 6 : 2, (n / max) * 80)}%`, background: n ? "var(--green, #2f6f4e)" : "#d8d8d8", borderRadius: "3px 3px 0 0" }} />
          </div>
        );
      })}
    </div>
  );
}

function Overview() {
  const { token, role, logout } = useAuth();
  const [d, setD] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await api("/admin/overview", { token });
    if (res.status === 401) return logout();
    if (!res.ok) return setError(res.error);
    setError("");
    setD(res.data);
  }, [token, logout]);

  useEffect(() => {
    if (role === "admin") load();
  }, [load, role]);

  if (role !== "admin") return <p className="empty">Only the Hill Booker admin can open this page.</p>;
  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (!d) return <p className="meta">Loading…</p>;

  const { bookings: b, money: m, counts: c } = d;
  const todo = [
    { n: Number(c.pending_properties), text: "properties waiting for approval", href: "/dashboard" },
    { n: Number(c.pending_vehicles), text: "vehicles waiting for approval", href: "/operator" },
    { n: Number(c.open_tickets), text: "customer-care tickets not resolved", href: "/dashboard/support" },
    { n: Number(c.new_enquiries), text: "new tour enquiries", href: "/dashboard/enquiries" },
    { n: Number(d.payouts_due) > 0 ? 1 : 0, text: `to pay hosts: ${money(d.payouts_due)}`, href: "/dashboard/payouts" },
  ].filter((x) => x.n > 0);

  return (
    <>
      <p className="meta"><Link href="/dashboard">← Dashboard</Link></p>
      <h1 className="section-title">Overview</h1>
      <p className="meta">How Hill Booker is doing. Numbers are in India time. Money is what guests paid online, after refunds.</p>

      <section className="card" style={{ padding: "1rem", margin: "1rem 0" }}>
        <h2 className="mini-title">Needs your attention</h2>
        {todo.length === 0 ? (
          <p className="ok">All clear. Nothing is waiting for you.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.4rem", margin: 0 }}>
            {todo.map((x) => (
              <li key={x.text}>
                <Link href={x.href}>
                  {x.href === "/dashboard/payouts" ? "" : <b>{x.n} </b>}
                  {x.text} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))", gap: "0.7rem" }}>
        <Tile label="Bookings today" value={b.today} sub={`${b.week} in 7 days`} />
        <Tile label="Bookings, 30 days" value={b.month} sub={`${b.month_stays} stays · ${b.month_vehicles} vehicles`} />
        <Tile label="Paid online today" value={money(m.today)} sub={`${money(m.week)} in 7 days`} />
        <Tile label="Paid online, 30 days" value={money(m.month)} sub={Number(m.month_refunded) > 0 ? `${money(m.month_refunded)} refunded` : "no refunds"} />
        <Tile label="Your commission, 30 days" value={money(m.month_commission)} sub={`${money(m.total_commission)} in total`} />
        <Tile label="Check-ins tomorrow" value={c.checkins_tomorrow} sub={`${c.checkins_week} in the next 7 days`} />
        <Tile label="Live stays and vehicles" value={`${c.properties} · ${c.vehicles}`} sub={`${c.hosts} hosts`} />
        <Tile label="Users" value={c.users} sub={`${c.new_users} joined this week`} />
      </div>

      <section className="card" style={{ padding: "1rem", margin: "1rem 0" }}>
        <h2 className="mini-title">Bookings, last 14 days</h2>
        <Bars days={d.daily} />
        <p className="meta">{prettyDate(d.daily[0].day)} to {prettyDate(d.daily[d.daily.length - 1].day)}</p>
      </section>

      <div className="dates-bar" style={{ alignItems: "start" }}>
        <section className="card" style={{ padding: "1rem" }}>
          <h2 className="mini-title">Top places, 30 days</h2>
          {d.top_cities.length === 0 ? (
            <p className="meta">No bookings yet.</p>
          ) : (
            <ol style={{ margin: 0, paddingLeft: "1.2rem" }}>
              {d.top_cities.map((x) => (
                <li key={x.city}>{x.city} · {x.bookings} {Number(x.bookings) === 1 ? "booking" : "bookings"}</li>
              ))}
            </ol>
          )}
        </section>
        <section className="card" style={{ padding: "1rem" }}>
          <h2 className="mini-title">Latest bookings</h2>
          {d.recent.length === 0 ? (
            <p className="meta">No bookings yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.5rem" }}>
              {d.recent.map((r, i) => (
                <li key={i}>
                  <span className="row-name">{r.item}</span>
                  <p className="meta">{r.guest} · {r.kind === "vehicle" ? "vehicle" : "stay"} · {money(r.total_amount)} · starts {prettyDate(String(r.start_date).slice(0, 10))}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="actions" style={{ margin: "1rem 0" }}>
        <Link className="btn btn-small" href="/dashboard/bookings">All bookings</Link>
        <Link className="btn btn-small" href="/dashboard/payments">Payments</Link>
        <Link className="btn btn-small" href="/dashboard/payouts">Payouts</Link>
        <Link className="btn btn-small" href="/dashboard/reports">Reports</Link>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Guard>
      <Overview />
    </Guard>
  );
}
