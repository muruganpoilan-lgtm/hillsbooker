"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import Ridge from "./Ridge";
import { useLang } from "./LangProvider";
import { addDays, advanceFor, api, money, prettyDate, todayISO } from "../lib/api";

export default function RoomList({ rooms, checkIn: ci, checkOut: co, guests: g, children: kids = 0, nights, advancePercent = 100, tooSoon = false, earliest = "" }) {
  const { t } = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const { token, logout } = useAuth();

  const [checkIn, setCheckIn] = useState(ci);
  const [checkOut, setCheckOut] = useState(co);
  const [children, setChildren] = useState(String(kids));
  const [adults, setAdults] = useState(String(Math.max(1, g - kids)));
  const [qty, setQty] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [today, setToday] = useState("");
  const [couponText, setCouponText] = useState("");
  const [applied, setApplied] = useState("");
  const [couponMsg, setCouponMsg] = useState("");
  const [preview, setPreview] = useState({});
  const [mine, setMine] = useState([]);

  // Coupons made for this guest (welcome and thank-you coupons), so they can tap one instead of typing it.
  useEffect(() => {
    if (!token) return setMine([]);
    let live = true;
    api("/coupons/mine", { token }).then((res) => live && res.ok && setMine(res.data.slice(0, 4)));
    return () => {
      live = false;
    };
  }, [token]);

  // Set after load so the server and the browser agree on first paint, whatever their time zones.
  useEffect(() => setToday(todayISO()), []);

  const hasDates = Boolean(ci && co);
  const here = `${pathname}?${new URLSearchParams({ check_in: ci, check_out: co, guests: String(g), children: String(kids) }).toString()}`;

  // With a coupon applied, ask the server what it saves on each room that can be booked, and keep that up to date
  // when the number of rooms changes. The booking itself checks the coupon again.
  const bookableKey = rooms.filter((r) => r.bookable).map((r) => `${r.id}:${qty[r.id] || 1}`).join(",");
  useEffect(() => {
    if (!applied || !token || !hasDates) {
      setPreview({});
      return;
    }
    let live = true;
    (async () => {
      const out = {};
      let firstError = "";
      for (const r of rooms.filter((x) => x.bookable)) {
        const res = await api("/coupons/check", {
          method: "POST",
          token,
          body: { code: applied, room_type_id: r.id, check_in: ci, check_out: co, rooms: Number(qty[r.id] || 1) },
        });
        if (res.ok) out[r.id] = res.data;
        else if (!firstError) firstError = res.error;
      }
      if (!live) return;
      setPreview(out);
      setCouponMsg(Object.keys(out).length ? "" : firstError || t("room.cpNone"));
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, token, hasDates, ci, co, bookableKey]);

  function applyCoupon(e) {
    e.preventDefault();
    const code = couponText.replace(/\s+/g, "").toUpperCase();
    if (!code) return setCouponMsg(t("room.cpType"));
    if (!token) return goToLogin();
    setCouponMsg("");
    setApplied(code);
  }

  function removeCoupon() {
    setApplied("");
    setCouponText("");
    setCouponMsg("");
    setPreview({});
  }

  function updateDates(e) {
    e.preventDefault();
    if (!checkIn || !checkOut || checkOut <= checkIn) {
      setError(t("room.errOut"));
      return;
    }
    if (earliest && checkIn < earliest) {
      setError(t("room.errEarly", { d: prettyDate(checkIn), e: prettyDate(earliest) }));
      return;
    }
    setError("");
    router.replace(`${pathname}?${new URLSearchParams({ check_in: checkIn, check_out: checkOut, guests: String(Number(adults) + Number(children)), children }).toString()}`);
  }

  function goToLogin() {
    router.push(`/login?next=${encodeURIComponent(here)}`);
  }

  async function book(room) {
    setError("");
    if (!token) {
      goToLogin();
      return;
    }
    setBusy(room.id);
    const res = await api("/bookings", {
      method: "POST",
      token,
      body: { room_type_id: room.id, check_in: ci, check_out: co, rooms: Number(qty[room.id] || 1), guests: Number(g), children: Number(kids), coupon_code: applied || undefined },
    });
    setBusy("");
    if (res.status === 401) {
      logout();
      goToLogin();
      return;
    }
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/pay?kind=stay&id=${res.data.booking_id}`);
  }

  return (
    <div>
      <form className="dates-bar" onSubmit={updateDates} noValidate>
        <label className="field">
          <span>{t("room.checkin")}</span>
          <input type="date" value={checkIn} min={earliest || today || undefined} onChange={(e) => setCheckIn(e.target.value)} />
        </label>
        <label className="field">
          <span>{t("room.checkout")}</span>
          <input type="date" value={checkOut} min={checkIn || today || undefined} onChange={(e) => setCheckOut(e.target.value)} />
        </label>
        <label className="field">
          <span>{t("room.adults")}</span>
          <select value={adults} onChange={(e) => setAdults(e.target.value)}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("room.children")}</span>
          <select value={children} onChange={(e) => setChildren(e.target.value)}>
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-small">
          {hasDates ? t("room.update") : t("room.check")}
        </button>
      </form>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {tooSoon && hasDates && (
        <p className="form-error" role="alert">
          {t("room.tooSoon", { d: prettyDate(ci), e: prettyDate(earliest) })}{" "}
          <button type="button" className="link-btn" onClick={() => router.replace(`${pathname}?${new URLSearchParams({ check_in: earliest, check_out: co > earliest ? co : addDays(earliest, 1), guests: String(g), children: String(kids) }).toString()}`)}>
            {t("room.useDate", { e: prettyDate(earliest) })}
          </button>
        </p>
      )}

      {hasDates && rooms.some((r) => r.bookable) && (
        <form className="coupon-box" onSubmit={applyCoupon} noValidate>
          {applied && Object.keys(preview).length > 0 ? (
            <p className="ok">
              {t("room.cpApplied", { c: applied })}{" "}
              <button type="button" className="link-btn" onClick={removeCoupon}>{t("room.remove")}</button>
            </p>
          ) : (
            <>
              <label className="field">
                <span>{t("room.cpLabel")}</span>
                <input value={couponText} onChange={(e) => setCouponText(e.target.value)} placeholder={t("room.cpHolder")} maxLength={40} autoCapitalize="characters" />
              </label>
              <button type="submit" className="btn btn-small">{t("room.apply")}</button>
              {mine.length > 0 && (
                <p className="meta">
                  {t("room.yourCoupons")}{" "}
                  {mine.map((c) => (
                    <button key={c.code} type="button" className="chip-btn" onClick={() => { setCouponText(c.code); setCouponMsg(""); setApplied(c.code); }}>
                      {t("room.off", { c: c.code, v: money(c.value) })}
                    </button>
                  ))}
                </p>
              )}
            </>
          )}
          {couponMsg && <p className="form-error" role="alert">{couponMsg}</p>}
        </form>
      )}

      {rooms.length === 0 && <p className="empty">{t("room.empty")}</p>}

      {rooms.map((room) => {
        const bookable = hasDates && room.bookable;
        const left = room.rooms_left || 0;
        return (
          <article className="room" key={room.id}>
            {room.photos && room.photos[0] ? (
              <img className="thumb" src={room.photos[0]} alt="" loading="lazy" />
            ) : (
              <div className="thumb"><Ridge seed={room.id} /></div>
            )}
            <div>
              <h3 className="room-name">{room.name}</h3>
              <p className="meta">{t("room.sleeps", { n: room.max_guests })}</p>
              <p>
                <span className="price">{money(room.base_price)}</span> <span className="meta">{t("room.aNight")}</span>
              </p>
              {bookable && (
                <p className="meta">
                  {t("room.forNights", { total: money(room.stay_total), nights: t.n("unit.night", nights) })}
                  {Number(qty[room.id] || 1) > 1 ? ` ${t("room.perRoom")}` : ""}
                </p>
              )}
              {bookable && advancePercent < 100 && (() => {
                const total = Number(room.stay_total) * Number(qty[room.id] || 1);
                const adv = advanceFor(total, advancePercent);
                return (
                  <p className="meta">
                    {t("room.payNow", { adv: money(adv), pct: advancePercent, rest: money(total - adv) })}
                  </p>
                );
              })()}
              {bookable && preview[room.id] && (
                <p className="ok">
                  {t("room.cpSave", { c: preview[room.id].code, d: money(preview[room.id].discount), now: money(preview[room.id].pay_now), before: money(preview[room.id].pay_now_before) })}
                </p>
              )}
              {bookable && left <= 2 && <p className="scarce">{t("room.left", { n: left })}</p>}
              {hasDates && !bookable && (
                <p className="unavailable">
                  {tooSoon ? t("room.soon", { e: prettyDate(earliest) }) : t("room.notFree")}
                </p>
              )}
              {!hasDates && <p className="unavailable">{t("room.pickDates")}</p>}
            </div>
            {bookable && (
              <div className="room-actions">
                {left > 1 && (
                  <label className="field">
                    <span>{t("room.rooms")}</span>
                    <select value={qty[room.id] || "1"} onChange={(e) => setQty({ ...qty, [room.id]: e.target.value })}>
                      {Array.from({ length: Math.min(left, 5) }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button type="button" className="btn btn-primary" onClick={() => book(room)} aria-busy={busy === room.id}>
                  {busy === room.id ? t("room.holding") : token ? t("room.reserve") : t("room.login")}
                </button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
