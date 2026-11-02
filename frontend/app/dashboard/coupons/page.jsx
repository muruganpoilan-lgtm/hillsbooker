"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import Guard from "../../../components/dashboard/Guard";
import { api, money, prettyDate } from "../../../lib/api";

const blank = { code: "", kind: "flat", value: "", max_discount: "", min_total: "", valid_until: "", max_uses: "", per_user: "1", first_booking_only: false, user_email: "", note: "" };

function Coupons() {
  const { token, role, logout } = useAuth();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState({ text: "", bad: false });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api("/admin/coupons", { token });
    if (res.status === 401) return logout();
    if (res.ok) setRows(res.data);
    else setMsg({ text: res.error, bad: true });
  }, [token, logout]);

  useEffect(() => {
    if (role === "admin") load();
  }, [load, role]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function create(e) {
    e.preventDefault();
    setMsg({ text: "", bad: false });
    const value = Number(form.value);
    if (!form.code.trim() || !(value > 0)) return setMsg({ text: "Give the code and how much it takes off.", bad: true });
    const body = {
      code: form.code,
      kind: form.kind,
      value,
      max_discount: form.kind === "percent" && form.max_discount !== "" ? Number(form.max_discount) : null,
      min_total: form.min_total === "" ? 0 : Number(form.min_total),
      valid_until: form.valid_until || null,
      max_uses: form.max_uses === "" ? null : Number(form.max_uses),
      per_user: Number(form.per_user) || 1,
      first_booking_only: form.first_booking_only,
      user_email: form.user_email.trim() || null,
      note: form.note.trim() || null,
    };
    setBusy(true);
    const res = await api("/admin/coupons", { method: "POST", body, token });
    setBusy(false);
    if (res.status === 401) return logout();
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    setMsg({ text: `Coupon ${res.data.code} is ready.`, bad: false });
    setForm(blank);
    load();
  }

  async function toggle(c) {
    const res = await api(`/admin/coupons/${c.id}`, { method: "PATCH", body: { active: !c.active }, token });
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    load();
  }

  if (role !== "admin") return <p className="empty">Only the Hill Booker admin can open this page.</p>;
  return (
    <>
      <p className="meta"><Link href="/dashboard">← Dashboard</Link></p>
      <h1 className="section-title">Coupons</h1>
      <p className="meta">
        Hill Booker pays for every coupon out of its own commission. The guest pays less online, and the host still gets the same amount as without the coupon. Coupons work on stays, not vehicles. A coupon bigger than the commission on a booking means Hill Booker pays the difference.
      </p>

      <form className="card" style={{ padding: "1rem", display: "grid", gap: "0.8rem", margin: "1rem 0" }} onSubmit={create} noValidate>
        <h2 className="mini-title">New coupon</h2>
        <div className="dates-bar">
          <label className="field"><span>Code</span><input value={form.code} onChange={set("code")} placeholder="WELCOME300" maxLength={24} /></label>
          <label className="field">
            <span>Takes off</span>
            <select value={form.kind} onChange={set("kind")}>
              <option value="flat">A fixed amount (₹)</option>
              <option value="percent">A percent of the booking</option>
            </select>
          </label>
          <label className="field"><span>{form.kind === "percent" ? "Percent" : "Rupees"}</span><input type="number" min="1" value={form.value} onChange={set("value")} /></label>
          {form.kind === "percent" && (
            <label className="field"><span>Never more than (₹)</span><input type="number" min="1" value={form.max_discount} onChange={set("max_discount")} placeholder="No limit" /></label>
          )}
        </div>
        <div className="dates-bar">
          <label className="field"><span>Smallest booking (₹)</span><input type="number" min="0" value={form.min_total} onChange={set("min_total")} placeholder="0" /></label>
          <label className="field"><span>Last day</span><input type="date" value={form.valid_until} onChange={set("valid_until")} /></label>
          <label className="field"><span>Total uses allowed</span><input type="number" min="1" value={form.max_uses} onChange={set("max_uses")} placeholder="Unlimited" /></label>
          <label className="field"><span>Uses per guest</span><input type="number" min="1" value={form.per_user} onChange={set("per_user")} /></label>
        </div>
        <div className="dates-bar">
          <label className="field"><span>Only for this guest (email)</span><input type="email" value={form.user_email} onChange={set("user_email")} placeholder="Leave empty for everyone" /></label>
          <label className="field"><span>Your note</span><input value={form.note} onChange={set("note")} placeholder="Diwali offer" maxLength={200} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={form.first_booking_only} onChange={set("first_booking_only")} /><span>First booking only</span></label>
        <div className="actions">
          <button type="submit" className="btn btn-primary btn-small" disabled={busy}>{busy ? "Saving…" : "Create coupon"}</button>
        </div>
        {msg.text && <p className={msg.bad ? "form-error" : "ok"} role={msg.bad ? "alert" : "status"}>{msg.text}</p>}
      </form>

      {rows === null ? (
        <p className="meta">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="empty">No coupons yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.7rem" }}>
          {rows.map((c) => (
            <li key={c.id} className="card" style={{ padding: "0.9rem", opacity: c.active ? 1 : 0.6 }}>
              <p className="row-name">
                {c.code} · {c.kind === "percent" ? `${Number(c.value)}% off${c.max_discount ? ` (up to ${money(c.max_discount)})` : ""}` : `${money(c.value)} off`}
                {!c.active && " · switched off"}
              </p>
              <p className="meta">
                Used {c.used} {c.max_uses ? `of ${c.max_uses}` : "times"}
                {c.in_progress > 0 ? `, ${c.in_progress} being paid` : ""} · cost to Hill Booker so far {money(c.cost)}
              </p>
              <p className="meta">
                {Number(c.min_total) > 0 ? `Bookings from ${money(c.min_total)} · ` : ""}
                {c.valid_until ? `Until ${prettyDate(String(c.valid_until).slice(0, 10))} · ` : "No end date · "}
                {c.per_user} per guest{c.first_booking_only ? " · first booking only" : ""}
                {c.user_email ? ` · only ${c.user_email}` : ""}
                {c.note ? ` · ${c.note}` : ""}
              </p>
              <div className="actions">
                <button type="button" className="btn btn-small" onClick={() => toggle(c)}>{c.active ? "Switch off" : "Switch on"}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Guard>
      <Coupons />
    </Guard>
  );
}
