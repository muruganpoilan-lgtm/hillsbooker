"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import Guard from "../../../components/dashboard/Guard";
import { api, money, prettyDate } from "../../../lib/api";

const METHOD = { razorpay: "Paid online", cashfree: "Paid online", upi_direct: "UPI to you" };
const PAY_STATUS = { created: "Waiting", paid: "Received", failed: "Not received", refunded: "Refunded" };

function Payments() {
  const { token, role, logout } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [upi, setUpi] = useState("");
  const [upiMsg, setUpiMsg] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneMsg, setPhoneMsg] = useState("");
  const [alertsOn, setAlertsOn] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const res = await api("/host/payments", { token });
    if (res.status === 401) return logout();
    if (!res.ok) return setError(res.error);
    setError("");
    setData(res.data);
    setUpi(res.data.upi_id || "");
    const p = await api("/me/phone", { token });
    if (p.ok) {
      setPhone(p.data.phone || "");
      setAlertsOn(Boolean(p.data.alerts_on));
    }
  }, [token, logout]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveUpi(e) {
    e.preventDefault();
    setUpiMsg("");
    const res = await api("/me/upi", { method: "PUT", token, body: { upi_id: upi } });
    if (res.status === 401) return logout();
    setUpiMsg(res.ok ? (res.data.upi_id ? "Saved. Guests can now pay you by UPI." : "Removed. Guests will pay online only.") : res.error);
    if (res.ok) load();
  }

  async function savePhone(e) {
    e.preventDefault();
    setPhoneMsg("");
    const res = await api("/me/phone", { method: "PUT", token, body: { phone } });
    if (res.status === 401) return logout();
    setPhoneMsg(res.ok ? (res.data.phone ? "Saved. You will get a WhatsApp message for every new booking." : "Removed. No WhatsApp alerts will be sent.") : res.error);
  }

  async function decide(id, action) {
    if (action === "reject" && !window.confirm("You did not receive this payment? The booking will be released.")) return;
    setBusy(id);
    setError("");
    const res = await api(`/host/payments/${id}/${action}`, { method: "POST", token });
    setBusy("");
    if (res.status === 401) return logout();
    if (!res.ok) setError(res.error);
    load();
  }

  const rows = data ? data.rows : [];
  const waiting = rows.filter((r) => r.status === "held" && r.provider === "upi_direct" && r.pay_status === "created");

  return (
    <>
      <p className="meta">
        <Link href="/dashboard">← Your properties</Link>
      </p>
      <div className="dash-head">
        <h1 className="section-title">Payments</h1>
        {role === "admin" && (
          <div className="actions">
            <Link href="/dashboard/payouts" className="btn btn-primary btn-small">
              Pay hosts
            </Link>
          </div>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p className="empty">Loading…</p>}
      {data && (
        <>
          <div className="pay-summary">
            <div className="pay-stat">
              <span className="meta">Advance received</span>
              <b className="price">{money(data.advance_received)}</b>
            </div>
            <div className="pay-stat">
              <span className="meta">Balance to collect from guests</span>
              <b className="price">{money(data.balance_to_collect)}</b>
            </div>
            <div className="pay-stat">
              <span className="meta">Refunded</span>
              <b className="price">{money(data.refunded)}</b>
            </div>
          </div>

          <section className="prop-section">
            <h2>Hill Booker fee ({data.commission_percent}% of each booking)</h2>
            <p className="meta">The guest pays no extra. The fee is taken from the advance.</p>
            <div className="pay-summary">
              <div className="pay-stat">
                <span className="meta">{role === "admin" ? "Commission earned" : "Fee on payments received"}</span>
                <b className="price">{money(data.fee_total)}</b>
              </div>
              <div className="pay-stat">
                <span className="meta">{role === "admin" ? "Hosts owe you (paid to them by UPI)" : "You owe Hill Booker (paid to you by UPI)"}</span>
                <b className="price">{money(data.fee_owed_by_hosts)}</b>
              </div>
              <div className="pay-stat">
                <span className="meta">{role === "admin" ? "You owe hosts (paid online, after fee)" : "Hill Booker pays you (paid online, after fee)"}</span>
                <b className="price">{money(data.payout_due_to_hosts)}</b>
              </div>
              <div className="pay-stat">
                <span className="meta">{role === "admin" ? "Already paid out to hosts" : "Already paid to you"}</span>
                <b className="price">{money(data.paid_out_to_hosts)}</b>
              </div>
            </div>
          </section>

          <section className="prop-section">
            <h2>Your UPI ID</h2>
            <p className="meta">Guests can pay their advance straight to this UPI ID. You confirm each payment after checking your bank. Leave it empty to take online payments only.</p>
            <form className="narrow" onSubmit={saveUpi}>
              <label className="field">
                <span>UPI ID</span>
                <input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@bank" autoCapitalize="none" />
              </label>
              <div className="actions">
                <button type="submit" className="btn btn-primary btn-small">
                  Save UPI ID
                </button>
              </div>
              {upiMsg && (
                <p className="ok" role="status">
                  {upiMsg}
                </p>
              )}
            </form>
          </section>

          <section className="prop-section">
            <h2>WhatsApp alerts</h2>
            <p className="meta">
              We message this number on WhatsApp when a guest books, with the check-in date, room and guest details.
              {!alertsOn && " (WhatsApp alerts are not switched on yet. Your number is saved and alerts start once they are.)"}
            </p>
            <form className="narrow" onSubmit={savePhone}>
              <label className="field">
                <span>Your WhatsApp number</span>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" autoComplete="tel" />
              </label>
              <div className="actions">
                <button type="submit" className="btn btn-primary btn-small">
                  Save number
                </button>
              </div>
              {phoneMsg && (
                <p className="ok" role="status">
                  {phoneMsg}
                </p>
              )}
            </form>
          </section>

          <section className="prop-section">
            <h2>Waiting for you{waiting.length ? ` (${waiting.length})` : ""}</h2>
            {waiting.length === 0 && <p className="meta">No UPI payments to check right now.</p>}
            <ul className="rows">
              {waiting.map((r) => (
                <li key={r.payment_id} className="plain-row">
                  <div>
                    <p className="row-name">
                      {r.guest}
                      {r.guest_phone ? ` · ${r.guest_phone}` : ""}
                    </p>
                    <p className="meta">
                      {r.item} · {prettyDate(r.start_date)}
                      {r.end_date !== r.start_date ? ` to ${prettyDate(r.end_date)}` : ""}
                    </p>
                    <p className="meta">
                      Check your bank for <b>{money(r.paid_amount)}</b>, UPI reference <b>{r.reference}</b>
                    </p>
                  </div>
                  <div className="actions">
                    <button type="button" className="btn btn-primary btn-small" aria-busy={busy === r.payment_id} onClick={() => decide(r.payment_id, "confirm")}>
                      Received, confirm
                    </button>
                    <button type="button" className="btn btn-danger btn-small" aria-busy={busy === r.payment_id} onClick={() => decide(r.payment_id, "reject")}>
                      Not received
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="prop-section">
            <h2>All payments</h2>
            {rows.length === 0 && <p className="meta">No payments yet.</p>}
            <ul className="rows">
              {rows.map((r) => (
                <li key={`${r.kind}-${r.id}`} className="plain-row">
                  <div>
                    <p className="row-name">{r.guest}</p>
                    <p className="meta">
                      {r.item} · {prettyDate(r.start_date)}
                      {r.end_date !== r.start_date ? ` to ${prettyDate(r.end_date)}` : ""}
                    </p>
                    <p className="meta">
                      {r.provider ? METHOD[r.provider] || r.provider : "Confirmed without online payment"}
                      {r.pay_status ? ` · ${PAY_STATUS[r.pay_status] || r.pay_status}` : ""}
                    </p>
                  </div>
                  <div className="right">
                    <p className="price">{money(r.total_amount)}</p>
                    <p className="meta">Advance {money(r.advance_amount)}</p>
                    {r.pay_status === "paid" && Number(r.commission) > 0 && <p className="meta">Fee {money(r.commission)}</p>}
                    {r.pay_status === "paid" && (r.provider === "razorpay" || r.provider === "cashfree") && (
                      <p className="meta">
                        {r.payout_paid_at
                          ? `Paid to you ${prettyDate(r.payout_paid_at)}, ref ${r.payout_reference}`
                          : `Your share ${money(Number(r.paid_amount) - Number(r.commission) - Number(r.refunded_amount || 0))}, paid after check-in`}
                      </p>
                    )}
                    {r.status === "confirmed" && Number(r.total_amount) > Number(r.advance_amount) && (
                      <p className="meta">Collect {money(Number(r.total_amount) - Number(r.advance_amount))}</p>
                    )}
                    <span className={`status status-${r.status}`}>{r.status === "held" ? "Waiting" : r.status === "confirmed" ? "Confirmed" : "Cancelled"}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}

export default function PaymentsPage() {
  return (
    <Guard>
      <Payments />
    </Guard>
  );
}
