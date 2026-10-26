"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { addDays, advanceFor, api, money, nightsBetween, plural, todayISO } from "../lib/api";

export default function VehicleBooking({ vehicle: v }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, logout } = useAuth();

  const [today, setToday] = useState("");
  const [tripId, setTripId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [count, setCount] = useState("1");
  const [passengers, setPassengers] = useState("2");
  const [pickup, setPickup] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Dates are set after load so the server and the browser agree on first paint.
  useEffect(() => {
    const t = todayISO();
    setToday(t);
    setStart(addDays(t, 1));
    setEnd(addDays(t, 1));
  }, []);

  const trip = v.trips.find((t) => t.id === tripId);
  const days = start && end && end >= start ? nightsBetween(start, end) + 1 : 1;
  const n = Number(count) || 1;
  const total = trip ? Number(trip.price) * n : Number(v.price_per_day) * days * n;
  const advance = advanceFor(total, v.advance_percent);

  async function reserve(e) {
    e.preventDefault();
    setError("");
    if (!token) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!start || (!trip && (!end || end < start))) {
      setError("Choose the dates. The last day can't be before the first day.");
      return;
    }
    setBusy(true);
    const res = await api("/vehicle-bookings", {
      method: "POST",
      token,
      body: {
        vehicle_id: v.id,
        trip_id: trip ? trip.id : null,
        start_date: start,
        end_date: trip ? start : end,
        count: n,
        passengers: Number(passengers) || 1,
        pickup: pickup.trim() || null,
        note: note.trim() || null,
      },
    });
    setBusy(false);
    if (res.status === 401) {
      logout();
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/bookings/vehicles?new=${res.data.booking_id}`);
  }

  return (
    <form className="room-card stack" onSubmit={reserve} noValidate>
      <fieldset className="choice">
        <legend className="field-label">How do you want to book?</legend>
        <label className="check">
          <input type="radio" name="mode" checked={!tripId} onChange={() => setTripId("")} />
          <span>
            Hire by the day <b>{money(v.price_per_day)}</b> a day
          </span>
        </label>
        {v.trips.map((t) => (
          <label className="check" key={t.id}>
            <input type="radio" name="mode" checked={tripId === t.id} onChange={() => setTripId(t.id)} />
            <span>
              {t.title} <b>{money(t.price)}</b> fixed
              {t.from_place || t.to_place ? <span className="meta"> · {[t.from_place, t.to_place].filter(Boolean).join(" to ")}</span> : null}
              {t.details ? <span className="meta"> · {t.details}</span> : null}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="dates-bar">
        <label className="field">
          <span>{trip ? "Trip date" : "First day"}</span>
          <input
            type="date"
            value={start}
            min={today || undefined}
            onChange={(e) => {
              setStart(e.target.value);
              if (!end || end < e.target.value) setEnd(e.target.value);
            }}
          />
        </label>
        {!trip && (
          <label className="field">
            <span>Last day</span>
            <input type="date" value={end} min={start || today || undefined} onChange={(e) => setEnd(e.target.value)} />
          </label>
        )}
        <label className="field">
          <span>Vehicles</span>
          <select value={count} onChange={(e) => setCount(e.target.value)}>
            {Array.from({ length: Math.min(v.quantity, 10) }, (_, i) => i + 1).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Passengers (seats {v.seats} each)</span>
          <input type="number" min="1" max="200" value={passengers} onChange={(e) => setPassengers(e.target.value)} />
        </label>
      </div>

      <label className="field">
        <span>Pickup place</span>
        <input type="text" value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="Hotel, bus stand, address" maxLength={200} />
      </label>
      <label className="field">
        <span>Note for the operator (optional)</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </label>

      <p>
        <span className="price">{money(total)}</span>{" "}
        <span className="meta">{trip ? plural(n, "vehicle") : `${plural(days, "day")} × ${plural(n, "vehicle")}`}</span>
      </p>
      {advance < total && (
        <p className="meta">
          Pay <b>{money(advance)}</b> now ({v.advance_percent}%), {money(total - advance)} to the operator on the trip
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" aria-busy={busy}>
        {busy ? "Holding the vehicle…" : token ? "Reserve for 10 minutes" : "Log in to book"}
      </button>
      <p className="meta">Cancel at least 2 days before the trip and your advance is refunded in full. After that there is no refund.</p>
    </form>
  );
}
