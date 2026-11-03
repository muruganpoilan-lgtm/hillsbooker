"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import Guard from "../../../components/dashboard/Guard";
import PhotoManager from "../../../components/dashboard/PhotoManager";
import { api } from "../../../lib/api";

const blank = { title: "", city: "", summary: "", body: "", published: false };

function Blog() {
  const { token, role, logout } = useAuth();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState("");
  const [photos, setPhotos] = useState([]);
  const [msg, setMsg] = useState({ text: "", bad: false });
  const [busy, setBusy] = useState(false);
  const onAuthError = useCallback(() => logout(), [logout]);

  const load = useCallback(async () => {
    const res = await api("/admin/blog", { token });
    if (res.status === 401) return logout();
    if (res.ok) setRows(res.data);
    else setMsg({ text: res.error, bad: true });
  }, [token, logout]);

  const loadPhotos = useCallback(
    async (id) => {
      const res = await api(`/admin/blog/${id}`, { token });
      if (res.ok) setPhotos(res.data.photos || []);
    },
    [token]
  );

  useEffect(() => {
    if (role === "admin") load();
  }, [load, role]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function edit(row) {
    const res = await api(`/admin/blog/${row.id}`, { token });
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    const p = res.data;
    setEditId(p.id);
    setMsg({ text: "", bad: false });
    setForm({ title: p.title, city: p.city || "", summary: p.summary || "", body: p.body || "", published: p.published });
    setPhotos(p.photos || []);
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
    if (form.title.trim().length < 3) return setMsg({ text: "Give the guide a title.", bad: true });
    const body = { title: form.title, city: form.city, summary: form.summary, body: form.body, published: form.published };
    setBusy(true);
    const res = editId ? await api(`/admin/blog/${editId}`, { method: "PUT", body, token }) : await api("/admin/blog", { method: "POST", body, token });
    setBusy(false);
    if (res.status === 401) return logout();
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    if (editId) {
      setMsg({ text: "Saved.", bad: false });
    } else {
      setMsg({ text: "Guide created. Add a photo below if you like.", bad: false });
      setEditId(res.data.id);
      setPhotos([]);
    }
    load();
  }

  async function remove(row) {
    if (!window.confirm(`Delete "${row.title}"? This cannot be undone.`)) return;
    const res = await api(`/admin/blog/${row.id}`, { method: "DELETE", token });
    if (!res.ok) return setMsg({ text: res.error, bad: true });
    if (editId === row.id) reset();
    load();
  }

  if (role !== "admin") return <p className="empty">Only the Hill Booker admin can open this page.</p>;
  return (
    <>
      <p className="meta"><Link href="/dashboard">← Dashboard</Link></p>
      <h1 className="section-title">Travel guides</h1>
      <p className="meta">
        Guides show at hillbooker.com/blog and help people find you on Google. Write in plain text. Put <b>## </b> before a heading, start a line with <b>- </b> for a list, and leave a blank line between paragraphs. The first photo is the cover.
      </p>

      <form className="card" style={{ padding: "1rem", display: "grid", gap: "0.8rem", margin: "1rem 0" }} onSubmit={save} noValidate>
        <h2 className="mini-title">{editId ? "Edit guide" : "New guide"}</h2>
        <div className="dates-bar">
          <label className="field"><span>Title</span><input value={form.title} onChange={set("title")} placeholder="Best time to visit Munnar" maxLength={140} /></label>
          <label className="field"><span>City (optional, adds a link to stays there)</span><input value={form.city} onChange={set("city")} placeholder="Munnar" maxLength={80} /></label>
        </div>
        <label className="field"><span>One-line summary</span><input value={form.summary} onChange={set("summary")} maxLength={300} placeholder="Weather, crowds and prices month by month" /></label>
        <label className="field"><span>Guide text</span><textarea rows={16} value={form.body} onChange={set("body")} placeholder={"Munnar is green all year, but the months differ a lot.\n\n## October to February\n\nCool weather and clear views.\n\n## Good to know\n\n- Book early for December\n- Carry a light jacket"} /></label>
        <label className="check"><input type="checkbox" checked={form.published} onChange={set("published")} /><span>Publish this guide on the website</span></label>
        <div className="actions">
          <button type="submit" className="btn btn-primary btn-small" disabled={busy}>{busy ? "Saving…" : editId ? "Save changes" : "Create guide"}</button>
          {editId && <button type="button" className="btn btn-small" onClick={reset}>New guide instead</button>}
        </div>
        {msg.text && <p className={msg.bad ? "form-error" : "ok"} role={msg.bad ? "alert" : "status"}>{msg.text}</p>}
        {editId && (
          <div>
            <h3 className="mini-title">Photos</h3>
            <PhotoManager base={`/admin/blog/${editId}`} photos={photos} token={token} onChange={() => loadPhotos(editId)} onAuthError={onAuthError} />
          </div>
        )}
      </form>

      {rows === null ? (
        <p className="meta">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="empty">No guides yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.7rem" }}>
          {rows.map((p) => (
            <li key={p.id} className="card" style={{ padding: "0.9rem", opacity: p.published ? 1 : 0.65 }}>
              <p className="row-name">{p.title}{!p.published && " · draft"}</p>
              <p className="meta">{p.city || "No city"}</p>
              <div className="actions">
                <button type="button" className="btn btn-small" onClick={() => edit(p)}>Edit</button>
                {p.published && <Link className="btn btn-small" href={`/blog/${p.slug}`}>View</Link>}
                <button type="button" className="btn btn-small" onClick={() => remove(p)}>Delete</button>
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
      <Blog />
    </Guard>
  );
}
