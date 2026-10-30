"use client";

import { useState } from "react";
import { api, money } from "../lib/api";

// Lets a guest pay the advance straight to the host's UPI ID, then send the 12-digit UPI reference.
// kind is "stay" or "vehicle". onDone reloads the booking list.
// Direct-to-host UPI is switched off: guests pay through Razorpay (which already offers UPI). Set to true to bring the button back.
const DIRECT_UPI = false;

function UpiPayInner({ kind, bookingId, token, amount, onDone }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const [utr, setUtr] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function show() {
    setError("");
    if (open) return setOpen(false);
    const res = await api(`/payments/upi/${kind}/${bookingId}`, { token });
    if (!res.ok) return setError(res.error);
    setInfo(res.data);
    setOpen(true);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(info.upi_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await api(`/payments/upi/${kind}/${bookingId}/submit`, { method: "POST", token, body: { utr } });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setOpen(false);
    onDone();
  }

  return (
    <div className="upi-box">
      <button type="button" className="btn" onClick={show}>
        {open ? "Hide UPI details" : `Pay ${money(amount)} by UPI`}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {open && info && (
        <form className="upi-panel" onSubmit={submit}>
          <p>
            Pay <b>{money(info.amount)}</b> to <b>{info.payee}</b> from any UPI app.
          </p>
          <p className="upi-id">
            <span>{info.upi_id}</span>
            <button type="button" className="link-btn" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </p>
          <p>
            <a className="btn btn-small" href={info.link}>
              Open my UPI app
            </a>
          </p>
          <p className="meta">After paying, enter the 12-digit UPI reference from your payment app. The host checks it and confirms your booking within {info.confirm_hours} hours. Your room stays held until then.</p>
          <label className="field">
            <span>UPI reference (12 digits)</span>
            <input inputMode="numeric" maxLength={14} value={utr} onChange={(e) => setUtr(e.target.value)} required />
          </label>
          <div className="actions">
            <button type="submit" className="btn btn-primary btn-small" aria-busy={busy}>
              {busy ? "Sending…" : "I have paid"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function UpiPay(props) {
  return DIRECT_UPI ? <UpiPayInner {...props} /> : null;
}
