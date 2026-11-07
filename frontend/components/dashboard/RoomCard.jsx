"use client";

import { useCallback, useEffect, useState } from "react";
import { api, addDays, money, plural, prettyDate, todayISO } from "../../lib/api";
import AvailabilityCalendar from "./AvailabilityCalendar";
import SeasonPricing from "./SeasonPricing";
import ChannelSync from "./ChannelSync";
import PhotoManager from "./PhotoManager";
import { BED_TYPES, BedIcon } from "../BedInfo";

const BED_LABELS = { single: "Single cot", double: "Double cot", queen: "Queen size cot", king: "King size cot", twin: "Twin (2 single cots)", bunk: "Bunk bed" };

// One room type: details, photos, and the calendar of open nights.
export default function RoomCard({ room, token, reload, onAuthError }) {
  const [form, setForm] = useState({
    name: room.name,
    max_guests: String(room.max_guests),
    base_price: String(Number(room.base_price)),
    total_rooms: String(room.total_rooms),
    bed_type: room.bed_type || "",
    bed_count: String(room.bed_count || 1),
  });
  const [msg, setMsg] = useState({ text: "", bad: false });
  const [busy, setBusy] = useState("");

  const [calKey, setCalKey] = useState(0);
  const [inv, setInv] = useState({ start: "", end: "", rooms_open: String(room.total_rooms), price: "" });
  const [nights, setNights] = useState(null);

  useEffect(() => {
    const t = todayISO();
    setInv((v) => (v.start ? v : { ...v, start: t, end: addDays(t, 29) }));
  }, []);

  const loadNights = useCallback(async () => {
    const res = await api(`/owner/room-types/${room.id}/inventory?days=60`, { token });
    if (res.status === 401) return onAuthError();
    if (res.ok) setNights(res.data);
  }, [room.id, token, onAuthError]);

  useEffect(() => {
    loadNights();
  }, [loadNights]);

  const say = (text, bad = false) => setMsg({ text, bad });

  async function saveDetails(e) {
    e.preventDefault();
    const body = {
      name: form.name.trim(),
      max_guests: Number(form.max_guests),
      base_price: Number(form.base_price),
      total_rooms: Number(form.total_rooms),
      bed_count: Number(form.bed_count) || 1,
    };
    if (form.bed_type) body.bed_type = form.bed_type;
    if (!body.name || !(body.base_price >= 0) || !(body.max_guests >= 1) || !(body.total_rooms >= 1)) {
      return say("Fill in the name, price, guests and number of rooms.", true);
    }
    setBusy("details");
    const res = await api(`/owner/room-types/${room.id}`, { method: "PATCH", token, body });
    setBusy("");
    if (res.status === 401) return onAuthError();
    if (!res.ok) return say(res.error, true);
    say("Saved.");
    reload();
  }

  async function remove() {
    if (!window.confirm(`Delete ${room.name}? Its photos and dates will be removed.`)) return;
    setBusy("delete");
    const res = await api(`/owner/room-types/${room.id}`, { method: "DELETE", token });
    setBusy("");
    if (res.status === 401) return onAuthError();
    if (!res.ok) return say(res.error, true);
    reload();
  }

  async function openDates(e) {
    e.preventDefault();
    if (!inv.start || !inv.end || inv.end < inv.start) return say("Choose an end date on or after the start date.", true);
    if (inv.start < todayISO()) return say("Start date can't be in the past.", true);
    const body = { start: inv.start, end: inv.end, rooms_open: Number(inv.rooms_open) };
    if (inv.price !== "") body.price = Number(inv.price);
    setBusy("dates");
    const res = await api(`/owner/room-types/${room.id}/inventory`, { method: "PUT", token, body });
    setBusy("");
    if (res.status === 401) return onAuthError();
    if (!res.ok) return say(res.error, true);
    say(`Updated ${plural(res.data.nights_updated, "night")}.`);
    loadNights();
  }

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setI = (k) => (e) => setInv({ ...inv, [k]: e.target.value });

  return (
    <section className="room-card">
      <h3>
        {room.bed_type && <BedIcon type={room.bed_type} />} {room.name}
      </h3>

      <form className="stack" onSubmit={saveDetails} noValidate>
        <div className="four">
          <label className="field">
            <span>Room name</span>
            <input type="text" value={form.name} onChange={setF("name")} />
          </label>
          <label className="field">
            <span>Sleeps</span>
            <input type="number" min="1" max="20" value={form.max_guests} onChange={setF("max_guests")} />
          </label>
          <label className="field">
            <span>Usual price a night (₹)</span>
            <input type="number" min="0" value={form.base_price} onChange={setF("base_price")} />
          </label>
          <label className="field">
            <span>Rooms of this type</span>
            <input type="number" min="1" max="500" value={form.total_rooms} onChange={setF("total_rooms")} />
          </label>
          <label className="field">
            <span>Bed type</span>
            <select value={form.bed_type} onChange={setF("bed_type")}>
              <option value="">Not set</option>
              {BED_TYPES.map((b) => (
                <option key={b.id} value={b.id}>
                  {BED_LABELS[b.id]} ({b.size})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Number of beds</span>
            <input type="number" min="1" max="10" value={form.bed_count} onChange={setF("bed_count")} />
          </label>
        </div>
        <div className="actions">
          <button type="submit" className="btn btn-small" aria-busy={busy === "details"}>
            Save room
          </button>
          <button type="button" className="btn btn-small btn-danger" onClick={remove} aria-busy={busy === "delete"}>
            Delete room
          </button>
        </div>
      </form>

      <h4>Photos</h4>
      <PhotoManager base={`/owner/room-types/${room.id}`} photos={room.photos} token={token} onChange={reload} onAuthError={onAuthError} />

      <h4>Open dates</h4>
      <p className="meta">Choose the nights guests can book, how many rooms are open each night, and an optional price for those nights.</p>
      <form className="stack" onSubmit={openDates} noValidate>
        <div className="four">
          <label className="field">
            <span>From</span>
            <input type="date" value={inv.start} min={todayISO()} onChange={setI("start")} />
          </label>
          <label className="field">
            <span>Last night</span>
            <input type="date" value={inv.end} min={inv.start || undefined} onChange={setI("end")} />
          </label>
          <label className="field">
            <span>Rooms open</span>
            <input type="number" min="0" max={room.total_rooms} value={inv.rooms_open} onChange={setI("rooms_open")} />
          </label>
          <label className="field">
            <span>Price (₹, optional)</span>
            <input type="number" min="0" value={inv.price} onChange={setI("price")} placeholder={String(Number(room.base_price))} />
          </label>
        </div>
        <div className="actions">
          <button type="submit" className="btn btn-small btn-primary" aria-busy={busy === "dates"}>
            Open these nights
          </button>
        </div>
      </form>

      <h4>Calendar: open, block and prices</h4>
      <p className="meta">Tap the nights you want to change. Then block them, open them, or set a different price for them, for example higher rates on weekends and holidays.</p>
      <AvailabilityCalendar key={calKey} roomId={room.id} basePrice={room.base_price} token={token} onAuthError={onAuthError} onChanged={loadNights} />
      <h4>Weekend and season prices</h4>
      <SeasonPricing key={room.id} roomId={room.id} basePrice={room.base_price} token={token} onAuthError={onAuthError} onChanged={() => { loadNights(); setCalKey((k) => k + 1); }} />

      {nights && nights.length > 0 && (
        <details className="nights">
          <summary>{plural(nights.length, "open night")} in the next 60 days</summary>
          <table>
            <thead>
              <tr>
                <th>Night</th>
                <th>Rooms left</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {nights.map((n) => (
                <tr key={n.day}>
                  <td>{prettyDate(n.day)}</td>
                  <td>{n.available}</td>
                  <td>{money(n.price ?? room.base_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {nights && nights.length === 0 && <p className="unavailable">No nights are open yet, so guests can't book this room.</p>}

      <ChannelSync roomId={room.id} token={token} onAuthError={onAuthError} />

      {msg.text && (
        <p className={msg.bad ? "form-error" : "ok"} role={msg.bad ? "alert" : "status"}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
