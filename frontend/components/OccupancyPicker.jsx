"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "./LangProvider";
import { MAX_ADULTS, MAX_CHILDREN, MAX_ROOMS, occupancyLabel } from "../lib/occupancy";

// Booking.com-style guest picker: one button ("2 adults · 2 children · 1 room") that opens a panel with
// Adults / Children / Rooms counters and an age dropdown for each child.
// value = { adults, ages: [childAge, ...], rooms }; onChange gets a new value of the same shape.
export default function OccupancyPicker({ value, onChange, label }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const { adults, ages, rooms } = value;

  // Close on a click outside the panel or on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => boxRef.current && !boxRef.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const set = (patch) => onChange({ adults, ages, rooms, ...patch });
  const setChildren = (n) => set({ ages: n > ages.length ? [...ages, ...Array(n - ages.length).fill(-1)] : ages.slice(0, n) });
  const setAge = (i, v) => set({ ages: ages.map((a, j) => (j === i ? Number(v) : a)) });
  const missingAge = ages.some((a) => a < 0);

  const ageText = (a) => (a === 0 ? t("occ.under1") : t.n("occ.yearsOld", a));

  return (
    <div className="field occ" ref={boxRef}>
      <span>{label || t("occ.label")}</span>
      <button
        type="button"
        className="occ-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
        </svg>
        <span className="occ-text">{occupancyLabel(t, value)}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="occ-panel" role="dialog" aria-label={t("occ.label")}>
          <Stepper label={t("occ.adults")} value={adults} min={1} max={MAX_ADULTS} onChange={(n) => set({ adults: n })} t={t} />
          <Stepper label={t("occ.children")} value={ages.length} min={0} max={MAX_CHILDREN} onChange={setChildren} t={t} />

          {ages.length > 0 && (
            <>
              <div className="occ-ages">
                {ages.map((a, i) => (
                  <label key={i} className="occ-age">
                    <span className="sr-only">{t("occ.ageOf", { n: i + 1 })}</span>
                    <select value={a} onChange={(e) => setAge(i, e.target.value)} className={a < 0 ? "need" : ""}>
                      <option value={-1} disabled>
                        {t("occ.agePick")}
                      </option>
                      {Array.from({ length: 18 }, (_, n) => (
                        <option key={n} value={n}>
                          {ageText(n)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <p className="occ-note">{t("occ.ageNote")}</p>
            </>
          )}

          <Stepper label={t("occ.rooms")} value={rooms} min={1} max={MAX_ROOMS} onChange={(n) => set({ rooms: n })} t={t} />

          {missingAge && (
            <p className="form-error" role="alert">
              {t("occ.ageMissing")}
            </p>
          )}
          <button type="button" className="btn occ-done" disabled={missingAge} onClick={() => setOpen(false)}>
            {t("occ.done")}
          </button>
        </div>
      )}
    </div>
  );
}

function Stepper({ label, value, min, max, onChange, t }) {
  return (
    <div className="occ-row">
      <span className="occ-name">{label}</span>
      <div className="occ-step">
        <button type="button" aria-label={t("occ.less", { what: label })} disabled={value <= min} onClick={() => onChange(value - 1)}>
          −
        </button>
        <output aria-live="polite">{value}</output>
        <button type="button" aria-label={t("occ.more", { what: label })} disabled={value >= max} onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  );
}
