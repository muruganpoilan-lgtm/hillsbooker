"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import Guard from "../../../components/dashboard/Guard";
import { api, money, prettyDate } from "../../../lib/api";

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Tile({ tone = "", label, value, sub }) {
  return (
    <div className={`ov-tile ${tone}`}>
      <p className="l">{label}</p>
      <p className="v">{value}</p>
      <p className="s">{sub}</p>
    </div>
  );
}

// One bar for each of the last 14 days. Today is yellow, days without a booking are grey.
function Bars({ days }) {
  const max = Math.max(1, ...days.map((d) => Number(d.bookings)));
  return (
    <>
      <div className="ov-bars" role="img" aria-label="Bookings made in the last 14 days">
        {days.map((d, i) => {
          const n = Number(d.bookings);
          return (
            <div key={d.day} className={`ov-bar${i === days.length - 1 ? " today" : ""}${n ? "" : " zero"}`} title={`${prettyDate(d.day)}: ${n} bookings, ${money(d.value)}`}>
              <span>{n || ""}</span>
              <i style={{ height: `${n ? Math.max(6, (n / max) * 78) : 2}%` }} />
            </div>
          );
        })}
      </div>
      <div className="ov-days">
        {days.map((d) => (
          <span key={d.day}>{WEEKDAY[new Date(`${d.day}T00:00:00`).getDay()]}</span>
        ))}
      </div>
    </>
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
    { n: Number(c.pending_properties), text: "properties to approve", href: "/dashboard" },
    { n: Number(c.pending_vehicles), text: "vehicles to approve", href: "/operator" },
    { n: Number(c.open_tickets), text: "support tickets not resolved", href: "/dashboard/support" },
    { n: Number(c.new_enquiries), text: "new tour enquiries", href: "/dashboard/enquiries" },
  ].filter((x) => x.n > 0);
  const due = Number(d.payouts_due);
  const topMax = Math.max(1, ...d.top_cities.map((x) => Number(x.bookings)));

  return (
    <>
      <h1 className="section-title">{greeting()}</h1>
      <p className="meta">
        Today: {b.today} {Number(b.today) === 1 ? "booking" : "bookings"} and {money(m.today)} paid online. All numbers are in India time, and money is what guests paid online after refunds.
      </p>

      <div className="ov-tiles">
        <Tile tone="green" label="Paid online, 30 days" value={money(m.month)} sub={`${money(m.month_commission)} commission`} />
        <Tile tone="indigo" label="Bookings, 30 days" value={b.month} sub={`${b.month_stays} stays · ${b.month_vehicles} vehicles`} />
        <Tile tone="gold" label="Check-ins tomorrow" value={c.checkins_tomorrow} sub={`${c.checkins_week} in the next 7 days`} />
        <Tile label="Users" value={c.users} sub={`${c.new_users} joined this week`} />
      </div>

      <div className="ov-row">
        <section className="ov-panel">
          <h2>Bookings, last 14 days</h2>
          <Bars days={d.daily} />
        </section>
        <section className="ov-panel">
          <h2>Needs your attention</h2>
          {todo.length === 0 && due <= 0 ? (
            <p className="ov-clear">All clear. Nothing is waiting for you.</p>
          ) : (
            <ul className="ov-todo">
              {todo.map((x) => (
                <li key={x.text}>
                  <Link href={x.href}>
                    <span className="n">{x.n}</span>
                    {x.text}
                  </Link>
                </li>
              ))}
              {due > 0 && (
                <li>
                  <Link href="/dashboard/payouts">
                    <span className="n">₹</span>
                    {money(due)} to pay hosts
                  </Link>
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      <div className="ov-row even">
        <section className="ov-panel">
          <h2>Top places, 30 days</h2>
          {d.top_cities.length === 0 ? (
            <p className="meta">No bookings yet.</p>
          ) : (
            d.top_cities.map((x) => (
              <div key={x.city} className="ov-place">
                <span>{x.city}</span>
                <div className="track"><i style={{ width: `${(Number(x.bookings) / topMax) * 100}%` }} /></div>
                <b>{x.bookings}</b>
              </div>
            ))
          )}
        </section>
        <section className="ov-panel">
          <h2>Latest bookings</h2>
          {d.recent.length === 0 ? (
            <p className="meta">No bookings yet.</p>
          ) : (
            <ul className="ov-recent">
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
