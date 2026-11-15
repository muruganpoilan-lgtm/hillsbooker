"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../../components/AuthProvider";
import Guard from "../../../../components/dashboard/Guard";
import HotelHead, { downloadFile, num, useHotel } from "../../../../components/dashboard/HotelHead";
import { api, money, prettyDate, todayISO } from "../../../../lib/api";

const day = (v) => String(v).slice(0, 10);
const thisMonth = () => todayISO().slice(0, 7);
const blank = () => ({ staff_id: "", kind: "advance", amount: "", paid_on: todayISO(), note: "" });

function shift(month, by) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthName(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function Salary() {
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
    const res = await api(`/hotel/${pid}/salary?month=${month}`, { token });
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

  useEffect(() => {
    setForm(blank());
  }, [pid]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function add(e) {
    e.preventDefault();
    const amount = num(form.amount);
    if (!form.staff_id) return setMsg({ text: "Choose the staff member.", bad: true });
    if (!(amount > 0)) return setMsg({ text: "Give the amount.", bad: true });
    setBusy(true);
    const res = await api(`/hotel/${pid}/salary/payments`, {
      method: "POST",
      body: { staff_id: form.staff_id, month, kind: form.kind, amount, paid_on: form.paid_on || null, note: form.note || null },
      token,
    });
    setBusy(false);
    if (res.status === 401) return logout();
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    setMsg({ text: `${form.kind === "advance" ? "Advance" : "Salary payment"} of ${money(amount)} saved for ${monthName(month)}.`, bad: false });
    setForm({ ...blank(), staff_id: form.staff_id, kind: form.kind });
    load();
  }

  async function remove(p) {
    if (!window.confirm(`Delete this entry: ${p.name}, ${money(p.amount)}?`)) return;
    const res = await api(`/hotel/salary/payments/${p.id}`, { method: "DELETE", token });
    if (res.status === 401) return logout();
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    setMsg({ text: "Entry deleted.", bad: false });
    load();
  }

  // "Pay balance" fills the form with what is still owed to that person this month.
  function payBalance(s) {
    setForm({ ...blank(), staff_id: s.id, kind: "salary", amount: String(Number(s.balance)) });
    document.getElementById("salary-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function download() {
    setBusy(true);
    const err = await downloadFile(`/hotel/${pid}/salary.xlsx?month=${month}`, `salary-${month}.xlsx`, token);
    setBusy(false);
    if (err) setMsg({ text: err, bad: true });
  }

  const t = data && data.totals;
  const staff = data ? data.staff : [];

  return (
    <>
      <HotelHead {...h} />
      {pid && (
        <>
          <p className="meta">Only you can see these records. Balance = monthly salary minus advances minus salary already paid.</p>
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
            <div className="pay-summary">
              <div className="pay-stat">
                <span className="meta">Salary for {monthName(month)}</span>
                <b className="mh-big">{money(t.salary)}</b>
              </div>
              <div className="pay-stat">
                <span className="meta">Advances given</span>
                <b className="mh-big">{money(t.advances)}</b>
              </div>
              <div className="pay-stat">
                <span className="meta">Salary paid</span>
                <b className="mh-big">{money(t.paid)}</b>
              </div>
              <div className="pay-stat">
                <span className="meta">Balance to pay</span>
                <b className="mh-big">{money(t.balance)}</b>
              </div>
            </div>
          )}
          {data && staff.length === 0 && (
            <p className="empty">
              No staff for this month. <Link href="/dashboard/hotel/staff">Add your staff</Link> first.
            </p>
          )}
          {staff.length > 0 && (
            <div className="mh-scroll">
              <table className="mh-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Attendance</th>
                    <th className="n">Salary</th>
                    <th className="n">Advances</th>
                    <th className="n">Paid</th>
                    <th className="n">Balance</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => {
                    const bal = Number(s.balance);
                    return (
                      <tr key={s.id}>
                        <td>
                          <b>{s.name}</b>
                          <span className="meta">{s.job || "Staff"}{s.active ? "" : " · left"}</span>
                        </td>
                        <td>
                          <span className="meta">
                            {s.present} present{s.half ? `, ${s.half} half` : ""}{s.absent ? `, ${s.absent} absent` : ""}{s.leave ? `, ${s.leave} leave` : ""}
                          </span>
                        </td>
                        <td className="n">{money(s.monthly_salary)}</td>
                        <td className="n">{money(s.advances)}</td>
                        <td className="n">{money(s.salary_paid)}</td>
                        <td className={`n ${bal > 0 ? "mh-due" : "mh-clear"}`}>{bal < 0 ? `Overpaid ${money(-bal)}` : bal === 0 ? "Paid" : money(bal)}</td>
                        <td className="n">
                          {bal > 0 && (
                            <button type="button" className="link-btn" onClick={() => payBalance(s)}>
                              Pay balance
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {staff.length > 0 && <p className="meta">The salary column uses each person's current monthly salary. Attendance is shown for your reference and does not change the salary.</p>}

          {staff.length > 0 && (
            <section className="prop-section" id="salary-form">
              <h2>Add an advance or salary payment</h2>
              <p className="meta">This entry counts for {monthName(month)}.</p>
              <form className="mh-form" onSubmit={add}>
                <label className="field">
                  <span>Staff member</span>
                  <select value={form.staff_id} onChange={set("staff_id")}>
                    <option value="">Choose</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Type</span>
                  <select value={form.kind} onChange={set("kind")}>
                    <option value="advance">Advance</option>
                    <option value="salary">Salary paid</option>
                  </select>
                </label>
                <label className="field">
                  <span>Amount (₹)</span>
                  <input type="number" min="1" step="1" inputMode="decimal" value={form.amount} onChange={set("amount")} />
                </label>
                <label className="field">
                  <span>Date given</span>
                  <input type="date" value={form.paid_on} max={todayISO()} onChange={set("paid_on")} />
                </label>
                <label className="field mh-wide">
                  <span>Note (optional)</span>
                  <input value={form.note} maxLength={300} onChange={set("note")} placeholder="Cash, UPI, reason for advance" />
                </label>
                <div className="actions">
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    Save entry
                  </button>
                </div>
              </form>
            </section>
          )}

          {data && data.payments.length > 0 && (
            <section className="prop-section">
              <h2>Entries for {monthName(month)}</h2>
              <ul className="rows">
                {data.payments.map((p) => (
                  <li key={p.id} className="plain-row">
                    <div>
                      <p className="row-name">{p.name}</p>
                      <p className="meta">
                        {p.kind === "advance" ? "Advance" : "Salary paid"} · {prettyDate(day(p.paid_on))}
                        {p.note ? ` · ${p.note}` : ""}
                      </p>
                    </div>
                    <div className="right">
                      <span className="price">{money(p.amount)}</span>
                      <p className="mh-links">
                        <button type="button" className="link-btn mh-del" onClick={() => remove(p)}>
                          Delete
                        </button>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
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
      <Salary />
    </Guard>
  );
}
