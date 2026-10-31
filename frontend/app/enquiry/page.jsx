"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, todayISO } from "../../lib/api";

function Form() {
  const params = useSearchParams();
  const [kind, setKind] = useState(params.get("kind") === "corporate" ? "corporate" : "group");
  const [f, setF] = useState({ name: "", company: "", phone: "", email: "", destination: "", start_date: "", people: "", budget: "", notes: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const set = (k) => (e) => {
    setF({ ...f, [k]: e.target.value });
    setError("");
  };

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const body = { kind, ...f, people: f.people ? Number(f.people) : null, start_date: f.start_date || null };
    for (const k of ["company", "email", "destination", "budget", "notes"]) if (!body[k]) body[k] = null;
    const res = await api("/enquiries", { method: "POST", body });
    setBusy(false);
    if (!res.ok) return setError(res.error || "We could not send this. Please call +91 83008 41442");
    setDone(true);
  }

  if (done)
    return (
      <div className="prose">
        <h1 className="section-title">Thank you</h1>
        <p>We have your enquiry. Our team will call you on {f.phone} with a quote, usually within a few hours.</p>
        <p>
          In a hurry? Call or WhatsApp <a href="tel:+918300841442">+91 83008 41442</a>.
        </p>
      </div>
    );

  return (
    <div className="narrow">
      <h1 className="section-title">{kind === "corporate" ? "Corporate tour enquiry" : "Group tour enquiry"}</h1>
      <p className="meta">Tell us what you need. We will call you with a quote. There is nothing to pay now.</p>
      <div className="actions" style={{ margin: "0.8rem 0" }}>
        <button type="button" className={`btn btn-small ${kind === "group" ? "btn-primary" : ""}`} onClick={() => setKind("group")}>
          Group tour
        </button>
        <button type="button" className={`btn btn-small ${kind === "corporate" ? "btn-primary" : ""}`} onClick={() => setKind("corporate")}>
          Corporate tour
        </button>
      </div>
      <form onSubmit={submit} className="stack" style={{ display: "grid", gap: "0.8rem" }}>
        <label className="field"><span>Your name</span><input value={f.name} onChange={set("name")} required minLength={2} maxLength={80} /></label>
        {kind === "corporate" && (
          <label className="field"><span>Company name</span><input value={f.company} onChange={set("company")} maxLength={120} /></label>
        )}
        <label className="field"><span>Phone or WhatsApp number</span><input type="tel" value={f.phone} onChange={set("phone")} required maxLength={20} /></label>
        <label className="field"><span>Email (optional)</span><input type="email" value={f.email} onChange={set("email")} maxLength={120} /></label>
        <label className="field"><span>Where do you want to go?</span><input value={f.destination} onChange={set("destination")} placeholder="e.g. Munnar, Ooty, Goa" maxLength={120} /></label>
        <label className="field"><span>Start date (roughly)</span><input type="date" min={todayISO()} value={f.start_date} onChange={set("start_date")} /></label>
        <label className="field"><span>Number of people</span><input type="number" min={1} max={5000} value={f.people} onChange={set("people")} /></label>
        <label className="field"><span>Budget (optional)</span><input value={f.budget} onChange={set("budget")} placeholder="e.g. Rs 1,500 per person" maxLength={60} /></label>
        <label className="field"><span>Anything else we should know</span><textarea rows={4} value={f.notes} onChange={set("notes")} maxLength={1000} /></label>
        <input type="text" name="website" value={f.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, width: 0, opacity: 0 }} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="actions">
          <button type="submit" className="btn btn-primary" aria-busy={busy}>{busy ? "Sending…" : "Send enquiry"}</button>
        </div>
      </form>
    </div>
  );
}

export default function EnquiryPage() {
  return (
    <main className="page">
      <Suspense fallback={null}>
        <Form />
      </Suspense>
    </main>
  );
}
