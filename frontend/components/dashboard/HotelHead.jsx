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

// Address and ID proof boxes, used wherever a guest is added or edited. value = {address, id_type, id_number}.
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
