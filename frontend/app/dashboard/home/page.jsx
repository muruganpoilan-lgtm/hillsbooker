"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import Guard from "../../../components/dashboard/Guard";
import { api, money, prettyDate } from "../../../lib/api";

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];
const STATUS = { pending: ["Waiting for approval", "held"], approved: ["Live", "confirmed"], rejected: ["Not approved", "cancelled"] };

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

function Bars({ days }) {
  const max = Math.max(1, ...days.map((d) => Number(d.bookings)));
  return (
    <>
      <div className="ov-bars" role="img" aria-label="Bookings made in the last 14 days">
        {days.map((d, i) => {
          const n = Number(d.bookings);
          return (
            <div key={d.day} className={`ov-bar${i === days.length - 1 ? " today" : ""}${n ? "" : " zero"}`} title={`${prettyDate(d.day)}: ${n} bookings`}>
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

function Home() {
  const { token, role, logout } = useAuth();
  const [d, setD] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await api("/owner/overview", { token });
    if (res.status === 401) return logout();
    if (!res.ok) return setError(res.error);
    setError("");
    setD(res.data);
  }, [token, logout]);

  useEffect(() => {
    if (role === "owner" || role === "operator" || role === "admin") load();
  }, [load, role]);

  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (!d) return <p className="meta">Loading…</p>;

  const c = d.counts;
  const live = d.properties.filter((p) => p.status === "approved").length + d.vehicles.filter((v) => v.status === "approved").length;
  const waiting = d.properties.filter((p) => p.status === "pending").length + d.vehicles.filter((v) => v.status === "pending").length;
  const due = Number(d.due);
  const todo = [
    { n: Number(c.arrivals_tomorrow), text: "guests arriving tomorrow", href: "/dashboard/bookings" },
    { n: waiting, text: "listings waiting for Hill Booker approval", href: "/dashboard" },
  ].filter((x) => x.n > 0);
  const first = (d.name || "").split(" ")[0];

  return (
    <>
      <h1 className="section-title">{greeting()}{first ? `, ${first}` : ""}</h1>
      <p className="meta">Here is how your listings are doing. Money is your share of what guests paid online, after Hill Booker's commission and refunds.</p>

      <div className="ov-tiles">
        <Tile tone="green" label="Your share, 30 days" value={money(d.share_30d)} sub={`${money(d.paid_out_30d)} paid to your UPI`} />
        <Tile tone="indigo" label="Bookings, 30 days" value={c.month} sub={`${c.week} in the last 7 days`} />
        <Tile tone="gold" label="Guests arriving tomorrow" value={c.arrivals_tomorrow} sub={`${c.arrivals_week} in the next 7 days`} />
        <Tile label="Live listings" value={live} sub={waiting > 0 ? `${waiting} waiting for approval` : "all approved"} />
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
                    <span className="n" style={{ background: "var(--marigold)", color: "var(--ink)" }}>{x.n}</span>
                    {x.text}
                  </Link>
                </li>
              ))}
              {due > 0 && (
                <li>
                  <Link href="/dashboard/payments">
                    <span className="n" style={{ background: "var(--marigold)", color: "var(--ink)" }}>₹</span>
                    {money(due)} will be paid to your UPI soon
                  </Link>
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      <div className="ov-row even">
        <section className="ov-panel">
          <h2>My listings</h2>
          {d.properties.length + d.vehicles.length === 0 ? (
            <p className="meta">You have not added a property or vehicle yet.</p>
          ) : (
            <ul className="ov-recent">
              {d.properties.map((p) => (
                <li key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
                  <div>
                    <Link href={`/dashboard/properties/${p.id}`} className="row-name">{p.name}</Link>
                    <p className="meta">{p.city} · {p.type}</p>
                  </div>
                  <span className={`status status-${(STATUS[p.status] || [p.status, "expired"])[1]}`}>{(STATUS[p.status] || [p.status])[0]}</span>
                </li>
              ))}
              {d.vehicles.map((v) => (
                <li key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
                  <div>
                    <Link href={`/operator/vehicles/${v.id}`} className="row-name">{v.name}</Link>
                    <p className="meta">{v.city} · {v.kind}</p>
                  </div>
                  <span className={`status status-${(STATUS[v.status] || [v.status, "expired"])[1]}`}>{(STATUS[v.status] || [v.status])[0]}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="actions" style={{ marginTop: "0.8rem" }}>
            <Link className="btn btn-small btn-primary" href="/dashboard/new">Add a property</Link>
            <Link className="btn btn-small" href="/operator/new">Add a vehicle</Link>
          </div>
        </section>
        <section className="ov-panel">
          <h2>Coming guests</h2>
          {d.coming.length === 0 ? (
            <p className="meta">No confirmed guests coming yet.</p>
          ) : (
            <ul className="ov-recent">
              {d.coming.map((g, i) => (
                <li key={i}>
                  <span className="row-name">{g.guest}, {g.people} {Number(g.people) === 1 ? "guest" : "guests"}</span>
                  <p className="meta">
                    {g.item} · {prettyDate(String(g.start_date).slice(0, 10))}
                    {String(g.end_date).slice(0, 10) !== String(g.start_date).slice(0, 10) ? ` to ${prettyDate(String(g.end_date).slice(0, 10))}` : ""}
                  </p>
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
      <Home />
    </Guard>
  );
}
