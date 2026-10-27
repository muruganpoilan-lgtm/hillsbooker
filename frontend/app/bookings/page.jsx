"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../components/AuthProvider";
import { api, money, nightsBetween, plural, prettyDate } from "../../lib/api";
import UpiPay from "../../components/UpiPay";
import PhoneBox from "../../components/PhoneBox";
import { payForBooking } from "../../lib/pay";

const STATUS_LABEL = { held: "Waiting for payment", confirmed: "Confirmed", cancelled: "Cancelled", expired: "Hold expired" };

// Counts down to the end of the 10-minute hold, then asks the list to reload.
function HoldTimer({ until, onExpire }) {
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
  return <span className="scarce">{left > 0 ? (hours >= 1 ? `Room held for ${hours}h ${mins % 60}m` : `Room held for ${mins}:${secs}`) : "Hold ended"}</span>;
}

export default function BookingsPage() {
  const { ready, token, logout } = useAuth();
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
    if (!res.data.has_number) setNotice("Add your phone number to your account to send it straight to your own WhatsApp. For now, choose who to send it to.");
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
      if (r.status === "refunded") setNotice(`Cancelled. ${money(r.amount)} is being refunded to your original payment method. It usually takes 5 to 7 working days.`);
      else if (r.status === "manual") setNotice(`Cancelled. You paid the host directly, so the host will return ${money(r.amount)} to you. Contact them if you do not receive it.`);
      else if (r.status === "pending") setNotice("Cancelled. Your refund couldn't be sent automatically. We'll process it by hand and email you.");
      else if (r.reason === "too_late") setNotice("Cancelled. This was inside the no-refund window, so no money is returned.");
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
      setNotice("Your payment arrived after the room was released, and the room was gone. Your money is being refunded in full.");
    } else {
      setNotice("Payment received. Your booking is confirmed.");
    }
    load();
  }

  if (!ready) return <main className="page" />;

  if (!token) {
    return (
      <main className="page">
        <div className="empty">
          <h2>Log in to see your bookings</h2>
          <p>
            <Link href="/login?next=/bookings">Log in</Link> or <Link href="/register?next=/bookings">create an account</Link>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <h1 className="section-title">My bookings</h1>
      <p className="tabs">
        <b>Stays</b> <Link href="/bookings/vehicles">Vehicles</Link>
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

      {rows === null && !error && <p className="empty">Loading your bookings…</p>}

      {rows && rows.length === 0 && (
        <div className="empty">
          <h2>No bookings yet</h2>
          <p>
            <Link href="/">Search for a room</Link> and reserve it here.
          </p>
        </div>
      )}

      {rows &&
        rows.map((b) => {
          const nights = nightsBetween(b.check_in, b.check_out);
          return (
            <article key={b.id} className={`booking${b.id === freshId ? " fresh" : ""}`}>
              <span className={`status status-${b.status}`}>{STATUS_LABEL[b.status] || b.status}</span>
              <h2 className="booking-name">{b.property}</h2>
              <p className="meta">
                {b.room_type}, {plural(b.rooms, "room")}, {plural(b.guests - (b.children || 0), "adult")}{b.children > 0 ? `, ${plural(b.children, "child", "children")}` : ""} · {b.city}
              </p>
              <p>
                {prettyDate(b.check_in)} to {prettyDate(b.check_out)} ({plural(nights, "night")}) ·{" "}
                <span className="price">{money(b.total_amount)}</span>
              </p>
              {Number(b.balance_due) > 0 && (b.status === "held" || b.status === "confirmed") && (
                <p className="meta">
                  Advance {money(b.advance_amount)} is paid online. Balance {money(b.balance_due)} is paid at the property.
                </p>
              )}

              {b.status === "held" && b.hold_expires_at && (
                <>
                  <HoldTimer until={b.hold_expires_at} onExpire={load} />
                {b.upi_pending && (
                  <p className="notice" role="status">
                    You sent a UPI payment. The host will check it and confirm your booking. You will see it here once confirmed.
                  </p>
                )}
                  {!payOn && (
                    <p className="meta">Payments aren't switched on yet. The button below confirms the booking for testing only.</p>
                  )}
                  <div className="booking-actions">
                    {b.upi_pending ? null : payOn ? (
                      <button type="button" className="btn btn-primary" aria-busy={busy === b.id} onClick={() => pay(b)}>
                        {busy === b.id ? "Opening payment…" : `Pay ${money(b.advance_amount)}${Number(b.balance_due) > 0 ? " now" : ""}`}
                      </button>
                    ) : (
                      <button type="button" className="btn btn-primary" aria-busy={busy === b.id} onClick={() => act(b.id, "confirm")}>
                        Confirm booking (test)
                      </button>
                    )}
                    <button type="button" className="btn btn-danger" onClick={() => act(b.id, "cancel")}>
                      Release room
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
                    Invoice
                  </button>
                  <button type="button" className="btn" aria-busy={busy === b.id} onClick={() => whatsappInvoice(b.id)}>
                    Send invoice on WhatsApp
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    aria-busy={busy === b.id}
                    onClick={() => {
                      if (window.confirm("Cancel this booking?")) act(b.id, "cancel");
                    }}
                  >
                    Cancel booking
                  </button>
                </div>
              )}
              {b.status === "confirmed" && (
                <p className="meta">Cancel at least 2 days before check-in and your advance is refunded in full. After that there is no refund.</p>
              )}
            </article>
          );
        })}
    </main>
  );
}
