"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, prettyDate } from "../lib/api";

// Dates are handled as plain "YYYY-MM-DD" text and UTC math, so the guest's time zone can't shift a day.
const iso = (d) => d.toISOString().slice(0, 10);
const parse = (s) => new Date(`${s}T00:00:00Z`);
const addDaysISO = (s, n) => iso(new Date(parse(s).getTime() + n * 86400000));
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const short = (p) => (p >= 1000 ? `${(p / 1000).toFixed(1).replace(".0", "")}k` : String(Math.round(p)));

export default function AvailabilityCalendar({ propertyId, checkIn = "", checkOut = "", guests = 2, children = 0 }) {
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [start, setStart] = useState("");
  const [note, setNote] = useState("");
  const [monthOffset, setMonthOffset] = useState(0);

  useEffect(() => {
    let live = true;
    api(`/properties/${propertyId}/availability`).then((res) => {
      if (!live) return;
      if (res.ok) setData(res.data);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [propertyId]);

  const base = useMemo(() => {
    if (!data) return null;
    const t = parse(data.today);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() };
  }, [data]);

  if (failed) return null;
  if (!data || !base) return <p className="meta">Loading the calendar…</p>;

  const open = data.open;
  const maxOffset = Math.max(0, Math.floor((parse(data.last).getTime() - parse(data.today).getTime()) / (86400000 * 30)) - 1);

  function nightsOpen(from, to) {
    for (let d = from; d < to; d = addDaysISO(d, 1)) if (open[d] == null) return false;
    return true;
  }

  function pick(day) {
    setNote("");
    const canStart = open[day] != null;
    if (!start || day <= start) {
      if (!canStart) return;
      setStart(day);
      return;
    }
    if (!nightsOpen(start, day)) {
      setNote("Some nights between those dates are full. Pick a nearer check-out, or start again from another date.");
      return;
    }
    setStart("");
    const params = new URLSearchParams({ check_in: start, check_out: day, guests: String(guests), children: String(children) });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function month(offset) {
    const y = base.y + Math.floor((base.m + offset) / 12);
    const m = (base.m + offset) % 12;
    const first = new Date(Date.UTC(y, m, 1));
    const count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const cells = [];
    for (let i = 0; i < first.getUTCDay(); i++) cells.push(null);
    for (let d = 1; d <= count; d++) cells.push(iso(new Date(Date.UTC(y, m, d))));
    return (
      <div className="cal-month" key={`${y}-${m}`}>
        <h3 className="cal-title">{MONTHS[m]} {y}</h3>
        <div className="cal-grid" role="grid">
          {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
            <span key={i} className="cal-dow" aria-hidden="true">{w}</span>
          ))}
          {cells.map((day, i) => {
            if (!day) return <span key={`b${i}`} />;
            const isOpen = open[day] != null;
            const pickingOut = start && day > start;
            const clickable = pickingOut || isOpen;
            const inChosen = checkIn && checkOut && day >= checkIn && day < checkOut;
            const isStart = day === start || (!start && day === checkIn);
            const inPending = start && day > start && nightsOpen(start, day);
            const cls = ["cal-day", isOpen ? "open" : "closed", inChosen && !start ? "chosen" : "", isStart ? "start" : "", inPending ? "pending" : ""].join(" ");
            return (
              <button
                key={day}
                type="button"
                className={cls}
                disabled={!clickable}
                onClick={() => pick(day)}
                aria-label={`${prettyDate(day)}, ${isOpen ? `free, from ${Math.round(open[day])} rupees a night` : "not available"}`}
              >
                <span className="cal-num">{Number(day.slice(8))}</span>
                {isOpen && <span className="cal-price">₹{short(open[day])}</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="cal">
      <div className="cal-head">
        <p className="meta">
          {start ? <>Check-in <b>{prettyDate(start)}</b>. Now tap your check-out date.</> : "Tap your check-in date, then your check-out date. Prices are the lowest room rate per night."}
        </p>
        <div className="cal-nav">
          {start && (
            <button type="button" className="link-btn" onClick={() => { setStart(""); setNote(""); }}>
              Start again
            </button>
          )}
          <button type="button" className="btn btn-small" onClick={() => setMonthOffset(Math.max(0, monthOffset - 1))} disabled={monthOffset === 0} aria-label="Earlier months">‹</button>
          <button type="button" className="btn btn-small" onClick={() => setMonthOffset(Math.min(maxOffset, monthOffset + 1))} disabled={monthOffset >= maxOffset} aria-label="Later months">›</button>
        </div>
      </div>
      {note && <p className="form-error" role="alert">{note}</p>}
      <div className="cal-months">
        {month(monthOffset)}
        {month(monthOffset + 1)}
      </div>
      <p className="cal-legend meta">
        <span className="cal-key open" /> Free &nbsp; <span className="cal-key closed" /> Not available &nbsp; <span className="cal-key chosen" /> Your dates
      </p>
    </div>
  );
}
