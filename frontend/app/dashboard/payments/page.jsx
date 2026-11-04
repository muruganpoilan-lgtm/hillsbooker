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
  const [bank, setBank] = useState(null);
  const [editBank, setEditBank] = useState(false);
  const [bankForm, setBankForm] = useState({ holder: "", account: "", account2: "", ifsc: "" });
  const [bankMsg, setBankMsg] = useState("");
  const [bankErr, setBankErr] = useState("");
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
    const b = await api("/me/bank", { token });
    if (b.ok) setBank(b.data);
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
    setUpiMsg(res.ok ? (res.data.upi_id ? "Saved. We will pay your share to this UPI ID." : "Removed. Add a UPI ID so we can pay you.") : res.error);
    if (res.ok) load();
  }

  async function saveBank(e) {
    e.preventDefault();
    setBankMsg("");
    setBankErr("");
    if (bankForm.account !== bankForm.account2) return setBankErr("The two account numbers don't match. Please check them");
    const res = await api("/me/bank", { method: "PUT", token, body: { holder: bankForm.holder, account: bankForm.account, ifsc: bankForm.ifsc } });
    if (res.status === 401) return logout();
    if (!res.ok) return setBankErr(res.error);
    setBank(res.data);
    setEditBank(false);
    setBankForm({ holder: "", account: "", account2: "", ifsc: "" });
    setBankMsg(res.data.saved ? "Saved." : "Removed.");
  }

  async function removeBank() {
    if (!window.confirm("Remove your saved bank account?")) return;
    const res = await api("/me/bank", { method: "PUT", token, body: { holder: "", account: "", ifsc: "" } });
    if (res.status === 401) return logout();
    if (res.ok) {
      setBank(res.data);
      setBankMsg("Removed.");
    }
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
        <div className="actions">
          <Link href="/dashboard/reports" className="btn btn-small">
            Reports
          </Link>
          {role === "admin" && (
            <Link href="/dashboard/payouts" className="btn btn-primary btn-small">
              Pay hosts
            </Link>
          )}
        </div>
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
            <p className="meta">Hill Booker sends your share of each advance to this UPI ID after the guest checks in.</p>
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
            <h2>Your bank account</h2>
            <p className="meta">Optional. Add this if you want your share sent by bank transfer instead of UPI. Only Hill Booker's team can see it.</p>
            {bank && bank.saved && !editBank && (
              <div className="narrow">
                <p>
                  <b>{bank.holder}</b>
                </p>
                <p className="meta">
                  Account {bank.account} · IFSC {bank.ifsc}
                </p>
                <div className="actions">
                  <button type="button" className="btn btn-small" onClick={() => { setEditBank(true); setBankMsg(""); }}>
                    Change
                  </button>
                  <button type="button" className="btn btn-danger btn-small" onClick={removeBank}>
                    Remove
                  </button>
                </div>
              </div>
            )}
            {(!bank || !bank.saved || editBank) && (
              <form className="narrow" onSubmit={saveBank}>
                <label className="field">
                  <span>Account holder name</span>
                  <input value={bankForm.holder} onChange={(e) => setBankForm({ ...bankForm, holder: e.target.value })} placeholder="Name as in the bank" autoComplete="off" />
                </label>
                <label className="field">
                  <span>Account number</span>
                  <input inputMode="numeric" value={bankForm.account} onChange={(e) => setBankForm({ ...bankForm, account: e.target.value })} placeholder="Digits only" autoComplete="off" />
                </label>
                <label className="field">
                  <span>Enter the account number again</span>
                  <input inputMode="numeric" value={bankForm.account2} onChange={(e) => setBankForm({ ...bankForm, account2: e.target.value })} autoComplete="off" />
                </label>
                <label className="field">
                  <span>IFSC code</span>
                  <input value={bankForm.ifsc} onChange={(e) => setBankForm({ ...bankForm, ifsc: e.target.value.toUpperCase() })} placeholder="SBIN0001234" maxLength={11} autoCapitalize="characters" autoComplete="off" />
                </label>
                <div className="actions">
                  <button type="submit" className="btn btn-primary btn-small">
                    Save bank account
                  </button>
                  {editBank && (
                    <button type="button" className="btn btn-small" onClick={() => { setEditBank(false); setBankErr(""); }}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            )}
            {bankErr && (
              <p className="form-error" role="alert">
                {bankErr}
              </p>
            )}
            {bankMsg && (
              <p className="ok" role="status">
                {bankMsg}
              </p>
            )}
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
