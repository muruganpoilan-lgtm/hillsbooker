"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import Guard from "../../../components/dashboard/Guard";
import HotelHead, { useHotel } from "../../../components/dashboard/HotelHead";
import { api, prettyDate } from "../../../lib/api";

const STATUS = { free: "Free", occupied: "Occupied", cleaning: "Cleaning", repair: "Under repair" };
const blank = { label: "", room_type_id: "", note: "" };

// A free room with a guest staying today counts as occupied, so the board is right even if nobody changed the status.
const shown = (r) => (r.status === "free" && r.guest_name ? "occupied" : r.status);

function Rooms() {
  const { token, logout } = useAuth();
  const h = useHotel();
  const { pid } = h;
  const [data, setData] = useState(null);
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState({ text: "", bad: false });
  const [busy, setBusy] = useState(false);
  const seq = useRef(0); // only the newest answer from the server is shown

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
    setMsg({ text: "", bad: false });
    load();
  }, [load]);

  async function call(path, opts, done) {
    setBusy(true);
    const res = await api(path, { ...opts, token });
    setBusy(false);
    if (res.status === 401) return logout();
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    setMsg({ text: done ? done(res.data) : "", bad: false });
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
    if (res) setForm(blank);
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

  const rooms = data ? data.rooms : [];
  const count = (s) => rooms.filter((r) => shown(r) === s).length;
  const missing = data ? data.room_types.reduce((n, t) => n + Math.max(0, t.total_rooms - t.listed), 0) : 0;

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
              <div className="pay-summary">
                {Object.keys(STATUS).map((s) => (
                  <div className={`pay-stat mh-stat mh-${s}`} key={s}>
                    <span className="meta">{STATUS[s]}</span>
                    <b className="mh-big">{count(s)}</b>
                  </div>
                ))}
              </div>

              {data.room_types.length > 0 && (
                <p className="meta">
                  Booked on Hill Booker today: {data.room_types.map((t) => `${t.name} ${t.booked_today} of ${t.total_rooms}`).join(" · ")}.{" "}
                  <Link href={`/dashboard/properties/${pid}`}>Open the calendar</Link> to block dates or change prices.
                </p>
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

              {rooms.length === 0 && <p className="empty">No rooms here yet. Add each room below, with its number or name.</p>}

              {rooms.length > 0 && (
                <ul className="mh-rooms">
                  {rooms.map((r) => {
                    const s = shown(r);
                    return (
                      <li key={r.id} className={`mh-room mh-${s}`}>
                        <div className="mh-room-top">
                          <b className="row-name">{r.label}</b>
                          <span className="status">{STATUS[s]}</span>
                        </div>
                        <p className="meta">{r.room_type || "No room type"}</p>
                        {r.guest_name && (
                          <p className="meta">
                            {r.guest_name}, until {prettyDate(String(r.guest_until).slice(0, 10))}
                          </p>
                        )}
                        {r.note && <p className="meta">Note: {r.note}</p>}
                        <label className="field mh-room-set">
                          <span className="sr-only">Status of {r.label}</span>
                          <select value={r.status} onChange={(e) => setStatus(r, e.target.value)} disabled={busy}>
                            {Object.keys(STATUS).map((k) => (
                              <option key={k} value={k}>
                                {STATUS[k]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <p className="mh-links">
                          <button type="button" className="link-btn" onClick={() => editNote(r)}>
                            {r.note ? "Edit note" : "Add note"}
                          </button>
                          <button type="button" className="link-btn mh-del" onClick={() => remove(r)}>
                            Remove
                          </button>
                        </p>
                      </li>
                    );
                  })}
                </ul>
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
