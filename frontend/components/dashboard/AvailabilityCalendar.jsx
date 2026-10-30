"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, plural, todayISO } from "../../lib/api";

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

// A month calendar for one room type. Hosts tick nights and block them (guests can't book them online) or open them again.
export default function AvailabilityCalendar({ roomId, token, onAuthError, onChanged }) {
  const today = todayISO();
  const [view, setView] = useState(() => {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() };
  });
  const [rows, setRows] = useState([]);
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", bad: false });

  const load = useCallback(async () => {
    const res = await api(`/owner/room-types/${roomId}/inventory?days=366`, { token });
    if (res.status === 401) return onAuthError();
    if (res.ok) setRows(res.data);
  }, [roomId, token, onAuthError]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const m = new Map();
    for (const r of rows) m.set(String(r.day).slice(0, 10), r);
    return m;
  }, [rows]);

  const first = new Date(view.y, view.m, 1);
  const lead = first.getDay();
  const count = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= count; d++) cells.push(iso(view.y, view.m, d));

  function shift(delta) {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }

  function toggle(day) {
    if (day < today) return;
    setMsg({ text: "", bad: false });
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  function pickWholeMonth() {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const day of cells) if (day && day >= today) next.add(day);
      return next;
    });
  }

  async function apply(blocked) {
    const days = [...picked].sort();
    if (!days.length) return setMsg({ text: "Tap the nights you want to change first.", bad: true });
    setBusy(true);
    const res = await api(`/owner/room-types/${roomId}/block`, { method: "PUT", token, body: { days, blocked } });
    setBusy(false);
    if (res.status === 401) return onAuthError();
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    setMsg({ text: blocked ? `Blocked ${plural(days.length, "night")}. Guests can't book them.` : `Opened ${plural(days.length, "night")} for booking.`, bad: false });
    setPicked(new Set());
    await load();
    if (onChanged) onChanged();
  }

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className="btn btn-small" onClick={() => shift(-1)} aria-label="Previous month">
          ←
        </button>
        <b>
          {MONTHS[view.m]} {view.y}
        </b>
        <button type="button" className="btn btn-small" onClick={() => shift(1)} aria-label="Next month">
          →
        </button>
      </div>
      <div className="cal-grid cal-week" aria-hidden="true">
        {WEEK.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((day, i) => {
          if (!day) return <span key={`e${i}`} />;
          const r = byDay.get(day);
          const past = day < today;
          const state = past ? "past" : r && r.blocked ? "blocked" : r && r.available > 0 ? "open" : r && Number(r.booked) > 0 ? "full" : "closed";
          const sel = picked.has(day);
          const label = state === "blocked" ? "Blocked" : state === "open" ? `${r.available} left` : state === "full" ? "Full" : state === "closed" ? "Not open" : "";
          return (
            <button
              key={day}
              type="button"
              className={`cal-day cal-${state}${sel ? " cal-sel" : ""}`}
              disabled={past}
              onClick={() => toggle(day)}
              aria-pressed={sel}
              aria-label={`${day}, ${label || "past"}`}
            >
              <b>{Number(day.slice(8))}</b>
              <small>{label}</small>
            </button>
          );
        })}
      </div>
      <p className="cal-legend meta">
        <i className="cal-key cal-open" /> Open <i className="cal-key cal-blocked" /> Blocked <i className="cal-key cal-full" /> Fully booked <i className="cal-key cal-closed" /> Not open yet
      </p>
      <div className="actions">
        <button type="button" className="btn btn-small btn-danger" disabled={busy || !picked.size} onClick={() => apply(true)}>
          Block {picked.size ? plural(picked.size, "night") : "selected nights"}
        </button>
        <button type="button" className="btn btn-small btn-primary" disabled={busy || !picked.size} onClick={() => apply(false)}>
          Open selected nights
        </button>
        <button type="button" className="btn btn-small" onClick={pickWholeMonth}>
          Select whole month
        </button>
        <button type="button" className="btn btn-small" disabled={!picked.size} onClick={() => setPicked(new Set())}>
          Clear
        </button>
      </div>
      <p className="meta">Blocked nights are hidden from guests and can't be booked online. Bookings you already have stay. Opening a night puts all rooms of this type on sale at the usual price.</p>
      {msg.text && (
        <p className={msg.bad ? "form-error" : "ok"} role={msg.bad ? "alert" : "status"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
