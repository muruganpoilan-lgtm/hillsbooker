"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../../components/AuthProvider";
import Guard from "../../../../components/dashboard/Guard";
import HotelHead, { downloadFile, num, useHotel } from "../../../../components/dashboard/HotelHead";
import { api, prettyDate, todayISO } from "../../../../lib/api";

const KINDS = [
  ["linen", "Linen"],
  ["toiletries", "Toiletries"],
  ["kitchen", "Kitchen"],
  ["cleaning", "Cleaning"],
  ["other", "Other"],
];
const REASONS = { purchase: "Bought", used: "Used", damaged: "Damaged or lost", correction: "Count corrected" };
const kindName = (k) => (KINDS.find(([id]) => id === k) || ["", "Other"])[1];
const qty = (v) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const blank = { name: "", category: "linen", unit: "pieces", qty: "", low_level: "" };

function Stock() {
  const { token, logout } = useAuth();
  const h = useHotel();
  const { pid } = h;
  const [data, setData] = useState(null);
  const [form, setForm] = useState(blank);
  const [move, setMove] = useState(null); // {item, dir: "in" | "out", amount, reason, note}
  const [hist, setHist] = useState(null); // {id, rows}
  const [msg, setMsg] = useState({ text: "", bad: false });
  const [busy, setBusy] = useState(false);
  const seq = useRef(0); // only the newest answer from the server is shown

  const load = useCallback(async () => {
    if (!pid) return;
    const mine = ++seq.current;
    const res = await api(`/hotel/${pid}/stock`, { token });
    if (mine !== seq.current) return;
    if (res.status === 401) return logout();
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    setData(res.data);
  }, [pid, token, logout]);

  useEffect(() => {
    setData(null);
    setMove(null);
    setHist(null);
    setMsg({ text: "", bad: false });
    load();
  }, [load]);

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

  async function add(e) {
    e.preventDefault();
    if (!form.name.trim()) return setMsg({ text: "Give the item's name.", bad: true });
    const body = { name: form.name, category: form.category, unit: form.unit.trim() || "pieces", qty: num(form.qty) ?? 0, low_level: num(form.low_level) ?? 0 };
    if (body.qty < 0 || body.low_level < 0) return setMsg({ text: "Numbers can't be less than zero.", bad: true });
    const res = await send(`/hotel/${pid}/stock`, { method: "POST", body }, `${form.name.trim()} added to your stock list.`);
    if (res) setForm({ ...blank, category: form.category });
  }

  async function saveMove(e) {
    e.preventDefault();
    const n = num(move.amount);
    if (!(n > 0)) return setMsg({ text: "Give the quantity.", bad: true });
    const change = move.dir === "in" ? n : -n;
    const res = await send(
      `/hotel/stock/${move.item.id}/move`,
      { method: "POST", body: { change, reason: move.reason, note: move.note || null } },
      `${move.item.name}: ${move.dir === "in" ? "added" : "took out"} ${qty(n)} ${move.item.unit}.`
    );
    if (res) {
      setMove(null);
      if (hist && hist.id === move.item.id) showHistory(move.item, true);
    }
  }

  async function showHistory(item, refresh = false) {
    if (!refresh && hist && hist.id === item.id) return setHist(null);
    const res = await api(`/hotel/stock/${item.id}/moves`, { token });
    if (res.status === 401) return logout();
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    setHist({ id: item.id, rows: res.data });
  }

  function setLow(item) {
    const v = window.prompt(`Warn me when ${item.name} is at or below how many ${item.unit}? (0 = no warning)`, String(Number(item.low_level)));
    if (v === null) return;
    const n = num(v);
    if (n === null || n < 0) return setMsg({ text: "That is not a number.", bad: true });
    send(`/hotel/stock/${item.id}`, { method: "PATCH", body: { low_level: n } }, `Warning level for ${item.name} set to ${qty(n)}.`);
  }

  function remove(item) {
    if (!window.confirm(`Delete ${item.name} and its history from your stock list?`)) return;
    send(`/hotel/stock/${item.id}`, { method: "DELETE" }, `${item.name} deleted.`);
  }

  async function download() {
    setBusy(true);
    const err = await downloadFile(`/hotel/${pid}/stock.xlsx`, `stock-${todayISO()}.xlsx`, token);
    setBusy(false);
    if (err) setMsg({ text: err, bad: true });
  }

  const items = data ? data.items : [];
  const groups = KINDS.map(([k, name]) => [name, items.filter((i) => i.category === k)]).filter(([, list]) => list.length);

  return (
    <>
      <HotelHead {...h} />
      {pid && (
        <>
          <div className="dash-head">
            <p className="meta">Linen, toiletries, kitchen and cleaning stock. Set a warning level to know when to buy more.</p>
            <button type="button" className="btn btn-small" onClick={download} disabled={busy || !items.length}>
              Download Excel
            </button>
          </div>
          {msg.text && (
            <p className={msg.bad ? "form-error" : "ok"} role={msg.bad ? "alert" : "status"}>
              {msg.text}
            </p>
          )}
          {data === null && !msg.bad && <p className="empty">Loading…</p>}
          {data && data.low > 0 && (
            <div className="notice">
              <p>
                <b>
                  {data.low} {data.low === 1 ? "item is" : "items are"} running low:
                </b>{" "}
                {items.filter((i) => i.low).map((i) => `${i.name} (${qty(i.qty)} ${i.unit})`).join(", ")}.
              </p>
            </div>
          )}
          {data && items.length === 0 && <p className="empty">No stock items yet. Add your first item below, for example bath towels or soap.</p>}

          {groups.map(([name, list]) => (
            <section className="prop-section" key={name}>
              <h2>{name}</h2>
              <ul className="rows">
                {list.map((i) => (
                  <li key={i.id} className="plain-row mh-stock">
                    <div>
                      <p className="row-name">
                        {i.name}
                        {i.low && <span className="mh-tag mh-tag-due">Buy more</span>}
                      </p>
                      <p className="meta">
                        {Number(i.low_level) > 0 ? `Warn at ${qty(i.low_level)} ${i.unit}` : "No warning level"}
                      </p>
                      {move && move.item.id === i.id && (
                        <form className="mh-form mh-inline" onSubmit={saveMove}>
                          <label className="field">
                            <span>{move.dir === "in" ? `How many ${i.unit} came in?` : `How many ${i.unit} went out?`}</span>
                            <input type="number" min="0" step="any" inputMode="decimal" value={move.amount} onChange={(e) => setMove({ ...move, amount: e.target.value })} autoFocus />
                          </label>
                          <label className="field">
                            <span>Reason</span>
                            <select value={move.reason} onChange={(e) => setMove({ ...move, reason: e.target.value })}>
                              {(move.dir === "in" ? ["purchase", "correction"] : ["used", "damaged", "correction"]).map((r) => (
                                <option key={r} value={r}>
                                  {REASONS[r]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field">
                            <span>Note (optional)</span>
                            <input value={move.note} maxLength={200} onChange={(e) => setMove({ ...move, note: e.target.value })} />
                          </label>
                          <div className="actions">
                            <button type="submit" className="btn btn-small btn-primary" disabled={busy}>
                              Save
                            </button>
                            <button type="button" className="btn btn-small" onClick={() => setMove(null)}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                      {hist && hist.id === i.id && (
                        <ul className="mh-hist">
                          {hist.rows.length === 0 && <li className="meta">No changes recorded yet.</li>}
                          {hist.rows.map((m) => (
                            <li key={m.id}>
                              <span>{prettyDate(String(m.moved_on).slice(0, 10))}</span>
                              <span>{m.note === "Opening stock" ? "Opening stock" : REASONS[m.reason]}</span>
                              <b className={Number(m.change) > 0 ? "mh-clear" : "mh-due"}>
                                {Number(m.change) > 0 ? "+" : "−"}
                                {qty(Math.abs(Number(m.change)))}
                              </b>
                              <span className="meta">left {qty(m.qty_after)}{m.note && m.note !== "Opening stock" ? ` · ${m.note}` : ""}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="right">
                      <span className={`mh-big${i.low ? " mh-due" : ""}`}>{qty(i.qty)}</span> <span className="meta" style={{ display: "inline" }}>{i.unit}</span>
                      <div className="actions mh-stock-btns">
                        <button type="button" className="btn btn-small btn-primary" onClick={() => setMove({ item: i, dir: "in", amount: "", reason: "purchase", note: "" })}>
                          + Add
                        </button>
                        <button type="button" className="btn btn-small" onClick={() => setMove({ item: i, dir: "out", amount: "", reason: "used", note: "" })} disabled={Number(i.qty) <= 0}>
                          − Use
                        </button>
                      </div>
                      <p className="mh-links">
                        <button type="button" className="link-btn" onClick={() => showHistory(i)}>
                          {hist && hist.id === i.id ? "Hide history" : "History"}
                        </button>
                        <button type="button" className="link-btn" onClick={() => setLow(i)}>
                          Warning level
                        </button>
                        <button type="button" className="link-btn mh-del" onClick={() => remove(i)}>
                          Delete
                        </button>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {data && (
            <section className="prop-section">
              <h2>Add a stock item</h2>
              <form className="mh-form" onSubmit={add}>
                <label className="field">
                  <span>Item name</span>
                  <input value={form.name} maxLength={60} onChange={set("name")} placeholder="Bath towels" />
                </label>
                <label className="field">
                  <span>Type</span>
                  <select value={form.category} onChange={set("category")}>
                    {KINDS.map(([k, name]) => (
                      <option key={k} value={k}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Counted in</span>
                  <input value={form.unit} maxLength={20} onChange={set("unit")} placeholder="pieces, kg, litres, packets" />
                </label>
                <label className="field">
                  <span>In stock now</span>
                  <input type="number" min="0" step="any" inputMode="decimal" value={form.qty} onChange={set("qty")} placeholder="0" />
                </label>
                <label className="field">
                  <span>Warn me at or below</span>
                  <input type="number" min="0" step="any" inputMode="decimal" value={form.low_level} onChange={set("low_level")} placeholder="0 = no warning" />
                </label>
                <div className="actions">
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    Add item
                  </button>
                </div>
              </form>
            </section>
          )}
        </>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Guard>
      <Stock />
    </Guard>
  );
}
