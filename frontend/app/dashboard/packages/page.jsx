"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import Guard from "../../../components/dashboard/Guard";
import PhotoManager from "../../../components/dashboard/PhotoManager";
import { api, money } from "../../../lib/api";

const blank = { title: "", destination: "", nights: "3", days: "4", price_per_person: "", min_people: "2", summary: "", itinerary: "", includes: "", excludes: "", position: "0", active: true };

function Packages() {
  const { token, role, logout } = useAuth();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState("");
  const [photos, setPhotos] = useState([]);
  const [msg, setMsg] = useState({ text: "", bad: false });
  const [busy, setBusy] = useState(false);
  const onAuthError = useCallback(() => logout(), [logout]);

  const load = useCallback(async () => {
    const res = await api("/admin/packages", { token });
    if (res.status === 401) return logout();
    if (res.ok) setRows(res.data);
    else setMsg({ text: res.error, bad: true });
  }, [token, logout]);

  const loadPhotos = useCallback(
    async (id) => {
      const res = await api(`/admin/packages/${id}`, { token });
      if (res.ok) setPhotos(res.data.photos || []);
    },
    [token]
  );

  useEffect(() => {
    if (role === "admin") load();
  }, [load, role]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  function edit(p) {
    setEditId(p.id);
    setMsg({ text: "", bad: false });
    setForm({
      title: p.title,
      destination: p.destination,
      nights: String(p.nights),
      days: String(p.days),
      price_per_person: String(Number(p.price_per_person)),
      min_people: String(p.min_people),
      summary: p.summary || "",
      itinerary: p.itinerary || "",
      includes: p.includes || "",
      excludes: p.excludes || "",
      position: String(p.position),
      active: p.active,
    });
    loadPhotos(p.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    setEditId("");
    setPhotos([]);
    setForm(blank);
  }

  async function save(e) {
    e.preventDefault();
    setMsg({ text: "", bad: false });
    if (form.title.trim().length < 3 || form.destination.trim().length < 2 || form.price_per_person === "") {
      return setMsg({ text: "Give the title, the place and the price per person.", bad: true });
    }
    const body = {
      title: form.title,
      destination: form.destination,
      nights: Number(form.nights) || 0,
      days: Number(form.days) || 1,
      price_per_person: Number(form.price_per_person),
      min_people: Number(form.min_people) || 1,
      summary: form.summary,
      itinerary: form.itinerary,
      includes: form.includes,
      excludes: form.excludes,
      position: Number(form.position) || 0,
      active: form.active,
    };
    setBusy(true);
    const res = editId
      ? await api(`/admin/packages/${editId}`, { method: "PUT", body, token })
      : await api("/admin/packages", { method: "POST", body, token });
    setBusy(false);
    if (res.status === 401) return logout();
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    if (editId) {
      setMsg({ text: "Saved.", bad: false });
    } else {
      setMsg({ text: "Package created. Add photos below, then it is ready.", bad: false });
      setEditId(res.data.id);
      setPhotos([]);
    }
    load();
  }

  async function toggle(p) {
    const body = { title: p.title, destination: p.destination, nights: p.nights, days: p.days, price_per_person: Number(p.price_per_person), min_people: p.min_people, summary: p.summary, itinerary: p.itinerary, includes: p.includes, excludes: p.excludes, position: p.position, active: !p.active };
    const res = await api(`/admin/packages/${p.id}`, { method: "PUT", body, token });
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    load();
  }

  if (role !== "admin") return <p className="empty">Only the Hill Booker admin can open this page.</p>;
  return (
    <>
      <p className="meta"><Link href="/dashboard">← Dashboard</Link></p>
      <h1 className="section-title">Trip packages</h1>
      <p className="meta">
        Packages are trips you plan yourself. Guests see them at hillbooker.com/packages and send an enquiry, which shows in Enquiries. You call them with the final price. Write the day plan and the lists with one line for each item.
      </p>

      <form className="card" style={{ padding: "1rem", display: "grid", gap: "0.8rem", margin: "1rem 0" }} onSubmit={save} noValidate>
        <h2 className="mini-title">{editId ? "Edit package" : "New package"}</h2>
        <div className="dates-bar">
          <label className="field"><span>Title</span><input value={form.title} onChange={set("title")} placeholder="Munnar tea hills for couples" maxLength={120} /></label>
          <label className="field"><span>Place</span><input value={form.destination} onChange={set("destination")} placeholder="Munnar" maxLength={80} /></label>
        </div>
        <div className="dates-bar">
          <label className="field"><span>Nights</span><input type="number" min="0" max="30" value={form.nights} onChange={set("nights")} /></label>
          <label className="field"><span>Days</span><input type="number" min="1" max="31" value={form.days} onChange={set("days")} /></label>
          <label className="field"><span>Price per person (₹)</span><input type="number" min="0" value={form.price_per_person} onChange={set("price_per_person")} /></label>
          <label className="field"><span>Smallest group</span><input type="number" min="1" value={form.min_people} onChange={set("min_people")} /></label>
          <label className="field"><span>Order on the page</span><input type="number" min="0" value={form.position} onChange={set("position")} /></label>
        </div>
        <label className="field"><span>One-line summary</span><input value={form.summary} onChange={set("summary")} maxLength={300} placeholder="Tea gardens, a sunrise viewpoint and a lake-view stay" /></label>
        <label className="field"><span>Day by day (one line for each day)</span><textarea rows={5} value={form.itinerary} onChange={set("itinerary")} placeholder={"Day 1: Arrive in Munnar, check in, evening at the tea museum\nDay 2: Eravikulam park and Mattupetty dam"} /></label>
        <div className="dates-bar">
          <label className="field"><span>Included (one line for each)</span><textarea rows={4} value={form.includes} onChange={set("includes")} placeholder={"3 nights stay with breakfast\nCar with driver"} /></label>
          <label className="field"><span>Not included (one line for each)</span><textarea rows={4} value={form.excludes} onChange={set("excludes")} placeholder={"Lunch and dinner\nEntry tickets"} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={form.active} onChange={set("active")} /><span>Show this package on the website</span></label>
        <div className="actions">
          <button type="submit" className="btn btn-primary btn-small" disabled={busy}>{busy ? "Saving…" : editId ? "Save changes" : "Create package"}</button>
          {editId && <button type="button" className="btn btn-small" onClick={reset}>New package instead</button>}
        </div>
        {msg.text && <p className={msg.bad ? "form-error" : "ok"} role={msg.bad ? "alert" : "status"}>{msg.text}</p>}
        {editId && (
          <div>
            <h3 className="mini-title">Photos</h3>
            <PhotoManager base={`/admin/packages/${editId}`} photos={photos} token={token} onChange={() => loadPhotos(editId)} onAuthError={onAuthError} />
          </div>
        )}
      </form>

      {rows === null ? (
        <p className="meta">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="empty">No packages yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.7rem" }}>
          {rows.map((p) => (
            <li key={p.id} className="card" style={{ padding: "0.9rem", opacity: p.active ? 1 : 0.6 }}>
              <p className="row-name">{p.title}{!p.active && " · hidden"}</p>
              <p className="meta">
                {p.destination} · {p.nights} nights, {p.days} days · {money(p.price_per_person)} per person · {p.enquiries} enquiries
              </p>
              <div className="actions">
                <button type="button" className="btn btn-small" onClick={() => edit(p)}>Edit</button>
                <button type="button" className="btn btn-small" onClick={() => toggle(p)}>{p.active ? "Hide" : "Show"}</button>
                {p.active && <Link className="btn btn-small" href={`/packages/${p.slug}`}>View</Link>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Guard>
      <Packages />
    </Guard>
  );
}
