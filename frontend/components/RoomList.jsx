"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import Ridge from "./Ridge";
import { addDays, advanceFor, api, money, plural, prettyDate, todayISO } from "../lib/api";

export default function RoomList({ rooms, checkIn: ci, checkOut: co, guests: g, children: kids = 0, nights, advancePercent = 100, tooSoon = false, earliest = "" }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, logout } = useAuth();

  const [checkIn, setCheckIn] = useState(ci);
  const [checkOut, setCheckOut] = useState(co);
  const [children, setChildren] = useState(String(kids));
  const [adults, setAdults] = useState(String(Math.max(1, g - kids)));
  const [qty, setQty] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [today, setToday] = useState("");

  // Set after load so the server and the browser agree on first paint, whatever their time zones.
  useEffect(() => setToday(todayISO()), []);

  const hasDates = Boolean(ci && co);
  const here = `${pathname}?${new URLSearchParams({ check_in: ci, check_out: co, guests: String(g), children: String(kids) }).toString()}`;

  function updateDates(e) {
    e.preventDefault();
    if (!checkIn || !checkOut || checkOut <= checkIn) {
      setError("Choose a check-out date after check-in.");
      return;
    }
    if (earliest && checkIn < earliest) {
      setError(`${prettyDate(checkIn)} can't be booked online. Stays here need advance notice, so the earliest check-in is ${prettyDate(earliest)}. Please choose that date or later.`);
      return;
    }
    setError("");
    router.replace(`${pathname}?${new URLSearchParams({ check_in: checkIn, check_out: checkOut, guests: String(Number(adults) + Number(children)), children }).toString()}`);
  }

  function goToLogin() {
    router.push(`/login?next=${encodeURIComponent(here)}`);
  }

  async function book(room) {
    setError("");
    if (!token) {
      goToLogin();
      return;
    }
    setBusy(room.id);
    const res = await api("/bookings", {
      method: "POST",
      token,
      body: { room_type_id: room.id, check_in: ci, check_out: co, rooms: Number(qty[room.id] || 1), guests: Number(g), children: Number(kids) },
    });
    setBusy("");
    if (res.status === 401) {
      logout();
      goToLogin();
      return;
    }
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/pay?kind=stay&id=${res.data.booking_id}`);
  }

  return (
    <div>
      <form className="dates-bar" onSubmit={updateDates} noValidate>
        <label className="field">
          <span>Check-in</span>
          <input type="date" value={checkIn} min={earliest || today || undefined} onChange={(e) => setCheckIn(e.target.value)} />
        </label>
        <label className="field">
          <span>Check-out</span>
          <input type="date" value={checkOut} min={checkIn || today || undefined} onChange={(e) => setCheckOut(e.target.value)} />
        </label>
        <label className="field">
          <span>Adults</span>
          <select value={adults} onChange={(e) => setAdults(e.target.value)}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Children</span>
          <select value={children} onChange={(e) => setChildren(e.target.value)}>
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-small">
          {hasDates ? "Update dates" : "Check availability"}
        </button>
      </form>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {tooSoon && hasDates && (
        <p className="form-error" role="alert">
          {prettyDate(ci)} can't be booked online. Stays here need advance notice, so the earliest check-in is {prettyDate(earliest)}.{" "}
          <button type="button" className="link-btn" onClick={() => router.replace(`${pathname}?${new URLSearchParams({ check_in: earliest, check_out: co > earliest ? co : addDays(earliest, 1), guests: String(g), children: String(kids) }).toString()}`)}>
            Use {prettyDate(earliest)}
          </button>
        </p>
      )}

      {rooms.length === 0 && <p className="empty">The owner hasn't added rooms yet.</p>}

      {rooms.map((room) => {
        const bookable = hasDates && room.bookable;
        const left = room.rooms_left || 0;
        return (
          <article className="room" key={room.id}>
            {room.photos && room.photos[0] ? (
              <img className="thumb" src={room.photos[0]} alt="" loading="lazy" />
            ) : (
              <div className="thumb"><Ridge seed={room.id} /></div>
            )}
            <div>
              <h3 className="room-name">{room.name}</h3>
              <p className="meta">Sleeps {room.max_guests}</p>
              <p>
                <span className="price">{money(room.base_price)}</span> <span className="meta">a night</span>
              </p>
              {bookable && (
                <p className="meta">
                  {money(room.stay_total)} for {plural(nights, "night")}
                  {Number(qty[room.id] || 1) > 1 ? ` per room` : ""}
                </p>
              )}
              {bookable && advancePercent < 100 && (() => {
                const total = Number(room.stay_total) * Number(qty[room.id] || 1);
                const adv = advanceFor(total, advancePercent);
                return (
                  <p className="meta">
                    Pay <b>{money(adv)}</b> now ({advancePercent}%), {money(total - adv)} at the property
                  </p>
                );
              })()}
              {bookable && left <= 2 && <p className="scarce">Only {left} left for these dates</p>}
              {hasDates && !bookable && (
                <p className="unavailable">
                  {tooSoon ? `Too soon to book online. Earliest check-in is ${prettyDate(earliest)}` : "Not free on all of these dates"}
                </p>
              )}
              {!hasDates && <p className="unavailable">Choose dates to see if it's free</p>}
            </div>
            {bookable && (
              <div className="room-actions">
                {left > 1 && (
                  <label className="field">
                    <span>Rooms</span>
                    <select value={qty[room.id] || "1"} onChange={(e) => setQty({ ...qty, [room.id]: e.target.value })}>
                      {Array.from({ length: Math.min(left, 5) }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button type="button" className="btn btn-primary" onClick={() => book(room)} aria-busy={busy === room.id}>
                  {busy === room.id ? "Holding your room…" : token ? "Reserve" : "Log in to reserve"}
                </button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
