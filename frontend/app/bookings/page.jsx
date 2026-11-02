"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../components/AuthProvider";
import { api, money, nightsBetween, prettyDate } from "../../lib/api";
import { useLang } from "../../components/LangProvider";
import UpiPay from "../../components/UpiPay";
import PhoneBox from "../../components/PhoneBox";
import { payForBooking } from "../../lib/pay";

const STATUS_KEY = { held: "bk.sWaiting", confirmed: "bk.sConfirmed", cancelled: "bk.sCancelled", expired: "bk.sExpired" };

// Counts down to the end of the 10-minute hold, then asks the list to reload.
function HoldTimer({ until, onExpire }) {
  const { t } = useLang();
  const [left, setLeft] = useState(() => Math.max(0, new Date(until).getTime() - Date.now()));
  const fired = useRef(false);

  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, new Date(until).getTime() - Date.now());
      setLeft(remaining);
      // Reload the list once when the hold ends; the server then marks the booking as expired.
      if (remaining === 0 && !fired.current) {
        fired.current = true;
        onExpire();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until, onExpire]);

  const mins = Math.floor(left / 60000);
  const secs = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
  const hours = Math.floor(mins / 60);
  return <span className="scarce">{left > 0 ? (hours >= 1 ? t("bk.heldH", { h: hours, m: mins % 60 }) : t("bk.heldM", { m: mins, s: secs })) : t("bk.holdEnd")}</span>;
}

export default function BookingsPage() {
  const { ready, token, logout } = useAuth();
  const { t } = useLang();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [freshId, setFreshId] = useState("");
  const [payOn, setPayOn] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api("/payments/config").then((res) => res.ok && setPayOn(Boolean(res.data.enabled)));
  }, []);

  useEffect(() => {
    setFreshId(new URLSearchParams(window.location.search).get("new") || "");
  }, []);

  const load = useCallback(async () => {
    const res = await api("/bookings/mine", { token });
    if (res.status === 401) {
      logout();
      return;
    }
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError("");
    setRows(res.data);
  }, [token, logout]);

  useEffect(() => {
    if (!(ready && token)) return;
    load();
    const id = setInterval(load, 30000);
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [ready, token, load]);

  async function openInvoice(id) {
    setError("");
    setNotice("");
    setBusy(id);
    const res = await api(`/bookings/${id}/invoice-link`, { token });
    setBusy("");
    if (!res.ok) setError(res.error);
    else window.open(res.data.url, "_blank");
  }

  async function whatsappInvoice(id) {
    setError("");
    setNotice("");
    setBusy(id);
    const res = await api(`/bookings/${id}/invoice/whatsapp`, { token });
    setBusy("");
    if (!res.ok) return setError(res.error);
    if (!res.data.has_number) setNotice(t("bk.invWa"));
    window.open(res.data.url, "_blank");
  }

  async function act(id, action) {
    setError("");
    setNotice("");
    setBusy(id);
    const res = await api(`/bookings/${id}/${action}`, { method: "POST", token });
    setBusy("");
    if (res.status === 401) {
      logout();
      return;
    }
    if (!res.ok) setError(res.error);
    else if (action === "cancel" && res.data.refund) {
      const r = res.data.refund;
      if (r.status === "refunded") setNotice(t("bk.refunded", { amt: money(r.amount) }));
      else if (r.status === "manual") setNotice(t("bk.manual", { amt: money(r.amount) }));
      else if (r.status === "pending") setNotice(t("bk.pendingRefund"));
      else if (r.reason === "too_late") setNotice(t("bk.tooLate"));
    }
    load();
  }

  async function pay(b) {
    setError("");
    setNotice("");
    setBusy(b.id);
    const res = await payForBooking({ bookingId: b.id, token, description: `${b.property}, ${b.room_type}` });
    setBusy("");
    if (res.dismissed) return;
    if (res.status === 401) {
      logout();
      return;
    }
    if (!res.ok) setError(res.error);
    else if (res.data.status === "refunded") {
      setNotice(t("bk.lateRefund"));
    } else {
      setNotice(t("bk.paid"));
    }
    load();
  }

  if (!ready) return <main className="page" />;

  if (!token) {
    return (
      <main className="page">
        <div className="empty">
          <h2>{t("bk.loginTitle")}</h2>
          <p>
            <Link href="/login?next=/bookings">{t("bk.login")}</Link> {t("bk.or")} <Link href="/register?next=/bookings">{t("bk.create")}</Link>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <h1 className="section-title">{t("bk.title")}</h1>
      <p className="tabs">
        <b>{t("bk.stays")}</b> <Link href="/bookings/vehicles">{t("bk.vehicles")}</Link>
      </p>

      <PhoneBox token={token} />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      {rows === null && !error && <p className="empty">{t("bk.loading")}</p>}

      {rows && rows.length === 0 && (
        <div className="empty">
          <h2>{t("bk.none")}</h2>
          <p>
            <Link href="/">{t("bk.search")}</Link> {t("bk.searchTail")}
          </p>
        </div>
      )}

      {rows &&
        rows.map((b) => {
          const nights = nightsBetween(b.check_in, b.check_out);
          return (
            <article key={b.id} className={`booking${b.id === freshId ? " fresh" : ""}`}>
              <span className={`status status-${b.status}`}>{STATUS_KEY[b.status] ? t(STATUS_KEY[b.status]) : b.status}</span>
              <h2 className="booking-name">{b.property}</h2>
              <p className="meta">
                {t("bk.roomLine", { room: b.room_type, rooms: t.n("unit.room", b.rooms), adults: t.n("unit.adult", b.guests - (b.children || 0)), kids: b.children > 0 ? `, ${t.n("unit.child", b.children)}` : "", city: b.city })}
              </p>
              <p>
                {t("bk.dates", { a: prettyDate(b.check_in), b: prettyDate(b.check_out), n: t.n("unit.night", nights) })} ·{" "}
                <span className="price">{money(b.total_amount)}</span>
              </p>
              {Number(b.discount_amount) > 0 && (
                <p className="ok">{t("bk.saved", { c: b.coupon_code, amt: money(b.discount_amount) })}</p>
              )}
              {Number(b.balance_due) > 0 && (b.status === "held" || b.status === "confirmed") && (
                <p className="meta">
                  {t("bk.advance", { adv: money(b.advance_amount), bal: money(b.balance_due) })}
                </p>
              )}

              {b.status === "held" && b.hold_expires_at && (
                <>
                  <HoldTimer until={b.hold_expires_at} onExpire={load} />
                {b.upi_pending && (
                  <p className="notice" role="status">
                    {t("bk.upiSent")}
                  </p>
                )}
                  {!payOn && (
                    <p className="meta">{t("bk.payOff")}</p>
                  )}
                  <div className="booking-actions">
                    {b.upi_pending ? null : payOn ? (
                      <button type="button" className="btn btn-primary" aria-busy={busy === b.id} onClick={() => pay(b)}>
                        {busy === b.id ? t("bk.opening") : t(Number(b.balance_due) > 0 ? "bk.payNow" : "bk.pay", { amt: money(b.advance_amount) })}
                      </button>
                    ) : (
                      <button type="button" className="btn btn-primary" aria-busy={busy === b.id} onClick={() => act(b.id, "confirm")}>
                        {t("bk.testConfirm")}
                      </button>
                    )}
                    <button type="button" className="btn btn-danger" onClick={() => act(b.id, "cancel")}>
                      {t("bk.release")}
                    </button>
                  </div>
                {!b.upi_pending && b.host_upi && (
                  <UpiPay kind="stay" bookingId={b.id} token={token} amount={b.advance_amount} onDone={load} />
                )}
                </>
              )}

              {b.status === "confirmed" && (
                <div className="booking-actions">
                  <button type="button" className="btn" aria-busy={busy === b.id} onClick={() => openInvoice(b.id)}>
                    {t("bk.invoice")}
                  </button>
                  <button type="button" className="btn" aria-busy={busy === b.id} onClick={() => whatsappInvoice(b.id)}>
                    {t("bk.invoiceWa")}
                  </button>
                  {b.can_cancel && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      aria-busy={busy === b.id}
                      onClick={() => {
                        if (window.confirm(t("bk.cancelAsk"))) act(b.id, "cancel");
                      }}
                    >
                      {t("bk.cancel")}
                    </button>
                  )}
                </div>
              )}
              {b.status === "confirmed" && (
                <p className="meta">
                  {b.can_cancel
                    ? t("bk.canCancel")
                    : t("bk.cantCancel")}
                </p>
              )}
            </article>
          );
        })}
    </main>
  );
}
