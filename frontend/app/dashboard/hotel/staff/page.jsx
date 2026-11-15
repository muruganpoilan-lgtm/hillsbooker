"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../../components/AuthProvider";
import Guard from "../../../../components/dashboard/Guard";
import HotelHead, { num, useHotel } from "../../../../components/dashboard/HotelHead";
import { addDays, api, money, prettyDate, todayISO } from "../../../../lib/api";

const MARKS = [
  ["present", "Present"],
  ["half", "Half day"],
  ["absent", "Absent"],
  ["leave", "Leave"],
];
const blank = { name: "", phone: "", job: "", joined_on: "", monthly_salary: "", note: "" };
const day = (v) => String(v).slice(0, 10);

function Staff() {
  const { token, logout } = useAuth();
  const h = useHotel();
  const { pid } = h;
  const [staff, setStaff] = useState(null);
  const [date, setDate] = useState(todayISO);
  const [att, setAtt] = useState(null);
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState("");
  const [msg, setMsg] = useState({ text: "", bad: false });
  const [busy, setBusy] = useState(false);
  const attSeq = useRef(0); // a newer mark or load makes an older, slower answer from the server stale

  const fail = useCallback(
    (res) => {
      if (res.status === 401) logout();
      else setMsg({ text: res.error, bad: true });
    },
    [logout]
  );

  const loadStaff = useCallback(async () => {
    if (!pid) return;
    const res = await api(`/hotel/${pid}/staff`, { token });
    if (!res.ok) return fail(res);
    setStaff(res.data);
  }, [pid, token, fail]);

  const loadAtt = useCallback(async () => {
    if (!pid || !date) return;
    const seq = ++attSeq.current;
    const res = await api(`/hotel/${pid}/attendance?day=${date}`, { token });
    if (seq !== attSeq.current) return;
    if (!res.ok) return fail(res);
    setAtt(res.data.staff);
  }, [pid, date, token, fail]);

  useEffect(() => {
    setStaff(null);
    setEditId("");
    setForm(blank);
    setMsg({ text: "", bad: false });
    loadStaff();
  }, [loadStaff]);

  useEffect(() => {
    setAtt(null);
    loadAtt();
  }, [loadAtt]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function send(path, opts, done) {
    setBusy(true);
    const res = await api(path, { ...opts, token });
    setBusy(false);
    if (!res.ok) return fail(res);
    setMsg({ text: done || "", bad: false });
    loadStaff();
    loadAtt();
    return res;
  }

  async function save(e) {
    e.preventDefault();
    const salary = num(form.monthly_salary) ?? 0;
    if (!form.name.trim()) return setMsg({ text: "Give the staff member's name.", bad: true });
    if (salary < 0) return setMsg({ text: "The salary can't be less than zero.", bad: true });
    const body = { name: form.name, phone: form.phone || null, job: form.job || null, joined_on: form.joined_on || null, monthly_salary: salary, note: form.note || null };
    const res = editId
      ? await send(`/hotel/staff/${editId}`, { method: "PATCH", body }, `${form.name.trim()} updated.`)
      : await send(`/hotel/${pid}/staff`, { method: "POST", body }, `${form.name.trim()} added.`);
    if (res) {
      setEditId("");
      setForm(blank);
    }
  }

  function startEdit(s) {
    setEditId(s.id);
    setForm({ name: s.name, phone: s.phone || "", job: s.job || "", joined_on: s.joined_on ? day(s.joined_on) : "", monthly_salary: String(Number(s.monthly_salary)), note: s.note || "" });
    document.getElementById("staff-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setActive(s, active) {
    if (!active && !window.confirm(`Mark ${s.name} as left? Their salary records are kept.`)) return;
    send(`/hotel/staff/${s.id}`, { method: "PATCH", body: { active } }, active ? `${s.name} is back on the staff list.` : `${s.name} marked as left.`);
  }

  function remove(s) {
    if (!window.confirm(`Delete ${s.name}'s record? Use this only for a record added by mistake.`)) return;
    send(`/hotel/staff/${s.id}`, { method: "DELETE" }, `${s.name} deleted.`);
  }

  async function mark(a, status) {
    const next = a.status === status ? null : status; // pressing the same button again clears the mark
    attSeq.current++;
    setAtt((list) => (list || []).map((x) => (x.staff_id === a.staff_id ? { ...x, status: next } : x)));
    const res = await api(`/hotel/${pid}/attendance`, { method: "PUT", body: { day: date, marks: [{ staff_id: a.staff_id, status: next }] }, token });
    if (!res.ok) fail(res);
    loadAtt();
  }

  async function allPresent() {
    const marks = att.filter((a) => !a.status).map((a) => ({ staff_id: a.staff_id, status: "present" }));
    if (!marks.length) return;
    setBusy(true);
    const res = await api(`/hotel/${pid}/attendance`, { method: "PUT", body: { day: date, marks }, token });
    setBusy(false);
    if (!res.ok) fail(res);
    loadAtt();
  }

  const today = todayISO();

  return (
    <>
      <HotelHead {...h} />
      {pid && (
        <>
          <p className="meta">Only you can see these records. Hill Booker's team and other hosts cannot.</p>
          {msg.text && (
            <p className={msg.bad ? "form-error" : "ok"} role={msg.bad ? "alert" : "status"}>
              {msg.text}
            </p>
          )}

          <section className="prop-section">
            <div className="dash-head">
              <h2>Attendance</h2>
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
            {att === null && !msg.bad && <p className="empty">Loading…</p>}
            {att && att.length === 0 && <p className="meta">Add your staff below, then mark who came to work each day.</p>}
            {att && att.length > 0 && (
              <>
                <ul className="rows">
                  {att.map((a) => (
                    <li key={a.staff_id} className="plain-row">
                      <div>
                        <p className="row-name">{a.name}</p>
                        <p className="meta">{a.job || "Staff"}</p>
                      </div>
                      <div className="mh-marks" role="group" aria-label={`Attendance for ${a.name}`}>
                        {MARKS.map(([k, label]) => (
                          <button key={k} type="button" className={`chip mh-mark-${k}${a.status === k ? " on" : ""}`} aria-pressed={a.status === k} onClick={() => mark(a, k)}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
                {att.some((a) => !a.status) && (
                  <div className="actions" style={{ marginTop: "0.7rem" }}>
                    <button type="button" className="btn btn-small" onClick={allPresent} disabled={busy}>
                      Mark the rest present
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="prop-section">
            <div className="dash-head">
              <h2>Staff</h2>
              <Link href="/dashboard/hotel/salary" className="btn btn-small">
                Salary sheet
              </Link>
            </div>
            {staff === null && !msg.bad && <p className="empty">Loading…</p>}
            {staff && staff.length === 0 && <p className="meta">No staff records yet.</p>}
            {staff && staff.length > 0 && (
              <ul className="rows">
                {staff.map((s) => (
                  <li key={s.id} className={`plain-row${s.active ? "" : " mh-left"}`}>
                    <div>
                      <p className="row-name">{s.name}</p>
                      <p className="meta">
                        {s.job || "Staff"} · {s.phone ? <a href={`tel:${s.phone}`}>{s.phone}</a> : "No phone"}
                      </p>
                      <p className="meta">
                        {s.joined_on ? `Joined ${prettyDate(day(s.joined_on))}` : "Joining date not set"}
                        {!s.active && s.left_on ? ` · Left ${prettyDate(day(s.left_on))}` : ""}
                      </p>
                      {s.note && <p className="meta">Note: {s.note}</p>}
                    </div>
                    <div className="right">
                      <span className="price">{money(s.monthly_salary)}</span>
                      <p className="meta">a month</p>
                      <p className="mh-links">
                        <button type="button" className="link-btn" onClick={() => startEdit(s)}>
                          Edit
                        </button>
                        <button type="button" className="link-btn" onClick={() => setActive(s, !s.active)}>
                          {s.active ? "Mark as left" : "Bring back"}
                        </button>
                        <button type="button" className="link-btn mh-del" onClick={() => remove(s)}>
                          Delete
                        </button>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="prop-section" id="staff-form">
            <h2>{editId ? "Edit staff member" : "Add a staff member"}</h2>
            <form className="mh-form" onSubmit={save}>
              <label className="field">
                <span>Name</span>
                <input value={form.name} maxLength={80} onChange={set("name")} autoComplete="off" />
              </label>
              <label className="field">
                <span>Phone</span>
                <input type="tel" value={form.phone} maxLength={20} onChange={set("phone")} autoComplete="off" />
              </label>
              <label className="field">
                <span>Job</span>
                <input value={form.job} maxLength={60} onChange={set("job")} placeholder="Cook, housekeeping, reception" />
              </label>
              <label className="field">
                <span>Joining date</span>
                <input type="date" value={form.joined_on} max={today} onChange={set("joined_on")} />
              </label>
              <label className="field">
                <span>Monthly salary (₹)</span>
                <input type="number" min="0" step="1" inputMode="decimal" value={form.monthly_salary} onChange={set("monthly_salary")} placeholder="0" />
              </label>
              <label className="field">
                <span>Note (optional)</span>
                <input value={form.note} maxLength={300} onChange={set("note")} />
              </label>
              <div className="actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {editId ? "Save changes" : "Add staff member"}
                </button>
                {editId && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setEditId("");
                      setForm(blank);
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
      <Staff />
    </Guard>
  );
}
