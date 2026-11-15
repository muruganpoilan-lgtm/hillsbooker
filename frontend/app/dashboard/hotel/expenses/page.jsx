"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../../components/AuthProvider";
import Guard from "../../../../components/dashboard/Guard";
import HotelHead, { downloadFile, num, useHotel } from "../../../../components/dashboard/HotelHead";
import { api, money, prettyDate, todayISO } from "../../../../lib/api";

const KINDS = [
  ["groceries", "Groceries"],
  ["electricity", "Electricity"],
  ["water", "Water"],
  ["gas", "Gas"],
  ["repairs", "Repairs"],
  ["laundry", "Laundry"],
  ["supplies", "Supplies"],
  ["fuel", "Fuel"],
  ["rent", "Rent"],
  ["other", "Other"],
];
const METHODS = [
  ["cash", "Cash"],
  ["upi", "UPI"],
  ["bank", "Bank transfer"],
  ["card", "Card"],
];
const label = (list, k) => (list.find(([id]) => id === k) || ["", ""])[1];
const day = (v) => String(v).slice(0, 10);
const thisMonth = () => todayISO().slice(0, 7);
const blank = () => ({ spent_on: todayISO(), category: "groceries", amount: "", supplier: "", method: "cash", paid: "yes", note: "" });

function shift(month, by) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthName(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function Expenses() {
  const { token, logout } = useAuth();
  const h = useHotel();
  const { pid } = h;
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState(null);
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState({ text: "", bad: false });
  const [busy, setBusy] = useState(false);
  const seq = useRef(0); // only the newest answer from the server is shown

  const load = useCallback(async () => {
    if (!pid || !month) return;
    const mine = ++seq.current;
    const res = await api(`/hotel/${pid}/expenses?month=${month}`, { token });
    if (mine !== seq.current) return;
    if (res.status === 401) return logout();
    if (!res.ok) {
      setData(null);
      return setMsg({ text: res.error, bad: true });
    }
    setData(res.data);
  }, [pid, month, token, logout]);

  useEffect(() => {
    setData(null);
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
    const amount = num(form.amount);
    if (!(amount > 0)) return setMsg({ text: "Give the amount.", bad: true });
    const paid = form.paid === "yes";
    const body = { spent_on: form.spent_on || null, category: form.category, amount, supplier: form.supplier || null, method: paid ? form.method : null, paid, note: form.note || null };
    const res = await send(`/hotel/${pid}/expenses`, { method: "POST", body }, `${label(KINDS, form.category)} expense of ${money(amount)} saved${paid ? "" : " as not paid yet"}.`);
    if (res) setForm({ ...blank(), category: form.category, spent_on: form.spent_on });
  }

  function markPaid(x) {
    if (!window.confirm(`Mark ${money(x.amount)}${x.supplier ? ` to ${x.supplier}` : ""} as paid today?`)) return;
    send(`/hotel/expenses/${x.id}`, { method: "PATCH", body: { paid: true } }, "Marked as paid.");
  }

  function remove(x) {
    if (!window.confirm(`Delete this expense: ${label(KINDS, x.category)}, ${money(x.amount)}?`)) return;
    send(`/hotel/expenses/${x.id}`, { method: "DELETE" }, "Expense deleted.");
  }

  async function download() {
    setBusy(true);
    const err = await downloadFile(`/hotel/${pid}/expenses.xlsx?month=${month}`, `expenses-${month}.xlsx`, token);
    setBusy(false);
    if (err) setMsg({ text: err, bad: true });
  }

  const t = data && data.totals;
  const top = t && t.by_category.length ? Number(t.by_category[0].amount) : 0;

  return (
    <>
      <HotelHead {...h} />
      {pid && (
        <>
          <p className="meta">Only you can see these records. Note what the hotel spends, and bills you still owe to suppliers.</p>
          <div className="actions mh-filter">
            <button type="button" className="btn btn-small" onClick={() => setMonth(shift(month, -1))} aria-label="Previous month">
              ‹
            </button>
            <label className="field">
              <span className="sr-only">Month</span>
              <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
            </label>
            <button type="button" className="btn btn-small" onClick={() => setMonth(shift(month, 1))} aria-label="Next month">
              ›
            </button>
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
            <>
              <div className="pay-summary">
                <div className="pay-stat">
                  <span className="meta">Spent in {monthName(month)}</span>
                  <b className="mh-big">{money(t.spent)}</b>
                </div>
                <div className="pay-stat">
                  <span className="meta">Salary and advances paid</span>
                  <b className="mh-big">{money(t.salary_paid)}</b>
                </div>
                <div className="pay-stat">
                  <span className="meta">Total with salary</span>
                  <b className="mh-big">{money(t.with_salary)}</b>
                </div>
                <div className="pay-stat">
                  <span className="meta">Owed to suppliers (all months)</span>
                  <b className={`mh-big${Number(t.due_all) > 0 ? " mh-due" : ""}`}>{money(t.due_all)}</b>
                </div>
              </div>

              {t.by_category.length > 0 && (
                <section className="ov-panel mh-cats">
                  <h2>Where the money went</h2>
                  {t.by_category.map((c) => (
                    <div key={c.category} className="mh-cat">
                      <span>{label(KINDS, c.category)}</span>
                      <i>
                        <b style={{ width: `${Math.max(2, (Number(c.amount) / top) * 100)}%` }} />
                      </i>
                      <span className="n">{money(c.amount)}</span>
                    </div>
                  ))}
                </section>
              )}

              {data.dues.length > 0 && (
                <section className="prop-section">
                  <h2>Bills to pay</h2>
                  <ul className="rows">
                    {data.dues.map((x) => (
                      <li key={x.id} className="plain-row">
                        <div>
                          <p className="row-name">{x.supplier || label(KINDS, x.category)}</p>
                          <p className="meta">
                            {label(KINDS, x.category)} · bill dated {prettyDate(day(x.spent_on))}
                            {x.note ? ` · ${x.note}` : ""}
                          </p>
                        </div>
                        <div className="right">
                          <span className="price">{money(x.amount)}</span>
                          <p className="mh-links">
                            <button type="button" className="link-btn" onClick={() => markPaid(x)}>
                              Mark as paid
                            </button>
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="prop-section">
                <h2>Add an expense</h2>
                <form className="mh-form" onSubmit={add}>
                  <label className="field">
                    <span>Date</span>
                    <input type="date" value={form.spent_on} max={todayISO()} onChange={set("spent_on")} />
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
                    <span>Amount (₹)</span>
                    <input type="number" min="1" step="1" inputMode="decimal" value={form.amount} onChange={set("amount")} />
                  </label>
                  <label className="field">
                    <span>Supplier or shop (optional)</span>
                    <input value={form.supplier} maxLength={80} onChange={set("supplier")} />
                  </label>
                  <label className="field">
                    <span>Paid?</span>
                    <select value={form.paid} onChange={set("paid")}>
                      <option value="yes">Paid</option>
                      <option value="no">Not paid yet (owed to supplier)</option>
                    </select>
                  </label>
                  {form.paid === "yes" && (
                    <label className="field">
                      <span>Paid by</span>
                      <select value={form.method} onChange={set("method")}>
                        {METHODS.map(([k, name]) => (
                          <option key={k} value={k}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="field mh-wide">
                    <span>Note (optional)</span>
                    <input value={form.note} maxLength={300} onChange={set("note")} placeholder="Vegetables for the week, bill number" />
                  </label>
                  <div className="actions">
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                      Save expense
                    </button>
                  </div>
                </form>
              </section>

              <section className="prop-section">
                <h2>Expenses in {monthName(month)}</h2>
                {data.expenses.length === 0 ? (
                  <p className="meta">No expenses noted for this month.</p>
                ) : (
                  <ul className="rows">
                    {data.expenses.map((x) => (
                      <li key={x.id} className="plain-row">
                        <div>
                          <p className="row-name">
                            {label(KINDS, x.category)}
                            {!x.paid && <span className="mh-tag mh-tag-due">Not paid yet</span>}
                          </p>
                          <p className="meta">
                            {prettyDate(day(x.spent_on))}
                            {x.supplier ? ` · ${x.supplier}` : ""}
                            {x.paid && x.method ? ` · ${label(METHODS, x.method)}` : ""}
                            {x.note ? ` · ${x.note}` : ""}
                          </p>
                        </div>
                        <div className="right">
                          <span className="price">{money(x.amount)}</span>
                          <p className="mh-links">
                            <button type="button" className="link-btn mh-del" onClick={() => remove(x)}>
                              Delete
                            </button>
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
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
      <Expenses />
    </Guard>
  );
}
