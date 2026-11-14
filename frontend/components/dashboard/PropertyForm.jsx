"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../AuthProvider";

export const TYPES = [
  ["hotel", "Hotel"],
  ["homestay", "Homestay"],
  ["apartment", "Apartment"],
  ["resort", "Resort"],
];

// Used for both "add property" and "edit property". `initial` is the saved property when editing.
// The real owner's details. Only the admin sees and saves these (for properties listed on an owner's behalf).
const OWNER_FIELDS = ["owner_name", "owner_whatsapp", "owner_upi", "owner_bank_account", "owner_bank_ifsc", "owner_bank_holder"];

export default function PropertyForm({ initial, submitLabel, onSubmit }) {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [owner, setOwner] = useState(() => Object.fromEntries(OWNER_FIELDS.map((f) => [f, initial?.owner?.[f] || ""])));
  const setOwnerField = (k) => (e) => setOwner({ ...owner, [k]: e.target.value });
  const [form, setForm] = useState({
    name: initial?.name || "",
    type: initial?.type || "hotel",
    city: initial?.city || "",
    address: initial?.address || "",
    map_url: initial?.map_url || "",
    nearby: initial?.nearby || "",
    description: initial?.description || "",
    advance_percent: String(initial?.advance_percent ?? 30),
    min_notice_days: String(initial?.min_notice_days ?? 2),
  });
  const [amenityIds, setAmenityIds] = useState(initial?.amenity_ids || []);
  const [amenities, setAmenities] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/amenities").then((res) => res.ok && setAmenities(res.data));
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggle = (id) => setAmenityIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.city.trim()) {
      setError("Enter the property name and the city.");
      return;
    }
    setBusy(true);
    const err = await onSubmit({
      name: form.name.trim(),
      type: form.type,
      city: form.city.trim(),
      address: form.address.trim() || null,
      map_url: form.map_url.trim(),
      nearby: form.nearby,
      description: form.description.trim() || null,
      advance_percent: Number(form.advance_percent),
      min_notice_days: Number(form.min_notice_days),
      amenity_ids: amenityIds,
      ...(isAdmin ? Object.fromEntries(OWNER_FIELDS.map((f) => [f, owner[f].trim()])) : {}),
    });
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <label className="field">
        <span>Property name</span>
        <input type="text" value={form.name} onChange={set("name")} maxLength={150} />
      </label>
      <div className="two">
        <label className="field">
          <span>Type</span>
          <select value={form.type} onChange={set("type")}>
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>City</span>
          <input type="text" value={form.city} onChange={set("city")} maxLength={80} />
        </label>
      </div>
      <label className="field">
        <span>Address</span>
        <input type="text" value={form.address} onChange={set("address")} autoComplete="street-address" />
      </label>
      <label className="field">
        <span>Google Maps link (optional)</span>
        <input type="url" value={form.map_url} onChange={set("map_url")} placeholder="https://maps.app.goo.gl/..." autoCapitalize="none" />
        <small>Open your property in Google Maps, tap Share, copy the link and paste it here. Guests then see your exact location on a map.</small>
      </label>
      <label className="field">
        <span>Nearby attractions (optional)</span>
        <textarea rows={5} value={form.nearby} onChange={set("nearby")} placeholder={"Ooty Lake - 3 km\nBotanical Garden - 5 km\nDoddabetta Peak - 9 km"} />
        <small>One place per line, with the distance. Up to 10 lines.</small>
      </label>
      <label className="field">
        <span>Description</span>
        <textarea rows={5} value={form.description} onChange={set("description")} />
      </label>
      <label className="field">
        <span>Advance guests pay online when booking</span>
        <select value={form.advance_percent} onChange={set("advance_percent")}>
          {[10, 20, 25, 30, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n === 100 ? "100% (the full amount, nothing at the property)" : `${n}% now, the rest at the property`}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Earliest booking guests can make</span>
        <select value={form.min_notice_days} onChange={set("min_notice_days")}>
          {[[0, "Same day is fine"], [1, "At least 1 day ahead (no same-day)"], [2, "At least 2 days ahead (no same-day or next-day)"], [3, "At least 3 days ahead"], [7, "At least 7 days ahead"]].map(([n, label]) => (
            <option key={n} value={n}>{label}</option>
          ))}
        </select>
        <small>Recommended: 2 days. It stops double bookings while other sites you sync with are still updating.</small>
      </label>
      {amenities.length > 0 && (
        <fieldset className="amenities">
          <legend>Amenities</legend>
          {amenities.map((a) => (
            <label key={a.id} className="check">
              <input type="checkbox" checked={amenityIds.includes(a.id)} onChange={() => toggle(a.id)} />
              <span>{a.name}</span>
            </label>
          ))}
        </fieldset>
      )}
      {isAdmin && (
        <fieldset className="stack">
          <legend>Owner</legend>
          <small className="meta">
            Only you (the admin) see this. Booking and cancellation WhatsApp alerts go to the owner's number. With a UPI ID or bank account here, this
            property's payouts show on the Host payouts page as their own line for this owner.
          </small>
          <div className="two">
            <label className="field">
              <span>Owner name</span>
              <input type="text" value={owner.owner_name} onChange={setOwnerField("owner_name")} maxLength={100} autoComplete="off" />
            </label>
            <label className="field">
              <span>Owner WhatsApp number</span>
              <input type="tel" value={owner.owner_whatsapp} onChange={setOwnerField("owner_whatsapp")} placeholder="98765 43210" autoComplete="off" />
            </label>
          </div>
          <label className="field">
            <span>UPI ID</span>
            <input type="text" value={owner.owner_upi} onChange={setOwnerField("owner_upi")} placeholder="name@bank" autoCapitalize="none" autoComplete="off" />
          </label>
          <div className="two">
            <label className="field">
              <span>Bank account number</span>
              <input type="text" inputMode="numeric" value={owner.owner_bank_account} onChange={setOwnerField("owner_bank_account")} autoComplete="off" />
            </label>
            <label className="field">
              <span>IFSC</span>
              <input type="text" value={owner.owner_bank_ifsc} onChange={setOwnerField("owner_bank_ifsc")} placeholder="SBIN0001234" autoCapitalize="characters" autoComplete="off" />
            </label>
          </div>
          <label className="field">
            <span>Account holder name</span>
            <input type="text" value={owner.owner_bank_holder} onChange={setOwnerField("owner_bank_holder")} autoComplete="off" />
            <small>Fill in all three bank fields, or leave all three empty.</small>
          </label>
        </fieldset>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" aria-busy={busy}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
