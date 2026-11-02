"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import { api } from "../../lib/api";

// A box shown at the top of the host's pages until they save a UPI ID.
// Without one, Hill Booker cannot send the host their share of the advance.
export default function UpiPrompt() {
  const { token, role } = useAuth();
  const [state, setState] = useState("loading"); // loading | missing | saved | hidden
  const [upi, setUpi] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || role === "admin") return setState("hidden");
    api("/me/upi", { token }).then((res) => {
      if (res.ok) setState(res.data.upi_id ? "hidden" : "missing");
      else setState("hidden");
    });
  }, [token, role]);

  async function save(e) {
    e.preventDefault();
    setError("");
    if (!upi.trim()) return setError("Enter your UPI ID, for example name@bank");
    const res = await api("/me/upi", { method: "PUT", token, body: { upi_id: upi } });
    if (res.ok && res.data.upi_id) setState("saved");
    else setError(res.error || "Could not save your UPI ID");
  }

  if (state === "saved")
    return (
      <p className="ok" role="status">
        Saved. Hill Booker will pay your share of each advance to this UPI ID after the guest checks in.
      </p>
    );
  if (state !== "missing") return null;

  return (
    <form className="notice" onSubmit={save}>
      <b>Enter your UPI ID to get paid</b>
      <p className="meta">
        Hill Booker pays your share of each advance to your UPI ID after the guest checks in. Without it, we cannot send you the money.
      </p>
      <label className="field">
        <span>Your UPI ID</span>
        <input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@bank" autoCapitalize="none" autoComplete="off" />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="btn btn-primary btn-small">
          Save UPI ID
        </button>
      </div>
    </form>
  );
}
