"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

// Lets a guest save their mobile number. It is used to send invoices to their own WhatsApp and so the host can reach them.
// compact: show only while no number is saved (for the payment page).
export default function PhoneBox({ token, compact = false }) {
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState(null); // null while loading
  const [msg, setMsg] = useState({ text: "", bad: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api("/auth/phone", { token }).then((res) => {
      if (res.ok) {
        setPhone(res.data.phone || "");
        setSaved(res.data.phone || "");
      }
    });
  }, [token]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({ text: "", bad: false });
    const res = await api("/auth/phone", { method: "PUT", token, body: { phone } });
    setBusy(false);
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    setSaved(res.data.phone || "");
    setMsg({ text: res.data.phone ? "Saved." : "Removed.", bad: false });
  }

  if (saved === null) return null;
  if (compact && saved) return null;

  return (
    <form className="phone-box" onSubmit={save}>
      <label className="field">
        <span>Your mobile / WhatsApp number</span>
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" autoComplete="tel" />
      </label>
      <p className="meta">Used to send your invoice to your own WhatsApp and so your host can reach you.</p>
      <div className="actions">
        <button type="submit" className="btn btn-small" aria-busy={busy}>
          Save number
        </button>
      </div>
      {msg.text && (
        <p className={msg.bad ? "form-error" : "ok"} role={msg.bad ? "alert" : "status"}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
