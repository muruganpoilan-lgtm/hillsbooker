"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";

const SITES = ["Airbnb", "Booking.com", "Agoda", "MakeMyTrip", "Goibibo", "Expedia", "Other"];

function when(ts) {
  if (!ts) return "not read yet";
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// Channel manager for one room: our calendar link for other sites, and the links we read from them.
export default function ChannelSync({ roomId, token, onAuthError }) {
  const [data, setData] = useState(null);
  const [site, setSite] = useState("Airbnb");
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState({ text: "", bad: false });
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await api(`/owner/room-types/${roomId}/channels`, { token });
    if (res.status === 401) return onAuthError();
    if (res.ok) setData(res.data);
  }, [roomId, token, onAuthError]);

  useEffect(() => {
    load();
  }, [load]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(data.export_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function add(e) {
    e.preventDefault();
    setMsg({ text: "", bad: false });
    if (!url.trim()) return setMsg({ text: "Paste the calendar link from the other site.", bad: true });
    setBusy("add");
    const res = await api(`/owner/room-types/${roomId}/channels`, { method: "POST", token, body: { name: site, url: url.trim() } });
    setBusy("");
    if (res.status === 401) return onAuthError();
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    setUrl("");
    if (res.data.status === "error") setMsg({ text: `Saved, but we couldn't read it: ${res.data.error}`, bad: true });
    else setMsg({ text: "Connected. Nights taken on that site are now blocked here.", bad: false });
    load();
  }

  async function sync(id) {
    setBusy(id);
    const res = await api(`/owner/channels/${id}/sync`, { method: "POST", token });
    setBusy("");
    if (res.status === 401) return onAuthError();
    if (!res.ok) setMsg({ text: res.error, bad: true });
    else if (res.data.status === "error") setMsg({ text: res.data.error, bad: true });
    else setMsg({ text: "Up to date.", bad: false });
    load();
  }

  async function remove(f) {
    if (!window.confirm(`Disconnect ${f.name}? Nights it blocked will open again here.`)) return;
    setBusy(f.id);
    const res = await api(`/owner/channels/${f.id}`, { method: "DELETE", token });
    setBusy("");
    if (res.status === 401) return onAuthError();
    if (!res.ok) setMsg({ text: res.error, bad: true });
    load();
  }

  return (
    <>
      <h4>Other booking sites</h4>
      <p className="meta">
        Connect Airbnb, Booking.com and others so a room booked on one site is blocked on the rest. Sites share calendars through links. Changes can take a few hours to show on the other site.
      </p>

      {data && (
        <div className="channel-box">
          <p className="field-label">1. Give this link to the other site</p>
          <p className="meta">Paste it where the site asks to import or sync a calendar. It lists the nights this room is sold out.</p>
          <div className="channel-link">
            <input readOnly value={data.export_url} onFocus={(e) => e.target.select()} aria-label="Calendar link for other sites" />
            <button type="button" className="btn btn-small" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="meta">Keep this link private. Anyone with it can see which nights are sold out.</p>

          <p className="field-label">2. Add the other site's link here</p>
          <form className="stack" onSubmit={add} noValidate>
            <div className="two">
              <label className="field">
                <span>Site</span>
                <select value={site} onChange={(e) => setSite(e.target.value)}>
                  {SITES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Calendar link (iCal)</span>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoCapitalize="none" />
              </label>
            </div>
            <div className="actions">
              <button type="submit" className="btn btn-small btn-primary" aria-busy={busy === "add"}>
                {busy === "add" ? "Connecting…" : "Connect"}
              </button>
            </div>
          </form>

          {data.feeds.length > 0 && (
            <ul className="rows">
              {data.feeds.map((f) => (
                <li key={f.id} className="plain-row">
                  <div>
                    <p className="row-name">{f.name}</p>
                    <p className="meta">
                      Read {when(f.last_synced_at)}
                      {f.last_status === "ok" ? ` · ${f.events} ${f.events === 1 ? "night" : "nights"} blocked` : ""}
                    </p>
                    {f.last_status === "error" && <p className="form-error">{f.last_error}</p>}
                  </div>
                  <div className="actions">
                    <button type="button" className="btn btn-small" onClick={() => sync(f.id)} aria-busy={busy === f.id}>
                      Read now
                    </button>
                    <button type="button" className="btn btn-small btn-danger" onClick={() => remove(f)}>
                      Disconnect
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {msg.text && (
            <p className={msg.bad ? "form-error" : "ok"} role={msg.bad ? "alert" : "status"}>
              {msg.text}
            </p>
          )}
          <details className="nights">
            <summary>Where do I find the link?</summary>
            <p className="meta">Airbnb: Calendar, Availability, Connect calendars, then Export calendar and Import calendar.</p>
            <p className="meta">Booking.com: Rates and Availability, Sync calendars, then Import calendar and Export calendar.</p>
            <p className="meta">Other sites: look for "iCal", "calendar sync" or "calendar link" in the calendar settings.</p>
          </details>
        </div>
      )}
    </>
  );
}
