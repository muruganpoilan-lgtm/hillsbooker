"use client";

import { useState } from "react";
import { KINDS } from "../../lib/vehicles";

// Used for both "add vehicle" and "edit vehicle". `initial` is the saved vehicle when editing.
export default function VehicleForm({ initial, submitLabel, onSubmit }) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    kind: initial?.kind || "car",
    seats: String(initial?.seats ?? ""),
    ac: initial ? initial.ac : true,
    city: initial?.city || "",
    description: initial?.description || "",
    price_per_day: initial ? String(Math.round(Number(initial.price_per_day))) : "",
    km_per_day: initial?.km_per_day ? String(initial.km_per_day) : "",
    extra_km_rate: initial?.extra_km_rate != null ? String(Number(initial.extra_km_rate)) : "",
    quantity: String(initial?.quantity ?? 1),
    advance_percent: String(initial?.advance_percent ?? 30),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError("");
    const seats = parseInt(form.seats, 10);
    const price = parseFloat(form.price_per_day);
    const quantity = parseInt(form.quantity, 10);
    if (!form.name.trim() || !form.city.trim()) return setError("Enter a name and the city the vehicle is based in.");
    if (!(seats >= 1) || !(price >= 0) || !(quantity >= 1)) return setError("Enter seats, price per day and how many vehicles you have.");
    setBusy(true);
    const err = await onSubmit({
      name: form.name.trim(),
      kind: form.kind,
      seats,
      ac: form.ac,
      city: form.city.trim(),
      description: form.description.trim() || null,
      price_per_day: price,
      km_per_day: form.km_per_day ? parseInt(form.km_per_day, 10) : null,
      extra_km_rate: form.extra_km_rate ? parseFloat(form.extra_km_rate) : null,
      quantity,
      advance_percent: Number(form.advance_percent),
    });
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <label className="field">
        <span>Vehicle name</span>
        <input type="text" value={form.name} onChange={set("name")} maxLength={100} placeholder="Toyota Innova Crysta" />
      </label>
      <label className="field">
        <span>Type</span>
        <select value={form.kind} onChange={set("kind")}>
          {KINDS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="four">
        <label className="field">
          <span>Seats</span>
          <input type="number" min="1" max="80" value={form.seats} onChange={set("seats")} />
        </label>
        <label className="field">
          <span>How many do you have</span>
          <input type="number" min="1" max="50" value={form.quantity} onChange={set("quantity")} />
        </label>
        <label className="field">
          <span>Price per day (₹)</span>
          <input type="number" min="0" value={form.price_per_day} onChange={set("price_per_day")} />
        </label>
        <label className="field">
          <span>Based in (city)</span>
          <input type="text" value={form.city} onChange={set("city")} maxLength={80} placeholder="Munnar" />
        </label>
      </div>
      <div className="four">
        <label className="field">
          <span>Km per day (blank = unlimited)</span>
          <input type="number" min="1" value={form.km_per_day} onChange={set("km_per_day")} />
        </label>
        <label className="field">
          <span>Extra km rate (₹)</span>
          <input type="number" min="0" value={form.extra_km_rate} onChange={set("extra_km_rate")} />
        </label>
        <label className="field">
          <span>Advance paid online</span>
          <select value={form.advance_percent} onChange={set("advance_percent")}>
            {[10, 20, 25, 30, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n === 100 ? "Full 100%" : `${n}%`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={form.ac} onChange={(e) => setForm({ ...form, ac: e.target.checked })} />
        <span>Air conditioned</span>
      </label>
      <label className="field">
        <span>About this vehicle</span>
        <textarea rows={4} value={form.description} onChange={set("description")} maxLength={2000} placeholder="Driver, luggage space, music system…" />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" aria-busy={busy}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
