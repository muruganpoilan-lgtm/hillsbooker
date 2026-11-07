"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "./LangProvider";
import { addDays, nightsBetween, todayISO } from "../lib/api";
import OccupancyPicker from "./OccupancyPicker";
import PropertyNameSearch from "./PropertyNameSearch";
import { agesComplete, readOccupancy, writeOccupancy } from "../lib/occupancy";

// The booking slip: city, two dates, guests. Used big on the home page and compact above search results.
export default function SearchForm({ initial = {}, compact = false }) {
  const router = useRouter();
  const { t } = useLang();
  const [city, setCity] = useState(initial.city || "");
  const [checkIn, setCheckIn] = useState(initial.check_in || "");
  const [checkOut, setCheckOut] = useState(initial.check_out || "");
  const [occ, setOcc] = useState(() => readOccupancy(initial));
  const [error, setError] = useState("");
  const [today, setToday] = useState("");

  // Default to two days from now for one night (stays can't start today or tomorrow). Done after load so the server and browser always agree on first paint.
  useEffect(() => {
    const t = todayISO();
    setToday(t);
    setCheckIn((v) => v || addDays(t, 2));
    setCheckOut((v) => v || addDays(t, 3));
  }, []);

  function onCheckIn(value) {
    setCheckIn(value);
    if (value && (!checkOut || checkOut <= value)) setCheckOut(addDays(value, 1));
  }

  // Check the dates and ages, then give the query string for them (or null after showing an error).
  function stayParams() {
    if (!checkIn || !checkOut) {
      setError(t("form.errDates"));
      return null;
    }
    if (checkOut <= checkIn) {
      setError(t("form.errOrder"));
      return null;
    }
    if (!agesComplete(occ.ages)) {
      setError(t("occ.ageMissing"));
      return null;
    }
    setError("");
    return writeOccupancy(new URLSearchParams({ check_in: checkIn, check_out: checkOut }), occ);
  }

  function onSubmit(e) {
    e.preventDefault();
    const params = stayParams();
    if (!params) return;
    if (city.trim()) params.set("city", city.trim());
    router.push(`/search?${params.toString()}`);
  }

  function pickProperty(p) {
    const params = stayParams();
    if (params) router.push(`/properties/${p.id}?${params.toString()}`);
  }

  function searchByName(name) {
    const params = stayParams();
    if (!params) return;
    params.set("name", name);
    router.push(`/search?${params.toString()}`);
  }

  const nights = checkIn && checkOut && checkOut > checkIn ? nightsBetween(checkIn, checkOut) : 0;

  return (
    <form className={`slip${compact ? " compact" : ""}`} onSubmit={onSubmit} noValidate>
      <div className="slip-grid">
        <label className="field">
          <span>{t("form.city")}</span>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t("form.cityPlaceholder")}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>{t("form.checkIn")}</span>
          <input type="date" value={checkIn} min={today || undefined} onChange={(e) => onCheckIn(e.target.value)} />
        </label>
        <label className="field">
          <span>{t("form.checkOut")}</span>
          <input
            type="date"
            value={checkOut}
            min={checkIn || today || undefined}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </label>
        <OccupancyPicker value={occ} onChange={setOcc} />
        <button type="submit" className="btn btn-primary">
          {t("form.search")}
        </button>
      </div>
      <PropertyNameSearch initial={initial.name || ""} onPick={pickProperty} onSearch={searchByName} />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="slip-note">{nights ? t("form.note", { nights: t.n("unit.night", nights) }) : t("form.noteEmpty")}</p>
      )}
    </form>
  );
}
