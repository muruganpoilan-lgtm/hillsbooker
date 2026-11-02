"use client";

import { useMemo, useState } from "react";
import { api, money, plural, prettyDate, todayISO } from "../../lib/api";

const DOW = [["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0]];
const pad = (n) => String(n).padStart(2, "0");
const day0 = (s) => new Date(`${s}T00:00:00Z`);
const addDay = (s, n) => new Date(day0(s).getTime() + n * 86400000).toISOString().slice(0, 10);

// The next time a yearly date range comes round (month and day are 1-based), so "Pongal" always points at a coming one.
function nextRange(today, m1, d1, m2, d2) {
  const y = Number(today.slice(0, 4));
  for (const yr of [y, y + 1]) {
    const start = `${yr}-${pad(m1)}-${pad(d1)}`;
    const end = `${m2 < m1 ? yr + 1 : yr}-${pad(m2)}-${pad(d2)}`;
    if (end >= today) return [start < today ? today : start, end];
  }
  return [today, today];
}

// One tool for the whole season: pick dates, pick which weekdays, give a price. Uses the same per-night prices as the calendar above.
export default function SeasonPricing({ roomId, basePrice, token, onAuthError, onChanged }) {
  const today = todayISO();
  const base = Number(basePrice);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dows, setDows] = useState(() => new Set([5, 6]));
  const [mode, setMode] = useState("rupees");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", bad: false });

  const days = useMemo(() => {
    if (!from || !to || to < from || dows.size === 0) return [];
    const out = [];
    for (let d = from < today ? today : from, i = 0; d <= to && i < 400; d = addDay(d, 1), i++) {
      if (dows.has(day0(d).getUTCDay())) out.push(d);
    }
    return out;
  }, [from, to, dows, today]);

  const price = useMemo(() => {
    const v = Number(value);
    if (value === "" || !(v >= 0)) return null;
    return mode === "percent" ? Math.round((base * (1 + v / 100)) / 10) * 10 : Math.round(v);
  }, [value, mode, base]);

  const quick = [
    ["Summer (1 Apr to 31 May)", [4, 1, 5, 31]],
    ["Pongal (13 to 17 Jan)", [1, 13, 1, 17]],
    ["Christmas and New Year", [12, 24, 1, 2]],
  ];

  function toggleDow(n) {
    setDows((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  async function run(reset) {
    setMsg({ text: "", bad: false });
    if (!from || !to) return setMsg({ text: "Choose the first and last night.", bad: true });
    if (to < from) return setMsg({ text: "The last night must be on or after the first night.", bad: true });
    if (day0(to).getTime() - day0(from).getTime() > 365 * 86400000) return setMsg({ text: "Choose at most one year at a time.", bad: true });
    if (dows.size === 0) return setMsg({ text: "Tick at least one day of the week.", bad: true });
    if (days.length === 0) return setMsg({ text: "No nights match. Past nights can't be changed.", bad: true });
    if (!reset && price === null) return setMsg({ text: mode === "percent" ? "Enter how many percent above the usual price." : "Enter the price for one night in rupees.", bad: true });
    if (!reset && price > 1000000) return setMsg({ text: "That price is too high.", bad: true });
    setBusy(true);
    const res = await api(`/owner/room-types/${roomId}/price`, { method: "PUT", token, body: { days, price: reset ? null : price } });
    setBusy(false);
    if (res.status === 401) return onAuthError();
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    setMsg({
      text: reset ? `Usual price put back for ${plural(days.length, "night")}.` : `${money(price)} set for ${plural(days.length, "night")}, from ${prettyDate(days[0])} to ${prettyDate(days[days.length - 1])}.`,
      bad: false,
    });
    if (onChanged) onChanged();
  }

  return (
    <div className="season">
      <p className="meta">
        Set one price for a whole stretch of dates, such as every Friday and Saturday this winter, or all of summer. It replaces any price already set on those nights. Bookings already made keep their price.
      </p>
      <div className="season-quick">
        {quick.map(([label, r]) => (
          <button
            key={label}
            type="button"
            className="btn btn-small"
            onClick={() => {
              const [a, b] = nextRange(today, ...r);
              setFrom(a);
              setTo(b);
              setDows(new Set([0, 1, 2, 3, 4, 5, 6]));
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="dates-bar">
        <label className="field">
          <span>First night</span>
          <input type="date" value={from} min={today} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>Last night</span>
          <input type="date" value={to} min={from || today} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <fieldset className="dow-chips">
        <legend>Which nights</legend>
        {DOW.map(([label, n]) => (
          <label key={n} className={`chip${dows.has(n) ? " on" : ""}`}>
            <input type="checkbox" checked={dows.has(n)} onChange={() => toggleDow(n)} />
            {label}
          </label>
        ))}
        <button type="button" className="link-btn" onClick={() => setDows(new Set([5, 6]))}>Fri and Sat only</button>
        <button type="button" className="link-btn" onClick={() => setDows(new Set([0, 1, 2, 3, 4, 5, 6]))}>Every night</button>
      </fieldset>
      <div className="cal-rate-row">
        <label className="field">
          <span>Price is</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="rupees">A fixed amount (₹ per room per night)</option>
            <option value="percent">Percent above the usual price</option>
          </select>
        </label>
        <label className="field">
          <span>{mode === "percent" ? "Percent above usual" : "Price (₹)"}</span>
          <input type="number" min="0" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder={mode === "percent" ? "25" : String(base)} />
        </label>
      </div>
      <p className="meta" aria-live="polite">
        {days.length > 0
          ? price !== null
            ? `${plural(days.length, "night")} will be ${money(price)} (usual price ${money(base)}).`
            : `${plural(days.length, "night")} selected.`
          : "Choose dates and days to see how many nights change."}
      </p>
      <div className="actions">
        <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => run(false)}>
          Apply price
        </button>
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => run(true)}>
          Put usual price back
        </button>
      </div>
      {msg.text && (
        <p className={msg.bad ? "form-error" : "ok"} role={msg.bad ? "alert" : "status"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
