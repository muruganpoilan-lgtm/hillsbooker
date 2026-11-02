"use client";

import { useState } from "react";
import { api, todayISO } from "../lib/api";
import { useLang } from "./LangProvider";

// The enquiry form on a package page. It lands in the same enquiries list as group tours; the team calls back with a quote.
export default function PackageEnquiry({ slug, minPeople = 2 }) {
  const { t } = useLang();
  const [f, setF] = useState({ name: "", phone: "", start_date: "", people: String(minPeople), notes: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const set = (k) => (e) => {
    setF({ ...f, [k]: e.target.value });
    setError("");
  };

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (f.name.trim().length < 2 || f.phone.replace(/\D/g, "").length < 7) return setError(t("pkg.errNamePhone"));
    setBusy(true);
    const body = { name: f.name.trim(), phone: f.phone, start_date: f.start_date || null, people: f.people ? Number(f.people) : null, notes: f.notes.trim() || null, website: f.website };
    const res = await api(`/packages/${encodeURIComponent(slug)}/enquiry`, { method: "POST", body });
    setBusy(false);
    if (!res.ok) return setError(res.error || t("pkg.errSend"));
    setDone(true);
  }

  if (done)
    return (
      <div className="card" style={{ padding: "1rem" }}>
        <h3 className="mini-title">{t("pkg.thanks")}</h3>
        <p>{t("pkg.thanksText", { phone: f.phone })}</p>
        <p>
          {t("pkg.hurry")} <a href="tel:+918300841442">+91 83008 41442</a>.
        </p>
      </div>
    );

  return (
    <form className="card" style={{ padding: "1rem", display: "grid", gap: "0.8rem" }} onSubmit={submit} noValidate>
      <h3 className="mini-title">{t("pkg.askTitle")}</h3>
      <label className="field">
        <span>{t("pkg.name")}</span>
        <input value={f.name} onChange={set("name")} maxLength={80} autoComplete="name" />
      </label>
      <label className="field">
        <span>{t("pkg.phone")}</span>
        <input type="tel" value={f.phone} onChange={set("phone")} maxLength={20} autoComplete="tel" placeholder="98765 43210" />
      </label>
      <div className="dates-bar">
        <label className="field">
          <span>{t("pkg.date")}</span>
          <input type="date" value={f.start_date} min={todayISO()} onChange={set("start_date")} />
        </label>
        <label className="field">
          <span>{t("pkg.people")}</span>
          <input type="number" min="1" max="500" value={f.people} onChange={set("people")} />
        </label>
      </div>
      <label className="field">
        <span>{t("pkg.notes")}</span>
        <input value={f.notes} onChange={set("notes")} maxLength={1000} />
      </label>
      {/* Hidden from people; form-filling bots fill it and are ignored. */}
      <input type="text" name="website" value={f.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="btn btn-primary" aria-busy={busy}>
          {busy ? t("pkg.sending") : t("pkg.send")}
        </button>
      </div>
    </form>
  );
}
