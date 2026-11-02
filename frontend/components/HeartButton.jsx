"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useLang } from "./LangProvider";
import { api } from "../lib/api";

// One shared list of saved place ids for the whole page, so every heart agrees with the others.
let saved = null;
let loadedFor = null;
let inflight = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

async function load(token) {
  if (loadedFor === token && saved) return;
  if (inflight && loadedFor === token) return inflight;
  loadedFor = token;
  inflight = api("/wishlist/ids", { token }).then((res) => {
    saved = new Set(res.ok ? res.data.ids : []);
    inflight = null;
    emit();
  });
  return inflight;
}

export default function HeartButton({ id, name = "this place", className = "" }) {
  const { ready, token } = useAuth();
  const router = useRouter();
  const { t } = useLang();
  const [, force] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      saved = null;
      loadedFor = null;
      return;
    }
    load(token);
  }, [ready, token]);

  const on = !!(token && saved && saved.has(id));

  async function toggle(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!token) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    if (busy) return;
    setBusy(true);
    if (!saved) saved = new Set();
    const wasOn = saved.has(id);
    if (wasOn) saved.delete(id);
    else saved.add(id);
    emit();
    const res = await api(`/wishlist/${id}`, { method: wasOn ? "DELETE" : "PUT", token });
    if (!res.ok) {
      if (wasOn) saved.add(id);
      else saved.delete(id);
      emit();
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      className={`heart ${on ? "on" : ""} ${className}`}
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? t("heart.remove", { name }) : t("heart.save", { name })}
      title={on ? t("heart.titleOn") : t("heart.titleOff")}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M12 20.5s-8-5-8-10.7A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.8c0 5.7-8 10.7-8 10.7z" />
      </svg>
    </button>
  );
}
