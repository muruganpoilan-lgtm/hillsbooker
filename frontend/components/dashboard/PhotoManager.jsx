"use client";

import { useRef, useState } from "react";
import { api, apiUpload } from "../../lib/api";

// Upload and remove photos for a property or a room. `base` is e.g. /owner/properties/ID or /owner/room-types/ID.
export default function PhotoManager({ base, photos, token, onChange, onAuthError }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [own, setOwn] = useState(false);

  async function upload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setError("");
    setBusy(true);
    const res = await apiUpload(`${base}/photos`, files, token);
    setBusy(false);
    if (input.current) input.current.value = "";
    if (res.status === 401) return onAuthError();
    if (!res.ok) return setError(res.error);
    onChange();
  }

  async function remove(id) {
    if (!window.confirm("Remove this photo?")) return;
    setError("");
    const res = await api(`${base}/photos/${id}`, { method: "DELETE", token });
    if (res.status === 401) return onAuthError();
    if (!res.ok) return setError(res.error);
    onChange();
  }

  return (
    <div>
      {photos.length > 0 && (
        <ul className="photo-grid">
          {photos.map((p) => (
            <li key={p.id}>
              <img src={p.url} alt="" loading="lazy" style={p.status && p.status !== "approved" ? { opacity: 0.6 } : undefined} />
              {p.status === "pending" && <span className="status status-held" style={{ position: "absolute", left: 6, top: 6, background: "#fff" }}>Waiting for approval</span>}
              {p.status === "rejected" && <span className="status status-cancelled" style={{ position: "absolute", left: 6, top: 6, background: "#fff", color: "var(--brick)" }} title={p.reject_reason || ""}>Not approved{p.reject_reason ? `: ${p.reject_reason}` : ""}</span>}
              <button type="button" className="photo-remove" onClick={() => remove(p.id)} aria-label="Remove photo">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="check" style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", margin: "0.4rem 0" }}>
        <input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} style={{ marginTop: "0.25rem" }} />
        <span className="meta">I took these photos myself or have permission to use them on Hill Booker.</span>
      </label>
      <label className="btn btn-small" aria-busy={busy} style={own ? undefined : { opacity: 0.5, cursor: "not-allowed" }}>
        {busy ? "Uploading…" : photos.length ? "Add more photos" : "Add photos"}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={upload} disabled={busy || !own} className="sr-only" />
      </label>
      <p className="meta">JPG, PNG or WebP, up to 5 MB each. The first photo is the cover. Hill Booker checks new photos before guests can see them, usually within a day.</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
