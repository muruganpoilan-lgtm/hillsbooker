"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../AuthProvider";
import { API_BASE, api } from "../../lib/api";

const KEY = "hb_hotel";
const TABS = [
  { href: "/dashboard/hotel", label: "Rooms" },
  { href: "/dashboard/hotel/guests", label: "Guest register" },
  { href: "/dashboard/hotel/staff", label: "Staff & attendance" },
  { href: "/dashboard/hotel/salary", label: "Salary" },
];

// The host's properties and the one they are managing now. The choice is remembered in this browser.
export function useHotel() {
  const { token, logout } = useAuth();
  const [hotels, setHotels] = useState(null);
  const [pid, setPidState] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let off = false;
    api("/hotel/properties", { token }).then((res) => {
      if (off) return;
      if (res.status === 401) return logout();
      if (!res.ok) return setError(res.error);
      setHotels(res.data);
      let saved = "";
      try {
        saved = localStorage.getItem(KEY) || "";
      } catch {}
      const pick = res.data.find((h) => h.id === saved) || res.data[0];
      setPidState(pick ? pick.id : "");
    });
    return () => {
      off = true;
    };
  }, [token, logout]);

  const setPid = useCallback((id) => {
    setPidState(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {}
  }, []);

  return { hotels, pid, setPid, error, hotel: (hotels || []).find((h) => h.id === pid) || null };
}

// Page heading, the property picker and the four tabs of "Manage my hotel".
export default function HotelHead({ hotels, pid, setPid, error }) {
  const path = usePathname() || "";
  return (
    <>
      <div className="dash-head">
        <h1 className="section-title">Manage my hotel</h1>
        {hotels && hotels.length > 1 && (
          <label className="field mh-pick">
            <span className="sr-only">Property</span>
            <select value={pid} onChange={(e) => setPid(e.target.value)}>
              {hotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}, {h.city}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {hotels && hotels.length === 1 && (
        <p className="meta">
          {hotels[0].name}, {hotels[0].city}
        </p>
      )}
      <nav className="mh-tabs" aria-label="Manage my hotel">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={path === t.href ? "on" : ""} aria-current={path === t.href ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {hotels === null && !error && <p className="empty">Loading…</p>}
      {hotels && hotels.length === 0 && (
        <div className="empty">
          <h2>Add a property first</h2>
          <p>
            This free tool keeps your rooms, guests, staff and salary records in one place. <Link href="/dashboard/new">Add your property</Link>, then come back here.
          </p>
        </div>
      )}
    </>
  );
}

// Downloads an Excel file from the API (the login token goes in a header, so a plain link would not work).
export async function downloadFile(path, filename, token) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    return "Can't reach the Hill Booker server. Try again.";
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return typeof body.detail === "string" ? body.detail : "Could not create the file.";
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return "";
}

// A number typed in a form, or null when the box is empty or not a number.
export function num(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ID proofs a hotel can note for a guest. For Aadhaar only the last 4 digits are kept (masked Aadhaar).
export const ID_TYPES = [
  ["aadhaar", "Aadhaar card"],
  ["voter", "Voter ID"],
  ["driving", "Driving licence"],
  ["passport", "Passport"],
  ["pan", "PAN card"],
  ["other", "Other ID"],
];
export const idName = (t) => (ID_TYPES.find(([k]) => k === t) || ["", ""])[1];

// Address, ID proof and vehicle boxes, used wherever a guest is added or edited.
// value = {address, id_type, id_number, vehicle_model, vehicle_number}.
export function IdFields({ value, onChange }) {
  const aadhaar = value.id_type === "aadhaar";
  const set = (k) => (e) => {
    let v = e.target.value;
    if (k === "id_number" && aadhaar) v = v.replace(/\D/g, "").slice(0, 4);
    const next = { ...value, [k]: v };
    if (k === "id_type" && v === "aadhaar") next.id_number = (value.id_number || "").replace(/\D/g, "").slice(-4);
    if (k === "id_type" && !v) next.id_number = "";
    onChange(next);
  };
  return (
    <>
      <label className="field mh-wide">
        <span>Guest's address</span>
        <input value={value.address} maxLength={300} onChange={set("address")} placeholder="Door number, street, town, PIN code" autoComplete="off" />
      </label>
      <label className="field">
        <span>ID proof</span>
        <select value={value.id_type} onChange={set("id_type")}>
          <option value="">Not taken</option>
          {ID_TYPES.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{aadhaar ? "Aadhaar: last 4 digits only" : "ID number"}</span>
        <input
          value={value.id_number}
          maxLength={aadhaar ? 4 : 30}
          inputMode={aadhaar ? "numeric" : undefined}
          onChange={set("id_number")}
          disabled={!value.id_type}
          placeholder={aadhaar ? "1234" : ""}
          autoComplete="off"
        />
      </label>
      <label className="field">
        <span>Guest's vehicle (optional)</span>
        <input value={value.vehicle_model || ""} maxLength={60} onChange={set("vehicle_model")} placeholder="Maruti Swift, white" autoComplete="off" />
      </label>
      <label className="field">
        <span>Vehicle registration number</span>
        <input value={value.vehicle_number || ""} maxLength={20} onChange={(e) => onChange({ ...value, vehicle_number: e.target.value.toUpperCase() })} placeholder="TN 38 AB 1234" autoCapitalize="characters" autoComplete="off" />
      </label>
    </>
  );
}

// "16 Nov, 17 Nov and 18 Nov" for a warning about nights.
export function listDays(days) {
  const names = days.map((d) => {
    const [y, m, dd] = String(d).slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  });
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] || "";
}

// ---------- photos of the guest's ID proof ----------
const SIDES = [
  ["front", "Front"],
  ["back", "Back"],
];

// Shrinks a photo in the browser before it is sent: longest side 1600 px, saved as JPEG. Phone photos drop from several MB to well under 1 MB.
export async function shrinkPhoto(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * scale));
    c.height = Math.max(1, Math.round(bmp.height * scale));
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((done) => c.toBlob(done, "image/jpeg", 0.82));
    return blob || file;
  } catch {
    return file;
  }
}

// Sends one ID photo. base is "/hotel/guests/<id>" or "/hotel/bookings/<id>". Returns an error message, or "" when saved.
export async function uploadIdPhoto(base, side, file, token) {
  const form = new FormData();
  form.append("file", await shrinkPhoto(file), "id.jpg");
  let res;
  try {
    res = await fetch(`${API_BASE}${base}/id-photo/${side}`, { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: form });
  } catch {
    return "Can't reach the Hill Booker server. Try the photo again.";
  }
  if (res.ok) return "";
  const body = await res.json().catch(() => ({}));
  return typeof body.detail === "string" ? body.detail : "The photo could not be saved. Try again.";
}

function PhotoButton({ label, onPick, disabled }) {
  // On a phone this opens the camera; on a computer it opens the file chooser.
  return (
    <label className={`btn btn-small mh-photo-btn${disabled ? " off" : ""}`}>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files && e.target.files[0];
          e.target.value = "";
          if (f) onPick(f);
        }}
      />
      {label}
    </label>
  );
}

function AadhaarNote({ idType }) {
  return idType === "aadhaar" ? <p className="meta">For Aadhaar, photograph only a masked Aadhaar (the copy with the first 8 digits hidden).</p> : null;
}

// For a guest who is not saved yet (check-in and "add guest" forms): keeps the chosen photos until the guest is saved.
// files = {front: File|null, back: File|null}
export function IdPhotoPicker({ files, onChange, idType }) {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    const next = {};
    for (const [k] of SIDES) if (files[k]) next[k] = URL.createObjectURL(files[k]);
    setUrls(next);
    return () => Object.values(next).forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  return (
    <div className="mh-wide mh-photos">
      <span className="field-label">Photo of the ID proof (optional)</span>
      <div className="mh-photo-row">
        {SIDES.map(([k, name]) => (
          <div key={k} className="mh-photo">
            {urls[k] ? <img src={urls[k]} alt={`${name} of the ID proof`} /> : <div className="mh-photo-empty">{name}</div>}
            <div className="actions">
              <PhotoButton label={files[k] ? `Retake ${name.toLowerCase()}` : `Add ${name.toLowerCase()} photo`} onPick={(f) => onChange({ ...files, [k]: f })} />
              {files[k] && (
                <button type="button" className="link-btn mh-del" onClick={() => onChange({ ...files, [k]: null })}>
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <AadhaarNote idType={idType} />
      <p className="meta">Only you can open these photos. They are not shown to guests, other hosts or the public.</p>
    </div>
  );
}

// For a saved guest or booking: shows, adds, replaces and removes the ID photos. have = ["front", "back"] sides already saved.
export function IdPhotos({ base, have, token, onChanged, idType }) {
  const [urls, setUrls] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const key = (have || []).join(",");

  useEffect(() => {
    let off = false;
    const made = [];
    setUrls({});
    (async () => {
      for (const side of key ? key.split(",") : []) {
        try {
          const res = await fetch(`${API_BASE}${base}/id-photo/${side}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
          if (!res.ok) continue;
          const u = URL.createObjectURL(await res.blob());
          made.push(u);
          if (!off) setUrls((cur) => ({ ...cur, [side]: u }));
        } catch {}
      }
    })();
    return () => {
      off = true;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [base, key, token]);

  async function pick(side, file) {
    setBusy(side);
    setError("");
    const err = await uploadIdPhoto(base, side, file, token);
    setBusy("");
    if (err) return setError(err);
    onChanged();
  }

  async function remove(side) {
    if (!window.confirm("Delete this ID photo? This cannot be undone.")) return;
    setBusy(side);
    const res = await api(`${base}/id-photo/${side}`, { method: "DELETE", token });
    setBusy("");
    if (!res.ok) return setError(res.error);
    onChanged();
  }

  return (
    <div className="mh-wide mh-photos">
      <span className="field-label">Photo of the ID proof</span>
      <div className="mh-photo-row">
        {SIDES.map(([k, name]) => {
          const saved = (have || []).includes(k);
          return (
            <div key={k} className="mh-photo">
              {saved ? (
                urls[k] ? (
                  <a href={urls[k]} target="_blank" rel="noreferrer" title="Open the photo">
                    <img src={urls[k]} alt={`${name} of the ID proof`} />
                  </a>
                ) : (
                  <div className="mh-photo-empty">Loading…</div>
                )
              ) : (
                <div className="mh-photo-empty">{name}</div>
              )}
              <div className="actions">
                <PhotoButton label={busy === k ? "Saving…" : saved ? `Replace ${name.toLowerCase()}` : `Add ${name.toLowerCase()} photo`} onPick={(f) => pick(k, f)} disabled={!!busy} />
                {saved && (
                  <button type="button" className="link-btn mh-del" onClick={() => remove(k)} disabled={!!busy}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <AadhaarNote idType={idType} />
      <p className="meta">Only you can open these photos. They are not shown to guests, other hosts or the public.</p>
    </div>
  );
}

// After a new guest is saved: send the photos chosen in the form. Returns an error message, or "".
export async function sendPickedPhotos(base, files, token) {
  for (const [k] of SIDES) {
    if (!files[k]) continue;
    const err = await uploadIdPhoto(base, k, files[k], token);
    if (err) return `The guest is saved, but the ${k} ID photo was not: ${err} Add it again from the Guest register.`;
  }
  return "";
}
