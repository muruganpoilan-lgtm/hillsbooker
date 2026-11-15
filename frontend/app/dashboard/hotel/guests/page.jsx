"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../../components/AuthProvider";
import Guard from "../../../../components/dashboard/Guard";
import HotelHead, { downloadFile, num, useHotel } from "../../../../components/dashboard/HotelHead";
import { addDays, api, money, plural, prettyDate, todayISO } from "../../../../lib/api";

const day = (v) => String(v).slice(0, 10);
const blank = () => ({ name: "", phone: "", check_in: todayISO(), check_out: addDays(todayISO(), 1), room_id: "", people: "1", total_amount: "", paid_amount: "", note: "" });

function Guests() {
  const { token, logout } = useAuth();
  const h = useHotel();
  const { pid } = h;
  const [from, setFrom] = useState(() => addDays(todayISO(), -30));
  const [to, setTo] = useState(() => addDays(todayISO(), 60));
  const [data, setData] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState(""); // walk-in guest being edited
  const [extra, setExtra] = useState(null); // Hill Booker booking being edited: {id, room_id, collected, note, due}
  const [onlyToday, setOnlyToday] = useState(false);
  const [msg, setMsg] = useState({ text: "", bad: false });
  const [busy, setBusy] = useState(false);
  const seq = useRef(0); // only the newest answer from the server is shown

  const load = useCallback(async () => {
    if (!pid || !from || !to) return;
    const mine = ++seq.current;
    const res = await api(`/hotel/${pid}/guests?from=${from}&to=${to}`, { token });
    if (mine !== seq.current) return;
    if (res.status === 401) return logout();
    if (!res.ok) {
      setData(null);
      return setMsg({ text: res.error, bad: true });
    }
    setData(res.data);
  }, [pid, from, to, token, logout]);

  useEffect(() => {
    setMsg({ text: "", bad: false });
    load();
  }, [load]);

  useEffect(() => {
    if (!pid) return;
    setEditId("");
    setExtra(null);
    setForm(blank());
    api(`/hotel/${pid}/rooms`, { token }).then((res) => res.ok && setRooms(res.data.rooms));
  }, [pid, token]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function send(path, opts, done) {
    setBusy(true);
    const res = await api(path, { ...opts, token });
    setBusy(false);
    if (res.status === 401) return logout();
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    setMsg({ text: done, bad: false });
    load();
    return res;
  }

  async function save(e) {
    e.preventDefault();
    const total = num(form.total_amount) ?? 0;
    const paid = num(form.paid_amount) ?? 0;
    if (!form.name.trim()) return setMsg({ text: "Give the guest's name.", bad: true });
    if (!form.check_in || !form.check_out || form.check_out <= form.check_in) return setMsg({ text: "Check-out must be after check-in.", bad: true });
    if (total < 0 || paid < 0) return setMsg({ text: "Amounts can't be less than zero.", bad: true });
    if (paid > total) return setMsg({ text: "The amount paid is more than the total.", bad: true });
    const body = {
      name: form.name,
      phone: form.phone || null,
      check_in: form.check_in,
      check_out: form.check_out,
      room_id: form.room_id || null,
      people: Math.max(1, Math.round(num(form.people) ?? 1)),
      total_amount: total,
      paid_amount: paid,
      note: form.note || null,
    };
    const res = editId
      ? await send(`/hotel/guests/${editId}`, { method: "PATCH", body }, `${form.name.trim()} updated.`)
      : await send(`/hotel/${pid}/guests`, { method: "POST", body }, `${form.name.trim()} added to the register.`);
    if (res) {
      setEditId("");
      setForm(blank());
    }
  }

  function startEdit(g) {
    setExtra(null);
    setEditId(g.id);
    setForm({
      name: g.name,
      phone: g.phone || "",
      check_in: day(g.check_in),
      check_out: day(g.check_out),
      room_id: g.room_id || "",
      people: String(g.people),
      total_amount: String(Number(g.total_amount)),
      paid_amount: String(Number(g.collected)),
      note: g.note || "",
    });
    document.getElementById("guest-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function remove(g) {
    if (!window.confirm(`Delete ${g.name} from the register? This cannot be undone.`)) return;
    if (editId === g.id) {
      setEditId("");
      setForm(blank());
    }
    send(`/hotel/guests/${g.id}`, { method: "DELETE" }, `${g.name} deleted.`);
  }

  async function saveExtra(e) {
    e.preventDefault();
    const collected = num(extra.collected) ?? 0;
    if (collected < 0 || collected > extra.due) return setMsg({ text: `The balance to collect for this booking is ${money(extra.due)}.`, bad: true });
    const res = await send(`/hotel/bookings/${extra.id}/extra`, { method: "PUT", body: { room_id: extra.room_id || null, collected, note: extra.note || null } }, "Booking updated.");
    if (res) setExtra(null);
  }

  async function download() {
    setBusy(true);
    const err = await downloadFile(`/hotel/${pid}/guests.xlsx?from=${from}&to=${to}`, `guest-register-${from}-to-${to}.xlsx`, token);
    setBusy(false);
    if (err) setMsg({ text: err, bad: true });
  }

  const today = data ? day(data.today) : todayISO();
  const all = data ? data.guests : [];
  const list = onlyToday ? all.filter((g) => day(g.check_in) <= today && day(g.check_out) > today) : all;
  const t = data && data.totals;

  return (
    <>
      <HotelHead {...h} />
      {pid && (
        <>
          <p className="meta">Hill Booker bookings appear here by themselves. Add guests who booked directly with you below.</p>
          <div className="actions mh-filter">
            <label className="field">
              <span>Stays from</span>
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="field">
              <span>To</span>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="check">
              <input type="checkbox" checked={onlyToday} onChange={(e) => setOnlyToday(e.target.checked)} />
              <span>Staying today only</span>
            </label>
            <button type="button" className="btn" onClick={download} disabled={busy || !data}>
              Download Excel
            </button>
          </div>
          {msg.text && (
            <p className={msg.bad ? "form-error" : "ok"} role={msg.bad ? "alert" : "status"}>
              {msg.text}
            </p>
          )}
          {data === null && !msg.bad && <p className="empty">Loading…</p>}
          {t && (
            <div className="pay-summary">
              <div className="pay-stat">
                <span className="meta">Guests in these dates</span>
                <b className="mh-big">{t.guests}</b>
              </div>
              <div className="pay-stat">
                <span className="meta">Total</span>
                <b className="mh-big">{money(t.total)}</b>
              </div>
              <div className="pay-stat">
                <span className="meta">Paid</span>
                <b className="mh-big">{money(t.paid)}</b>
              </div>
              <div className="pay-stat">
                <span className="meta">Balance to collect</span>
                <b className="mh-big">{money(t.balance)}</b>
              </div>
            </div>
          )}
          {data && list.length === 0 && <p className="empty">{onlyToday ? "No guests are staying today." : "No guests in these dates."}</p>}
          {list.length > 0 && (
            <ul className="rows">
              {list.map((g) => {
                const hb = g.source === "hillbooker";
                const due = Number(g.total_amount) - Number(g.paid_online);
                return (
                  <li key={`${g.source}-${g.id}`} className="plain-row mh-guest">
                    <div>
                      <p className="row-name">{g.name}</p>
                      <p className="meta">
                        {g.phone ? <a href={`tel:${g.phone}`}>{g.phone}</a> : "No phone"} · {hb ? "Hill Booker" : "Direct"} · {plural(g.people, "guest")}
                        {hb && g.rooms > 1 ? `, ${g.rooms} rooms` : ""}
                      </p>
                      <p className="meta">
                        {prettyDate(day(g.check_in))} to {prettyDate(day(g.check_out))} · {g.room || g.room_type || "Room not set"}
                      </p>
                      {g.note && <p className="meta">Note: {g.note}</p>}
                      {hb && extra && extra.id === g.id && (
                        <form className="mh-form mh-inline" onSubmit={saveExtra}>
                          <label className="field">
                            <span>Room given</span>
                            <select value={extra.room_id} onChange={(e) => setExtra({ ...extra, room_id: e.target.value })}>
                              <option value="">Not set</option>
                              {rooms.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field">
                            <span>Collected at property (of {money(due)})</span>
                            <input type="number" min="0" max={due} step="1" inputMode="decimal" value={extra.collected} onChange={(e) => setExtra({ ...extra, collected: e.target.value })} />
                          </label>
                          <label className="field">
                            <span>Note (optional)</span>
                            <input value={extra.note} maxLength={300} onChange={(e) => setExtra({ ...extra, note: e.target.value })} />
                          </label>
                          <div className="actions">
                            <button type="submit" className="btn btn-small btn-primary" disabled={busy}>
                              Save
                            </button>
                            <button type="button" className="btn btn-small" onClick={() => setExtra(null)}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                    <div className="right">
                      <span className="price">{money(g.total_amount)}</span>
                      <p className="meta">
                        Paid {money(g.paid)}
                        {hb ? ` (${money(g.paid_online)} online)` : ""}
                      </p>
                      <p className={Number(g.balance) > 0 ? "mh-due" : "mh-clear"}>{Number(g.balance) > 0 ? `Balance ${money(g.balance)}` : "Fully paid"}</p>
                      <p className="mh-links">
                        {hb ? (
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => {
                              setEditId("");
                              setForm(blank());
                              setExtra({ id: g.id, room_id: g.room_id || "", collected: String(Number(g.collected)), note: g.note || "", due });
                            }}
                          >
                            Room and balance
                          </button>
                        ) : (
                          <>
                            <button type="button" className="link-btn" onClick={() => startEdit(g)}>
                              Edit
                            </button>
                            <button type="button" className="link-btn mh-del" onClick={() => remove(g)}>
                              Delete
                            </button>
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <section className="prop-section" id="guest-form">
            <h2>{editId ? "Edit guest" : "Add a direct guest"}</h2>
            <p className="meta">For guests who walked in, called you or booked on another site. Adding a guest here does not block the room on Hill Booker; use the calendar for that.</p>
            <form className="mh-form" onSubmit={save}>
              <label className="field">
                <span>Guest name</span>
                <input value={form.name} maxLength={80} onChange={set("name")} autoComplete="off" />
              </label>
              <label className="field">
                <span>Phone</span>
                <input type="tel" value={form.phone} maxLength={20} onChange={set("phone")} autoComplete="off" />
              </label>
              <label className="field">
                <span>Check-in</span>
                <input type="date" value={form.check_in} onChange={set("check_in")} />
              </label>
              <label className="field">
                <span>Check-out</span>
                <input type="date" value={form.check_out} min={form.check_in ? addDays(form.check_in, 1) : undefined} onChange={set("check_out")} />
              </label>
              <label className="field">
                <span>Room</span>
                <select value={form.room_id} onChange={set("room_id")}>
                  <option value="">Not set</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Number of guests</span>
                <input type="number" min="1" max="50" step="1" inputMode="numeric" value={form.people} onChange={set("people")} />
              </label>
              <label className="field">
                <span>Total amount (₹)</span>
                <input type="number" min="0" step="1" inputMode="decimal" value={form.total_amount} onChange={set("total_amount")} placeholder="0" />
              </label>
              <label className="field">
                <span>Amount paid (₹)</span>
                <input type="number" min="0" step="1" inputMode="decimal" value={form.paid_amount} onChange={set("paid_amount")} placeholder="0" />
              </label>
              <label className="field mh-wide">
                <span>Note (optional)</span>
                <input value={form.note} maxLength={300} onChange={set("note")} />
              </label>
              <div className="actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {editId ? "Save changes" : "Add guest"}
                </button>
                {editId && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setEditId("");
                      setForm(blank());
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>
        </>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Guard>
      <Guests />
    </Guard>
  );
}
