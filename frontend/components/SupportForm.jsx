"use client";

import { useState } from "react";
import { api } from "../lib/api";
import { useLang } from "./LangProvider";

const TOPICS = ["booking", "payment", "cancellation", "vehicle", "host", "app", "other"];

// The customer-care form at /support. It creates a ticket the team reads in the dashboard and calls back.
export default function SupportForm() {
  const { t } = useLang();
  const [f, setF] = useState({ name: "", phone: "+91 ", email: "", topic: "booking", booking_ref: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState(null);
  const set = (k) => (e) => {
    setF({ ...f, [k]: e.target.value });
    setError("");
  };
  // The phone box always starts with +91. People type or paste the 10-digit number (with or without 91 or 0 in front).
  const setPhone = (e) => {
    const raw = e.target.value;
    let d = raw.replace(/\D/g, "");
    if (raw.startsWith("+91") || (d.startsWith("91") && d.length > 10)) d = d.replace(/^91/, "");
    d = d.replace(/^0+/, "").slice(0, 10);
    setF({ ...f, phone: `+91 ${d}` });
    setError("");
  };

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (f.name.trim().length < 2) return setError(t("sup.errName"));
    if (f.phone.replace(/\D/g, "").length !== 12) return setError(t("sup.errPhone"));
    if (f.message.trim().length < 5) return setError(t("sup.errMessage"));
    setBusy(true);
    const body = { name: f.name.trim(), phone: f.phone, email: f.email.trim() || null, topic: f.topic, booking_ref: f.booking_ref.trim() || null, message: f.message.trim(), website: f.website };
    const res = await api("/support", { method: "POST", body });
    setBusy(false);
    if (!res.ok) return setError(res.error || t("sup.errSend"));
    setTicket(res.data.ticket_no || 0);
  }

  if (ticket !== null)
    return (
      <div className="prose">
        <h1 className="section-title">{t("sup.thanks")}</h1>
        <p>{t("sup.thanksText", { phone: f.phone })}</p>
        {ticket > 0 && (
          <p>
            <b>{t("sup.ref", { n: ticket })}</b>
          </p>
        )}
        <p>
          {t("sup.hurry")} <a href="tel:+918300841442">+91 83008 41442</a>.
        </p>
      </div>
    );

  return (
    <div className="narrow">
      <h1 className="section-title">{t("sup.title")}</h1>
      <p className="meta">{t("sup.intro")}</p>
      <form className="card" style={{ padding: "1rem", display: "grid", gap: "0.8rem", marginTop: "0.8rem" }} onSubmit={submit} noValidate>
        <label className="field">
          <span>{t("sup.topic")}</span>
          <select value={f.topic} onChange={set("topic")}>
            {TOPICS.map((k) => (
              <option key={k} value={k}>
                {t(`sup.t.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("sup.name")}</span>
          <input value={f.name} onChange={set("name")} maxLength={80} autoComplete="name" />
        </label>
        <label className="field">
          <span>{t("sup.phone")}</span>
          <input type="tel" inputMode="tel" value={f.phone} onChange={setPhone} maxLength={14} autoComplete="tel" />
        </label>
        <label className="field">
          <span>{t("sup.email")}</span>
          <input type="email" value={f.email} onChange={set("email")} maxLength={120} autoComplete="email" />
        </label>
        <label className="field">
          <span>{t("sup.ref.label")}</span>
          <input value={f.booking_ref} onChange={set("booking_ref")} maxLength={40} placeholder={t("sup.ref.hint")} />
        </label>
        <label className="field">
          <span>{t("sup.message")}</span>
          <textarea rows={5} value={f.message} onChange={set("message")} maxLength={2000} />
        </label>
        {/* Hidden from people; form-filling bots fill it and are ignored. */}
        <input type="text" name="website" value={f.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="btn btn-primary" aria-busy={busy} disabled={busy}>
            {busy ? t("sup.sending") : t("sup.send")}
          </button>
        </div>
      </form>
    </div>
  );
}
