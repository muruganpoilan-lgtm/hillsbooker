"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import Guard from "../../../components/dashboard/Guard";
import HotelHead, { IdFields, IdPhotoPicker, listDays, num, sendPickedPhotos, useHotel } from "../../../components/dashboard/HotelHead";
import { addDays, api, money, nightsBetween, plural, prettyDate } from "../../../lib/api";

const STATUS = { free: "Free", occupied: "Occupied", cleaning: "Cleaning", repair: "Under repair" };
const SHORT = { free: "Free", occupied: "Occupied", cleaning: "Cleaning", repair: "Repair" };
const BEDS = { single: "single", double: "double", queen: "queen", king: "king", twin: "twin", bunk: "bunk" };
const blankRoom = { label: "", room_type_id: "", note: "" };
const day = (v) => String(v).slice(0, 10);
const VIEW_KEY = "hb_hotel_view";

// A free room with a guest in it counts as occupied, so the board is right even if nobody changed the status.
const shown = (r) => (r.status === "free" && r.guest_name ? "occupied" : r.status);

function details(r) {
  if (!r.room_type) return "No room type";
  const parts = [r.room_type, `${money(r.base_price)} a night`, `sleeps ${r.max_guests}`];
  if (r.bed_type) parts.push(`${r.bed_count} ${BEDS[r.bed_type] || r.bed_type} ${r.bed_count === 1 ? "bed" : "beds"}`);
  return parts.join(" · ");
}

function StatusButtons({ room, onSet, disabled }) {
  const now = shown(room);
  return (
    <div className="mh-setstatus" role="group" aria-label={`Status of ${room.label}`}>
      {Object.keys(STATUS).map((k) => (
        <button key={k} type="button" className={`mh-sbtn mh-${k}${now === k ? " on" : ""}`} aria-pressed={now === k} disabled={disabled} onClick={() => now !== k && onSet(room, k)}>
          {SHORT[k]}
        </button>
      ))}
    </div>
  );
}

function Rooms() {
  const { token, logout } = useAuth();
  const h = useHotel();
  const { pid } = h;
  const [data, setData] = useState(null);
  const [form, setForm] = useState(blankRoom);
  const [msg, setMsg] = useState({ text: "", bad: false });
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState("cards");
  const [cin, setCin] = useState(null); // the check-in form: {room, who, name, phone, ...}
  const seq = useRef(0); // only the newest answer from the server is shown

  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "table") setView("table");
    } catch {}
  }, []);
  function pickView(v) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  }

  const load = useCallback(async () => {
    if (!pid) return;
    const mine = ++seq.current;
    const res = await api(`/hotel/${pid}/rooms`, { token });
    if (mine !== seq.current) return;
    if (res.status === 401) return logout();
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    setData(res.data);
  }, [pid, token, logout]);

  useEffect(() => {
    setData(null);
    setCin(null);
    setMsg({ text: "", bad: false });
    load();
  }, [load]);

  async function call(path, opts, done) {
    setBusy(true);
    const res = await api(path, { ...opts, token });
    setBusy(false);
    if (res.status === 401) return logout();
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    const m = done ? done(res.data) : "";
    setMsg(typeof m === "string" ? { text: m, bad: false } : m);
    load();
    return res;
  }

  async function add(e) {
    e.preventDefault();
    if (!form.label.trim()) return setMsg({ text: "Give the room a name or number.", bad: true });
    const res = await call(
      `/hotel/${pid}/rooms`,
      { method: "POST", body: { label: form.label, room_type_id: form.room_type_id || null, note: form.note || null } },
      () => `Room ${form.label.trim()} added.`
    );
    if (res) setForm(blankRoom);
  }

  const auto = () => call(`/hotel/${pid}/rooms/auto`, { method: "POST" }, (d) => (d.created ? `${d.created} rooms added from your listing.` : "Every room in your listing is already here."));
  const setStatus = (r, status) => call(`/hotel/rooms/${r.id}`, { method: "PATCH", body: { status } });

  function editNote(r) {
    const note = window.prompt(`Note for ${r.label} (leave empty to clear)`, r.note || "");
    if (note === null) return;
    call(`/hotel/rooms/${r.id}`, { method: "PATCH", body: { note } });
  }

  function remove(r) {
    if (!window.confirm(`Remove room ${r.label} from this board? Guests who stayed in it stay in your register.`)) return;
    call(`/hotel/rooms/${r.id}`, { method: "DELETE" }, () => `Room ${r.label} removed.`);
  }

  function checkOut(r) {
    const due = Number(r.guest_balance) > 0 ? ` They still have ${money(r.guest_balance)} to pay.` : "";
    if (!window.confirm(`Check out ${r.guest_name} from ${r.label}?${due} The room will be marked for cleaning.`)) return;
    const path = r.guest_kind === "walkin" ? `/hotel/guests/${r.guest_id}/checkout` : `/hotel/bookings/${r.guest_id}/checkout`;
    call(path, { method: "POST" }, () => `${r.guest_name} checked out. ${r.label} is marked for cleaning.`);
  }

  const today = data ? day(data.today) : "";
  const arrivals = data ? data.arrivals : [];

  function startCheckIn(r) {
    const out = addDays(today, 1);
    setMsg({ text: "", bad: false });
    setCin({
      room: r, who: "new", name: "", phone: "", people: "1", check_out: out,
      total_amount: r.base_price ? String(Number(r.base_price)) : "", touched: false, paid_amount: "", note: "", address: "", id_type: "", id_number: "", vehicle_model: "", vehicle_number: "", photos: { front: null, back: null },
    });
    setTimeout(() => document.getElementById("checkin-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  // Changing the check-out date refreshes the suggested total (room price x nights) until the host types their own.
  function setOut(v) {
    const next = { ...cin, check_out: v };
    if (!cin.touched && cin.room.base_price && v > today) next.total_amount = String(Number(cin.room.base_price) * nightsBetween(today, v));
    setCin(next);
  }

  async function checkIn(e) {
    e.preventDefault();
    const r = cin.room;
    if (cin.who !== "new") {
      const a = arrivals.find((x) => x.id === cin.who);
      const res = await call(`/hotel/bookings/${cin.who}/room`, { method: "POST", body: { room_id: r.id } }, () => `${a ? a.name : "Guest"} checked in to ${r.label}.`);
      if (res) setCin(null);
      return;
    }
    const total = num(cin.total_amount) ?? 0;
    const paid = num(cin.paid_amount) ?? 0;
    if (!cin.name.trim()) return setMsg({ text: "Give the guest's name.", bad: true });
    if (!cin.check_out || cin.check_out <= today) return setMsg({ text: "The check-out date must be after today.", bad: true });
    if (paid > total) return setMsg({ text: "The amount paid is more than the total.", bad: true });
    if (cin.id_type === "aadhaar" && cin.id_number && cin.id_number.length !== 4) return setMsg({ text: "For Aadhaar, enter only the last 4 digits.", bad: true });
    const body = {
      name: cin.name, phone: cin.phone || null, check_in: today, check_out: cin.check_out, room_id: r.id,
      people: Math.max(1, Math.round(num(cin.people) ?? 1)), total_amount: total, paid_amount: paid, note: cin.note || null,
      address: cin.address || null, id_type: cin.id_type || null, id_number: cin.id_number || null,
      vehicle_model: cin.vehicle_model || null, vehicle_number: cin.vehicle_number || null,
    };
    const res = await call(`/hotel/${pid}/guests`, { method: "POST", body }, (d) =>
      d.full_nights && d.full_nights.length
        ? { text: `${cin.name.trim()} checked in to ${r.label}. Careful: Hill Booker had no free ${r.room_type} room left on ${listDays(d.full_nights)}. Check your online bookings for those nights.`, bad: true }
        : `${cin.name.trim()} checked in to ${r.label}.${r.room_type_id ? " Those nights are now closed on Hill Booker for this room." : ""}`
    );
    if (res) {
      const photos = cin.photos;
      setCin(null);
      if (photos.front || photos.back) {
        setBusy(true);
        const err = await sendPickedPhotos(`/hotel/guests/${res.data.id}`, photos, token);
        setBusy(false);
        if (err) setMsg({ text: err, bad: true });
      }
    }
  }

  const rooms = data ? data.rooms : [];
  const count = (s) => rooms.filter((r) => shown(r) === s).length;
  const missing = data ? data.room_types.reduce((n, t) => n + Math.max(0, t.total_rooms - t.listed), 0) : 0;
  const canCheckIn = (r) => !r.guest_name && shown(r) === "free";

  const guestLine = (r) =>
    r.guest_name && (
      <div className="mh-occupant">
        <span>
          <b>{r.guest_name}</b>
          {r.guest_phone && (
            <>
              {" · "}
              <a href={`tel:${r.guest_phone}`}>{r.guest_phone}</a>
            </>
          )}
        </span>
        <span className="meta">
          {r.guest_kind === "hillbooker" ? "Hill Booker" : "Direct"} · {day(r.guest_until) <= today ? "checking out today" : `until ${prettyDate(day(r.guest_until))}`}
        </span>
        {Number(r.guest_balance) > 0 ? <span className="mh-due">Balance {money(r.guest_balance)}</span> : <span className="mh-clear">Fully paid</span>}
      </div>
    );

  const action = (r) =>
    r.guest_name ? (
      <button type="button" className="btn btn-small mh-out" onClick={() => checkOut(r)} disabled={busy}>
        Check out
      </button>
    ) : canCheckIn(r) ? (
      <button type="button" className="btn btn-small btn-primary" onClick={() => startCheckIn(r)} disabled={busy}>
        Check in guest
      </button>
    ) : null;

  return (
    <>
      <HotelHead {...h} />
      {pid && (
        <>
          {msg.text && (
            <p className={msg.bad ? "form-error" : "ok"} role={msg.bad ? "alert" : "status"}>
              {msg.text}
            </p>
          )}
          {data === null && !msg.bad && <p className="empty">Loading…</p>}
          {data && (
            <>
              <div className="mh-tiles">
                {Object.keys(STATUS).map((s) => (
                  <div className={`mh-tile mh-${s}`} key={s}>
                    <b>{count(s)}</b>
                    <span>{STATUS[s]}</span>
                  </div>
                ))}
              </div>

              {data.room_types.length > 0 && (
                <p className="meta">
                  Booked on Hill Booker today: {data.room_types.map((t) => `${t.name} ${t.booked_today} of ${t.total_rooms}`).join(" · ")}.{" "}
                  <Link href={`/dashboard/properties/${pid}`}>Open the calendar</Link> to block dates or change prices.
                </p>
              )}

              {arrivals.length > 0 && (
                <div className="notice">
                  <p>
                    <b>Hill Booker guests waiting for a room:</b>{" "}
                    {arrivals.map((a) => `${a.name} (${a.room_type}, ${plural(a.people, "guest")}, until ${prettyDate(day(a.check_out))})`).join("; ")}. Press <b>Check in guest</b> on a free room and choose them.
                  </p>
                </div>
              )}

              {missing > 0 && (
                <div className="notice">
                  <p>
                    Your listing has {missing} {missing === 1 ? "room" : "rooms"} not on this board yet.
                  </p>
                  <div className="actions" style={{ marginTop: "0.5rem" }}>
                    <button type="button" className="btn btn-small btn-primary" onClick={auto} disabled={busy}>
                      Add rooms from my listing
                    </button>
                  </div>
                </div>
              )}

              {cin && (
                <section className="mh-checkin" id="checkin-form">
                  <h2>Check in to {cin.room.label}</h2>
                  <p className="meta">{details(cin.room)}</p>
                  <form className="mh-form" onSubmit={checkIn}>
                    {arrivals.length > 0 && (
                      <label className="field mh-wide">
                        <span>Who is checking in?</span>
                        <select value={cin.who} onChange={(e) => setCin({ ...cin, who: e.target.value })}>
                          <option value="new">A new direct guest (walk-in, phone or another site)</option>
                          {arrivals.map((a) => (
                            <option key={a.id} value={a.id}>
                              Hill Booker booking: {a.name}, {a.room_type}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {cin.who === "new" && (
                      <>
                        <label className="field">
                          <span>Guest name</span>
                          <input value={cin.name} maxLength={80} onChange={(e) => setCin({ ...cin, name: e.target.value })} autoComplete="off" />
                        </label>
                        <label className="field">
                          <span>Phone</span>
                          <input type="tel" value={cin.phone} maxLength={20} onChange={(e) => setCin({ ...cin, phone: e.target.value })} autoComplete="off" />
                        </label>
                        <label className="field">
                          <span>Number of guests</span>
                          <input type="number" min="1" max="50" step="1" inputMode="numeric" value={cin.people} onChange={(e) => setCin({ ...cin, people: e.target.value })} />
                        </label>
                        <label className="field">
                          <span>Check-out date</span>
                          <input type="date" value={cin.check_out} min={addDays(today, 1)} onChange={(e) => setOut(e.target.value)} />
                        </label>
                        <label className="field">
                          <span>Total amount (₹)</span>
                          <input type="number" min="0" step="1" inputMode="decimal" value={cin.total_amount} onChange={(e) => setCin({ ...cin, total_amount: e.target.value, touched: true })} placeholder="0" />
                        </label>
                        <label className="field">
                          <span>Amount paid now (₹)</span>
                          <input type="number" min="0" step="1" inputMode="decimal" value={cin.paid_amount} onChange={(e) => setCin({ ...cin, paid_amount: e.target.value })} placeholder="0" />
                        </label>
                        <IdFields value={cin} onChange={setCin} />
                        <IdPhotoPicker files={cin.photos} onChange={(photos) => setCin({ ...cin, photos })} idType={cin.id_type} />
                        <label className="field mh-wide">
                          <span>Note (optional)</span>
                          <input value={cin.note} maxLength={300} onChange={(e) => setCin({ ...cin, note: e.target.value })} />
                        </label>
                      </>
                    )}
                    {cin.who !== "new" && <p className="meta mh-wide">The booking is already paid and recorded. To add the address, ID proof or balance collected, open the Guest register after check-in.</p>}
                    <div className="actions">
                      <button type="submit" className="btn btn-primary" disabled={busy}>
                        Check in
                      </button>
                      <button type="button" className="btn" onClick={() => setCin(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                </section>
              )}

              {rooms.length === 0 && <p className="empty">No rooms here yet. Add each room below, with its number or name.</p>}

              {rooms.length > 0 && (
                <div className="mh-viewbar">
                  <span className="meta">{plural(rooms.length, "room")}</span>
                  <div className="mh-toggle" role="group" aria-label="View">
                    <button type="button" className={view === "cards" ? "on" : ""} aria-pressed={view === "cards"} onClick={() => pickView("cards")}>
                      Cards
                    </button>
                    <button type="button" className={view === "table" ? "on" : ""} aria-pressed={view === "table"} onClick={() => pickView("table")}>
                      Table
                    </button>
                  </div>
                </div>
              )}

              {rooms.length > 0 && view === "cards" && (
                <ul className="mh-rooms">
                  {rooms.map((r) => {
                    const s = shown(r);
                    return (
                      <li key={r.id} className={`mh-room mh-${s}`}>
                        <div className="mh-room-top">
                          <b className="mh-room-name">{r.label}</b>
                          <span className="mh-badge">{STATUS[s]}</span>
                        </div>
                        <div className="mh-room-body">
                          <p className="meta">{details(r)}</p>
                          {guestLine(r)}
                          {r.note && <p className="meta">Note: {r.note}</p>}
                          {action(r)}
                          <StatusButtons room={r} onSet={setStatus} disabled={busy} />
                          <p className="mh-links">
                            <button type="button" className="link-btn" onClick={() => editNote(r)}>
                              {r.note ? "Edit note" : "Add note"}
                            </button>
                            <button type="button" className="link-btn mh-del" onClick={() => remove(r)}>
                              Remove
                            </button>
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {rooms.length > 0 && view === "table" && (
                <div className="mh-scroll">
                  <table className="mh-table mh-roomtable">
                    <thead>
                      <tr>
                        <th>Room</th>
                        <th>Status</th>
                        <th>Guest</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rooms.map((r) => (
                        <tr key={r.id} className={`mh-${shown(r)}`}>
                          <td>
                            <b>{r.label}</b>
                            <span className="meta">{details(r)}</span>
                            {r.note && <span className="meta">Note: {r.note}</span>}
                          </td>
                          <td>
                            <StatusButtons room={r} onSet={setStatus} disabled={busy} />
                          </td>
                          <td>{guestLine(r) || <span className="meta">No guest</span>}</td>
                          <td className="n">
                            {action(r)}
                            <p className="mh-links">
                              <button type="button" className="link-btn" onClick={() => editNote(r)}>
                                Note
                              </button>
                              <button type="button" className="link-btn mh-del" onClick={() => remove(r)}>
                                Remove
                              </button>
                            </p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <section className="prop-section">
                <h2>Add a room</h2>
                <form className="mh-form" onSubmit={add}>
                  <label className="field">
                    <span>Room number or name</span>
                    <input value={form.label} maxLength={30} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="101" />
                  </label>
                  <label className="field">
                    <span>Room type</span>
                    <select value={form.room_type_id} onChange={(e) => setForm({ ...form, room_type_id: e.target.value })}>
                      <option value="">Not set</option>
                      {data.room_types.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Note (optional)</span>
                    <input value={form.note} maxLength={200} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Ground floor, valley view" />
                  </label>
                  <div className="actions">
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                      Add room
                    </button>
                  </div>
                </form>
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Guard>
      <Rooms />
    </Guard>
  );
}
