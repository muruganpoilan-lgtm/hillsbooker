"use client";

import { useState } from "react";
import Link from "next/link";
import { addDays, api, money, prettyDate, todayISO } from "../lib/api";
import { useLang } from "./LangProvider";

const PLACES = ["Ooty", "Coonoor", "Kotagiri", "Munnar", "Kodaikanal", "Valparai", "Coorg", "Wayanad", "Yercaud", "Thekkady", "Alleppey"];
const BUDGETS = ["low", "mid", "high", "any"];
const INTERESTS = ["nature", "family", "couple", "adventure", "quiet"];

// The four steps across the top of a finished plan, like a travel assistant card.
function Steps({ plan, t }) {
  const steps = [
    { done: true, title: t("trip.step1"), sub: t("trip.step1s", { n: t.n("unit.night", plan.nights), city: plan.city }) },
    { done: plan.stays.length > 0, title: t("trip.step2"), sub: plan.stays.length ? t("trip.step2s", { n: plan.stays.length }) : t("trip.step2none") },
    { done: plan.cabs.length > 0, title: t("trip.step3"), sub: plan.cabs.length ? t("trip.step3s", { n: plan.cabs.length }) : t("trip.step3none") },
    { done: false, title: t("trip.step4"), sub: t("trip.step4s") },
  ];
  return (
    <ol className="trip-steps">
      {steps.map((s, i) => (
        <li key={i} className={s.done ? "done" : ""}>
          <span className="trip-dot" aria-hidden="true">{s.done ? "✓" : i + 1}</span>
          <div>
            <b>{s.title}</b>
            <p className="meta">{s.sub}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function PlanTrip() {
  const { t } = useLang();
  const earliest = addDays(todayISO(), 2);
  const [f, setF] = useState({ city: "", from_city: "", check_in: addDays(todayISO(), 7), check_out: addDays(todayISO(), 9), adults: 2, children: 0, budget: "mid", cab: true });
  const [interests, setInterests] = useState([]);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [send, setSend] = useState({ name: "", phone: "+91 ", notes: "", stay_name: "", website: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendErr, setSendErr] = useState("");

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setF((old) => {
      const next = { ...old, [k]: v };
      if (k === "check_in" && next.check_out <= v) next.check_out = addDays(v, 2);
      return next;
    });
    setError("");
  };
  const toggle = (i) => setInterests((old) => (old.includes(i) ? old.filter((x) => x !== i) : [...old, i]));

  async function makePlan(e) {
    e.preventDefault();
    if (f.check_out <= f.check_in) return setError(t("trip.errDates"));
    setBusy(true);
    setError("");
    setSent(false);
    const q = new URLSearchParams({
      check_in: f.check_in,
      check_out: f.check_out,
      city: f.city,
      adults: String(f.adults),
      children: String(f.children),
      budget: f.budget,
      cab: f.cab ? "true" : "false",
      from_city: f.from_city.trim(),
    });
    interests.forEach((i) => q.append("interest", i));
    const res = await api(`/trips/plan?${q.toString()}`);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setPlan(res.data);
    setSend((s) => ({ ...s, stay_name: res.data.stays[0]?.name || "" }));
    setTimeout(() => document.getElementById("trip-result")?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  const setPhone = (e) => {
    const raw = e.target.value;
    let d = raw.replace(/\D/g, "");
    if (raw.startsWith("+91") || (d.startsWith("91") && d.length > 10)) d = d.replace(/^91/, "");
    d = d.replace(/^0+/, "").slice(0, 10);
    setSend({ ...send, phone: `+91 ${d}` });
    setSendErr("");
  };

  async function sendPlan(e) {
    e.preventDefault();
    if (send.phone.replace(/\D/g, "").length !== 12) return setSendErr(t("trip.errPhone"));
    setSending(true);
    const res = await api("/trips/request", {
      method: "POST",
      body: {
        name: send.name,
        phone: send.phone,
        city: plan.city,
        check_in: f.check_in,
        check_out: f.check_out,
        adults: Number(f.adults),
        children: Number(f.children),
        budget: f.budget,
        cab: f.cab,
        from_city: f.from_city.trim() || null,
        interests,
        stay_name: send.stay_name || null,
        notes: send.notes || null,
        website: send.website,
      },
    });
    setSending(false);
    if (!res.ok) return setSendErr(res.error);
    setSent(true);
  }

  const roomLink = (s) => {
    const q = new URLSearchParams({ check_in: f.check_in, check_out: f.check_out, guests: String(Number(f.adults) + Number(f.children)) });
    if (Number(f.children) > 0) q.set("children", String(f.children));
    if (plan.rooms > 1) q.set("rooms", String(plan.rooms));
    return `/properties/${s.id}?${q.toString()}`;
  };

  return (
    <>
      <form className="trip-form" onSubmit={makePlan}>
        <div className="trip-grid">
          <label className="field">
            <span>{t("trip.where")}</span>
            <select value={f.city} onChange={set("city")}>
              <option value="">{t("trip.suggest")}</option>
              {PLACES.map((p) => (
                <option key={p} value={p}>
                  {t(`city.${p}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("trip.from")}</span>
            <input value={f.from_city} onChange={set("from_city")} placeholder={t("trip.fromHint")} maxLength={60} />
          </label>
          <label className="field">
            <span>{t("trip.checkIn")}</span>
            <input type="date" min={earliest} value={f.check_in} onChange={set("check_in")} required />
          </label>
          <label className="field">
            <span>{t("trip.checkOut")}</span>
            <input type="date" min={addDays(f.check_in, 1)} max={addDays(f.check_in, 14)} value={f.check_out} onChange={set("check_out")} required />
          </label>
          <label className="field">
            <span>{t("trip.adults")}</span>
            <input type="number" min={1} max={30} value={f.adults} onChange={set("adults")} required />
          </label>
          <label className="field">
            <span>{t("trip.children")}</span>
            <input type="number" min={0} max={20} value={f.children} onChange={set("children")} />
          </label>
        </div>

        <p className="field-label">{t("trip.budget")}</p>
        <div className="chips">
          {BUDGETS.map((b) => (
            <label key={b} className={`chip${f.budget === b ? " on" : ""}`}>
              <input type="radio" name="budget" value={b} checked={f.budget === b} onChange={set("budget")} />
              {t(`trip.b.${b}`)}
            </label>
          ))}
        </div>

        <p className="field-label">{t("trip.likes")}</p>
        <div className="chips">
          {INTERESTS.map((i) => (
            <label key={i} className={`chip${interests.includes(i) ? " on" : ""}`}>
              <input type="checkbox" checked={interests.includes(i)} onChange={() => toggle(i)} />
              {t(`trip.i.${i}`)}
            </label>
          ))}
        </div>

        <label className="check">
          <input type="checkbox" checked={f.cab} onChange={set("cab")} />
          {t("trip.cab")}
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary trip-go" aria-busy={busy} disabled={busy}>
          {busy ? t("trip.planning") : t("trip.go")}
        </button>
      </form>

      {plan && (
        <section id="trip-result" className="trip-result" aria-live="polite">
          <div className="trip-card">
            <div className="trip-card-head">
              <span className="trip-icon" aria-hidden="true">✈</span>
              <div>
                <h2>{t("trip.title", { n: t.n("unit.night", plan.nights), city: t(`city.${plan.city}`) === `city.${plan.city}` ? plan.city : t(`city.${plan.city}`) })}</h2>
                <p className="meta">
                  {prettyDate(f.check_in)} – {prettyDate(f.check_out)} · {t.n("unit.adult", Number(f.adults))}
                  {Number(f.children) > 0 ? `, ${t.n("unit.child", Number(f.children))}` : ""}
                </p>
              </div>
            </div>
            <Steps plan={plan} t={t} />
          </div>

          {plan.suggested && (
            <p className="notice">
              {t("trip.picked", { city: plan.city })}
              {plan.alternatives.length > 0 ? ` ${t("trip.alsoGood", { list: plan.alternatives.join(", ") })}` : ""}
            </p>
          )}
          {plan.too_soon && <p className="notice">{t("trip.tooSoon", { d: prettyDate(String(plan.earliest)) })}</p>}
          {plan.over_budget && <p className="notice">{t("trip.overBudget")}</p>}

          <h3 className="trip-h">{t("trip.stays")}</h3>
          {plan.stays.length === 0 ? (
            <p className="meta">{t("trip.noStays")}</p>
          ) : (
            <div className="trip-list">
              {plan.stays.map((s) => (
                <Link key={s.id} href={roomLink(s)} className="trip-item">
                  <img src={s.photo || `/cities/${plan.city.toLowerCase()}.jpg`} alt="" loading="lazy" />
                  <div>
                    <b>{s.name}</b>
                    <p className="meta">
                      {t(`type.${s.type}`)}
                      {s.rating_count > 0 ? ` · ★ ${Number(s.rating_avg).toFixed(1)}` : ""}
                    </p>
                    <p>
                      <span className="price">{money(s.stay_total)}</span>{" "}
                      <span className="meta">{t("trip.forStay", { rooms: t.n("unit.room", plan.rooms), n: t.n("unit.night", plan.nights) })}</span>
                    </p>
                    <u>{t("trip.bookStay")}</u>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {f.cab && (
            <>
              <h3 className="trip-h">{t("trip.cabs")}</h3>
              {plan.cabs.length === 0 ? (
                <p className="meta">{t("trip.noCabs")}</p>
              ) : (
                <div className="trip-list">
                  {plan.cabs.map((v) => (
                    <Link key={v.id} href={`/vehicles/${v.id}`} className="trip-item">
                      <img src={v.photo || `/cities/${plan.city.toLowerCase()}.jpg`} alt="" loading="lazy" />
                      <div>
                        <b>{v.name}</b>
                        <p className="meta">
                          {t("trip.seats", { n: v.seats })}
                          {v.ac ? " · AC" : ""}
                        </p>
                        <p>
                          <span className="price">{money(v.price_per_day)}</span> <span className="meta">{t("trip.perDay")}</span>
                        </p>
                        <u>{t("trip.bookCab")}</u>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}

          <h3 className="trip-h">{t("trip.days")}</h3>
          <ol className="trip-days">
            {plan.days.map((d) => (
              <li key={d.day}>
                <b>{t("trip.dayN", { n: d.day, date: prettyDate(addDays(f.check_in, d.day - 1)) })}</b>
                <ul>
                  {d.items.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>

          {plan.estimate.total && (
            <div className="trip-cost">
              <h3 className="trip-h">{t("trip.cost")}</h3>
              {plan.estimate.stay && (
                <p>
                  {t("trip.costStay")} <b>{money(plan.estimate.stay)}</b>
                </p>
              )}
              {plan.estimate.cab && (
                <p>
                  {t("trip.costCab", { n: t.n("unit.day", plan.nights + 1) })} <b>{money(plan.estimate.cab)}</b>
                </p>
              )}
              <p className="trip-total">
                {t("trip.costTotal")} <b>{money(plan.estimate.total)}</b>
              </p>
              <p className="meta">{t("trip.costNote")}</p>
            </div>
          )}

          {plan.packages.length > 0 && (
            <>
              <h3 className="trip-h">{t("trip.packages")}</h3>
              <ul className="trip-pk">
                {plan.packages.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/packages/${p.slug}`}>{p.title}</Link>
                    {p.price_per_person ? <span className="meta"> · {t("trip.perPerson", { amt: money(p.price_per_person) })}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="trip-send">
            <h3 className="trip-h">{t("trip.sendTitle")}</h3>
            {sent ? (
              <p className="ok" role="status">
                {t("trip.sent", { phone: send.phone })}
              </p>
            ) : (
              <form onSubmit={sendPlan} className="trip-send-form">
                <p className="meta">{t("trip.sendText")}</p>
                <label className="field">
                  <span>{t("trip.name")}</span>
                  <input value={send.name} onChange={(e) => setSend({ ...send, name: e.target.value })} required minLength={2} maxLength={80} autoComplete="name" />
                </label>
                <label className="field">
                  <span>{t("trip.phone")}</span>
                  <input type="tel" inputMode="tel" value={send.phone} onChange={setPhone} required maxLength={14} autoComplete="tel" />
                </label>
                <label className="field">
                  <span>{t("trip.notes")}</span>
                  <textarea rows={3} value={send.notes} onChange={(e) => setSend({ ...send, notes: e.target.value })} maxLength={1000} placeholder={t("trip.notesHint")} />
                </label>
                <input type="text" name="website" value={send.website} onChange={(e) => setSend({ ...send, website: e.target.value })} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, width: 0, opacity: 0 }} />
                {sendErr && (
                  <p className="form-error" role="alert">
                    {sendErr}
                  </p>
                )}
                <button type="submit" className="btn btn-primary" aria-busy={sending} disabled={sending}>
                  {sending ? t("trip.sending") : t("trip.send")}
                </button>
              </form>
            )}
          </div>
        </section>
      )}
    </>
  );
}
