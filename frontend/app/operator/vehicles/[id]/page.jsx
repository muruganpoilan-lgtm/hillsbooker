"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "../../../../components/AuthProvider";
import OperatorGuard from "../../../../components/dashboard/OperatorGuard";
import VehicleForm from "../../../../components/dashboard/VehicleForm";
import PhotoManager from "../../../../components/dashboard/PhotoManager";
import { api, money } from "../../../../lib/api";

const STATUS_NOTE = {
  pending: "Waiting for approval. Guests can't see this vehicle until an admin approves it.",
  approved: "Live. Guests can find and book it.",
  rejected: "Not approved. Update the details and save to send it for review again.",
};
const EMPTY_TRIP = { title: "", from_place: "", to_place: "", details: "", price: "" };

function Editor({ id }) {
  const { token, logout } = useAuth();
  const [v, setV] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [trip, setTrip] = useState(EMPTY_TRIP);
  const [editing, setEditing] = useState("");
  const [tripError, setTripError] = useState("");
  const [tripBusy, setTripBusy] = useState(false);
  const onAuthError = useCallback(() => logout(), [logout]);

  const load = useCallback(async () => {
    const res = await api(`/operator/vehicles/${id}`, { token });
    if (res.status === 401) return logout();
    if (!res.ok) return setError(res.error);
    setError("");
    setV(res.data);
  }, [id, token, logout]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveDetails(body) {
    setSaved("");
    const res = await api(`/operator/vehicles/${id}`, { method: "PATCH", token, body });
    if (res.status === 401) {
      logout();
      return "Your session ended. Log in again.";
    }
    if (!res.ok) return res.error;
    setSaved("Saved.");
    load();
    return null;
  }

  async function saveTrip(e) {
    e.preventDefault();
    setTripError("");
    const price = parseFloat(trip.price);
    if (!trip.title.trim() || !(price >= 0)) return setTripError("Enter a title and a price.");
    const body = {
      title: trip.title.trim(),
      from_place: trip.from_place.trim() || null,
      to_place: trip.to_place.trim() || null,
      details: trip.details.trim() || null,
      price,
    };
    setTripBusy(true);
    const res = editing
      ? await api(`/operator/trips/${editing}`, { method: "PATCH", token, body })
      : await api(`/operator/vehicles/${id}/trips`, { method: "POST", token, body });
    setTripBusy(false);
    if (res.status === 401) return logout();
    if (!res.ok) return setTripError(res.error);
    setTrip(EMPTY_TRIP);
    setEditing("");
    load();
  }

  async function removeTrip(t) {
    if (!window.confirm("Remove this trip? Guests will no longer be able to book it.")) return;
    const res = await api(`/operator/trips/${t.id}`, { method: "DELETE", token });
    if (res.status === 401) return logout();
    if (!res.ok) return setTripError(res.error);
    load();
  }

  function startEdit(t) {
    setEditing(t.id);
    setTrip({
      title: t.title,
      from_place: t.from_place || "",
      to_place: t.to_place || "",
      details: t.details || "",
      price: String(Math.round(Number(t.price))),
    });
  }

  const setT = (k) => (e) => setTrip({ ...trip, [k]: e.target.value });

  if (error) {
    return (
      <>
        <p className="form-error" role="alert">
          {error}
        </p>
        <p className="meta">
          <Link href="/operator">← Your vehicles</Link>
        </p>
      </>
    );
  }
  if (!v) return <p className="empty">Loading…</p>;
  const trips = v.trips.filter((t) => t.active);

  return (
    <>
      <p className="meta">
        <Link href="/operator">← Your vehicles</Link>
      </p>
      <h1 className="section-title">{v.name}</h1>
      <p className="notice">{STATUS_NOTE[v.status]}</p>

      <section className="prop-section">
        <h2>Details</h2>
        <div className="narrow">
          <VehicleForm key={v.id} initial={v} submitLabel="Save details" onSubmit={saveDetails} />
          {saved && (
            <p className="ok" role="status">
              {saved}
            </p>
          )}
        </div>
      </section>

      <section className="prop-section">
        <h2>Photos</h2>
        <PhotoManager base={`/operator/vehicles/${id}`} photos={v.photos} token={token} onChange={load} onAuthError={onAuthError} />
      </section>

      <section className="prop-section">
        <h2>Fixed-price trips</h2>
        <p className="meta">For example "Munnar sightseeing, one day". Guests can book these at the fixed price instead of hiring by the day.</p>
        {trips.length === 0 && <p className="meta">No trips yet.</p>}
        <ul className="rows">
          {trips.map((t) => (
            <li key={t.id} className="plain-row">
              <div>
                <p className="row-name">
                  {t.title} · {money(t.price)}
                </p>
                <p className="meta">{[[t.from_place, t.to_place].filter(Boolean).join(" to "), t.details].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="actions">
                <button type="button" className="btn btn-small" onClick={() => startEdit(t)}>
                  Edit
                </button>
                <button type="button" className="btn btn-small btn-danger" onClick={() => removeTrip(t)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        <form className="room-card stack" onSubmit={saveTrip} noValidate>
          <h3>{editing ? "Edit trip" : "Add a trip"}</h3>
          <div className="four">
            <label className="field">
              <span>Title</span>
              <input type="text" value={trip.title} onChange={setT("title")} maxLength={120} />
            </label>
            <label className="field">
              <span>From</span>
              <input type="text" value={trip.from_place} onChange={setT("from_place")} maxLength={80} />
            </label>
            <label className="field">
              <span>To</span>
              <input type="text" value={trip.to_place} onChange={setT("to_place")} maxLength={80} />
            </label>
            <label className="field">
              <span>Fixed price (₹)</span>
              <input type="number" min="0" value={trip.price} onChange={setT("price")} />
            </label>
          </div>
          <label className="field">
            <span>What is included</span>
            <input type="text" value={trip.details} onChange={setT("details")} maxLength={1000} placeholder="8 hours, 5 stops" />
          </label>
          {tripError && (
            <p className="form-error" role="alert">
              {tripError}
            </p>
          )}
          <div className="actions">
            <button type="submit" className="btn btn-primary btn-small" aria-busy={tripBusy}>
              {editing ? "Save trip" : "Add trip"}
            </button>
            {editing && (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  setEditing("");
                  setTrip(EMPTY_TRIP);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
    </>
  );
}

export default function VehicleEditPage() {
  const { id } = useParams();
  return (
    <OperatorGuard>
      <Editor id={id} />
    </OperatorGuard>
  );
}
