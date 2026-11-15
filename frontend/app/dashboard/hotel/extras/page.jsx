"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../../components/AuthProvider";
import Guard from "../../../../components/dashboard/Guard";
import HotelHead, { num, useHotel } from "../../../../components/dashboard/HotelHead";
import { addDays, api, money, prettyDate, todayISO } from "../../../../lib/api";

const KINDS = [
  ["food", "Food and drinks"],
  ["laundry", "Laundry"],
  ["travel", "Travel desk"],
  ["other", "Other"],
];
const kindName = (k) => (KINDS.find(([id]) => id === k) || ["", "Other"])[1];
const day = (v) => String(v).slice(0, 10);
const blankCharge = { name: "", category: "food", qty: "1", unit_price: "", note: "" };
const blankItem = { name: "", category: "food", price: "" };

function Extras() {
  const { token, logout } = useAuth();
  const h = useHotel();
  const { pid } = h;
  const [date, setDate] = useState(todayISO);
  const [data, setData] = useState(null);
  const [who, setWho] = useState(""); // "walkin:<id>" or "hillbooker:<id>"
  const [form, setForm] = useState(blankCharge);
  const [item, setItem] = useState(blankItem);
  const [msg, setMsg] = useState({ text: "", bad: false });
  const [busy, setBusy] = useState(false);
  const seq = useRef(0); // only the newest answer from the server is shown

  const load = useCallback(async () => {
    if (!pid || !date) return;
    const mine = ++seq.current;
    const res = await api(`/hotel/${pid}/extras?day=${date}`, { token });
    if (mine !== seq.current) return;
    if (res.status === 401) return logout();
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    setData(res.data);
  }, [pid, date, token, logout]);

  useEffect(() => {
    setData(null);
    setMsg({ text: "", bad: false });
    load();
  }, [load]);

  useEffect(() => {
    setWho("");
  }, [pid]);

  const staying = data ? data.staying : [];
  const guest = staying.find((g) => `${g.kind}:${g.id}` === who) || null;
  const today = data ? day(data.today) : todayISO();

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

  function post(name, category, qty, price, note) {
    if (!guest) return setMsg({ text: "First choose the guest or room.", bad: true });
    return send(
      `/hotel/${pid}/charges`,
      { method: "POST", body: { kind: guest.kind, target_id: guest.id, name, category, qty, unit_price: price, charged_on: date, note: note || null } },
      `${qty > 1 ? `${qty} × ` : ""}${name} (${money(price * qty)}) added to ${guest.name}'s bill.`
    );
  }

  async function addCustom(e) {
    e.preventDefault();
    const price = num(form.unit_price);
    const qty = Math.round(num(form.qty) ?? 1);
    if (!form.name.trim()) return setMsg({ text: "Say what the charge is for.", bad: true });
    if (price === null || price < 0) return setMsg({ text: "Give the price.", bad: true });
    if (!(qty >= 1)) return setMsg({ text: "The quantity must be 1 or more.", bad: true });
    const res = await post(form.name.trim(), form.category, qty, price, form.note);
    if (res) setForm({ ...blankCharge, category: form.category });
  }

  function removeCharge(c) {
    if (!window.confirm(`Remove ${c.name} (${money(c.amount)}) from ${c.guest}'s bill?`)) return;
    send(`/hotel/charges/${c.id}`, { method: "DELETE" }, `${c.name} removed from the bill.`);
  }

  async function addItem(e) {
    e.preventDefault();
    const price = num(item.price);
    if (!item.name.trim() || price === null || price < 0) return setMsg({ text: "Give the item's name and price.", bad: true });
    const res = await send(`/hotel/${pid}/menu`, { method: "POST", body: { name: item.name, category: item.category, price } }, `${item.name.trim()} added to your price list.`);
    if (res) setItem({ ...blankItem, category: item.category });
  }

  function editPrice(m) {
    const v = window.prompt(`New price for ${m.name} (₹)`, String(Number(m.price)));
    if (v === null) return;
    const price = num(v);
    if (price === null || price < 0) return setMsg({ text: "That is not a price.", bad: true });
    send(`/hotel/menu/${m.id}`, { method: "PATCH", body: { price } }, `${m.name} is now ${money(price)}.`);
  }

  function removeItem(m) {
    if (!window.confirm(`Remove ${m.name} from your price list? Bills already made are not changed.`)) return;
    send(`/hotel/menu/${m.id}`, { method: "DELETE" }, `${m.name} removed from your price list.`);
  }

  return (
    <>
      <HotelHead {...h} />
      {pid && (
        <>
          <p className="meta">Food, laundry, travel and other extras are added to the guest's bill and collected at check-out.</p>
          {msg.text && (
            <p className={msg.bad ? "form-error" : "ok"} role={msg.bad ? "alert" : "status"}>
              {msg.text}
            </p>
          )}
          {data === null && !msg.bad && <p className="empty">Loading…</p>}
          {data && (
            <>
              <section className="mh-checkin">
                <h2>Add to a guest's bill</h2>
                {staying.length === 0 ? (
                  <p className="meta">
                    No guest is staying right now. Check a guest in from the <Link href="/dashboard/hotel">Rooms</Link> page first.
                  </p>
                ) : (
                  <>
                    <div className="mh-form">
                      <label className="field mh-wide">
                        <span>Guest or room</span>
                        <select value={who} onChange={(e) => setWho(e.target.value)}>
                          <option value="">Choose</option>
                          {staying.map((g) => (
                            <option key={`${g.kind}:${g.id}`} value={`${g.kind}:${g.id}`}>
                              {g.room ? `${g.room}: ` : ""}
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {guest && (
                      <p className="meta" style={{ marginTop: "0.5rem" }}>
                        Extras so far {money(guest.extras)} · balance to collect {money(Math.max(0, Number(guest.balance)))} ·{" "}
                        <Link href={`/dashboard/hotel/bill?kind=${guest.kind}&id=${guest.id}`}>Open bill</Link>
                      </p>
                    )}
                    {data.menu.length > 0 && (
                      <>
                        <p className="field-label" style={{ marginTop: "0.9rem" }}>
                          Tap an item to add one
                        </p>
                        <div className="mh-menu">
                          {data.menu.map((m) => (
                            <button key={m.id} type="button" className={`mh-item mh-k-${m.category}`} disabled={busy} onClick={() => post(m.name, m.category, 1, Number(m.price), "")}>
                              <b>{m.name}</b>
                              <span>{money(m.price)}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <form className="mh-form" onSubmit={addCustom} style={{ marginTop: "1rem" }}>
                      <label className="field">
                        <span>Other charge</span>
                        <input value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Lunch, 3 shirts, Ooty sightseeing" />
                      </label>
                      <label className="field">
                        <span>Type</span>
                        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                          {KINDS.map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Quantity</span>
                        <input type="number" min="1" max="999" step="1" inputMode="numeric" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
                      </label>
                      <label className="field">
                        <span>Price for one (₹)</span>
                        <input type="number" min="0" step="1" inputMode="decimal" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
                      </label>
                      <div className="actions">
                        <button type="submit" className="btn btn-primary" disabled={busy}>
                          Add to bill
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </section>

              <section className="prop-section">
                <div className="dash-head">
                  <h2>Extras on {date === today ? "today" : prettyDate(date)}</h2>
                  <div className="actions mh-daynav">
                    <button type="button" className="btn btn-small" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
                      ‹
                    </button>
                    <label className="field">
                      <span className="sr-only">Date</span>
                      <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
                    </label>
                    <button type="button" className="btn btn-small" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Next day">
                      ›
                    </button>
                  </div>
                </div>
                {data.charges.length === 0 ? (
                  <p className="meta">Nothing added on this day.</p>
                ) : (
                  <>
                    <p className="meta">Total {money(data.day_total)}</p>
                    <ul className="rows">
                      {data.charges.map((c) => (
                        <li key={c.id} className="plain-row">
                          <div>
                            <p className="row-name">
                              {c.qty > 1 ? `${c.qty} × ` : ""}
                              {c.name}
                            </p>
                            <p className="meta">
                              {c.room ? `${c.room} · ` : ""}
                              {c.guest} · {kindName(c.category)}
                            </p>
                          </div>
                          <div className="right">
                            <span className="price">{money(c.amount)}</span>
                            <p className="mh-links">
                              <Link href={`/dashboard/hotel/bill?kind=${c.kind}&id=${c.target_id}`}>Bill</Link>
                              <button type="button" className="link-btn mh-del" onClick={() => removeCharge(c)}>
                                Remove
                              </button>
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              <section className="prop-section">
                <h2>Your price list</h2>
                <p className="meta">Items you sell often. They appear as one-tap buttons above.</p>
                {data.menu.length > 0 && (
                  <ul className="rows">
                    {data.menu.map((m) => (
                      <li key={m.id} className="plain-row">
                        <div>
                          <p className="row-name">{m.name}</p>
                          <p className="meta">{kindName(m.category)}</p>
                        </div>
                        <div className="right">
                          <span className="price">{money(m.price)}</span>
                          <p className="mh-links">
                            <button type="button" className="link-btn" onClick={() => editPrice(m)}>
                              Change price
                            </button>
                            <button type="button" className="link-btn mh-del" onClick={() => removeItem(m)}>
                              Remove
                            </button>
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <form className="mh-form" onSubmit={addItem}>
                  <label className="field">
                    <span>Item name</span>
                    <input value={item.name} maxLength={60} onChange={(e) => setItem({ ...item, name: e.target.value })} placeholder="Tea, breakfast, shirt wash" />
                  </label>
                  <label className="field">
                    <span>Type</span>
                    <select value={item.category} onChange={(e) => setItem({ ...item, category: e.target.value })}>
                      {KINDS.map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Price (₹)</span>
                    <input type="number" min="0" step="1" inputMode="decimal" value={item.price} onChange={(e) => setItem({ ...item, price: e.target.value })} />
                  </label>
                  <div className="actions">
                    <button type="submit" className="btn" disabled={busy}>
                      Add to price list
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
      <Extras />
    </Guard>
  );
}
