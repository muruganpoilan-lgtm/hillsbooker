"use client";

import { useState } from "react";

// Asks the browser for the guest's location (only when they tap), then re-runs the search sorted by distance.
// The location is put in the page address for this search only. Hill Booker doesn't store it.
export default function NearMeButton({ lat = "", lng = "" }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  function go(e) {
    const form = e.currentTarget.closest("form");
    if (!navigator.geolocation) {
      setMsg("This browser can't share your location.");
      return;
    }
    setBusy(true);
    setMsg("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        form.elements.near_lat.value = pos.coords.latitude.toFixed(5);
        form.elements.near_lng.value = pos.coords.longitude.toFixed(5);
        form.elements.sort.value = "near";
        form.requestSubmit();
      },
      () => {
        setBusy(false);
        setMsg("Location is switched off for this site. Allow it in your browser, then try again.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <div className="nearme">
      <input type="hidden" name="near_lat" defaultValue={lat} />
      <input type="hidden" name="near_lng" defaultValue={lng} />
      <button type="button" className="btn btn-small" onClick={go} disabled={busy}>
        {busy ? "Finding you…" : lat ? "Update my location" : "📍 Near me"}
      </button>
      {msg && <p className="meta" role="alert">{msg}</p>}
    </div>
  );
}
