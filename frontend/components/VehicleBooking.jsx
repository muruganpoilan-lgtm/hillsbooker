"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { addDays, advanceFor, api, money, nightsBetween, todayISO } from "../lib/api";
import { useLang } from "./LangProvider";

export default function VehicleBooking({ vehicle: v }) {
  const { t } = useLang();
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
    const d = todayISO();
    setToday(d);
    setStart(addDays(d, 1));
    setEnd(addDays(d, 1));
  }, []);

  const trip = v.trips.find((x) => x.id === tripId);
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
      setError(t("vb.errDates"));
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
    router.push(`/pay?kind=vehicle&id=${res.data.booking_id}`);
  }

  return (
    <form className="room-card stack" onSubmit={reserve} noValidate>
      <fieldset className="choice">
        <legend className="field-label">{t("vb.how")}</legend>
        <label className="check">
          <input type="radio" name="mode" checked={!tripId} onChange={() => setTripId("")} />
          <span>
            {t("veh.hireDay", { amt: money(v.price_per_day) })}
          </span>
        </label>
        {v.trips.map((tr) => (
          <label className="check" key={tr.id}>
            <input type="radio" name="mode" checked={tripId === tr.id} onChange={() => setTripId(tr.id)} />
            <span>
              {t("vb.fixed", { title: tr.title, amt: money(tr.price) })}
              {tr.from_place || tr.to_place ? <span className="meta"> · {[tr.from_place, tr.to_place].filter(Boolean).join(t("vb.to"))}</span> : null}
              {tr.details ? <span className="meta"> · {tr.details}</span> : null}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="dates-bar">
        <label className="field">
          <span>{trip ? t("vb.tripDate") : t("vb.first")}</span>
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
            <span>{t("vb.last")}</span>
            <input type="date" value={end} min={start || today || undefined} onChange={(e) => setEnd(e.target.value)} />
          </label>
        )}
        <label className="field">
          <span>{t("vb.vehicles")}</span>
          <select value={count} onChange={(e) => setCount(e.target.value)}>
            {Array.from({ length: Math.min(v.quantity, 10) }, (_, i) => i + 1).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("vb.pax", { n: v.seats })}</span>
          <input type="number" min="1" max="200" value={passengers} onChange={(e) => setPassengers(e.target.value)} />
        </label>
      </div>

      <label className="field">
        <span>{t("vb.pickup")}</span>
        <input type="text" value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder={t("vb.pickupHolder")} maxLength={200} />
      </label>
      <label className="field">
        <span>{t("vb.note")}</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </label>

      <p>
        <span className="price">{money(total)}</span>{" "}
        <span className="meta">{trip ? t.n("unit.vehicle", n) : t("vb.times", { days: t.n("unit.day", days), veh: t.n("unit.vehicle", n) })}</span>
      </p>
      {advance < total && (
        <p className="meta">
          {t("vb.payNow", { adv: money(advance), pct: v.advance_percent, rest: money(total - advance) })}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" aria-busy={busy}>
        {busy ? t("vb.holding") : token ? t("vb.reserve") : t("vb.login")}
      </button>
      <p className="meta">{t("vb.cancelRule")}</p>
    </form>
  );
}
