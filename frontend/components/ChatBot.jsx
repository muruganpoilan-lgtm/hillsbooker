"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLang } from "./LangProvider";
import { FALLBACK, GREETING, TOPICS, UI, WHATSAPP_LINK, findTopic } from "../lib/faq";

// A small help chat in the corner of every page. It answers from the ready-made answers in lib/faq.js,
// so it is free, instant and never makes things up. Anything it cannot answer is handed to WhatsApp.
export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const { lang, setLang } = useLang(); // the chat speaks the language chosen for the whole site
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState([]); // {from: "bot" | "me", text, links?}
  const endRef = useRef(null);
  const t = UI[lang];

  useEffect(() => {
    // Site language changed while only the greeting is on screen: say it again in the new language.
    setMsgs((m) => (m.length === 1 && m[0].from === "bot" ? [{ from: "bot", text: GREETING[lang] }] : m));
  }, [lang]);

  useEffect(() => {
    if (open && msgs.length === 0) setMsgs([{ from: "bot", text: GREETING[lang] }]);
  }, [open, msgs.length, lang]);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ block: "end" });
  }, [msgs, open]);

  function switchLang(next) {
    setLang(next);
    setMsgs((m) => (m.length === 1 ? [{ from: "bot", text: GREETING[next] }] : m));
  }

  function answer(topic, question) {
    const reply = topic
      ? { from: "bot", text: topic.a[lang], links: topic.links || [] }
      : { from: "bot", text: FALLBACK[lang], links: [{ label: { en: "Chat on WhatsApp", ta: "WhatsApp-ல் பேசுங்கள்" }, href: WHATSAPP_LINK(`Hi Hill Booker, ${question}`), external: true }] };
    setMsgs((m) => [...m, { from: "me", text: question }, reply]);
  }

  function send(e) {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;
    setText("");
    answer(findTopic(q), q);
  }

  return (
    <div className="hb-chat" lang={lang}>
      {open && (
        <section className="hb-chat-panel" role="dialog" aria-label={t.title}>
          <header className="hb-chat-head">
            <b>{t.title}</b>
            <span className="hb-chat-lang" role="group" aria-label="Language">
              <button type="button" className={lang === "en" ? "on" : ""} onClick={() => switchLang("en")}>
                EN
              </button>
              <button type="button" className={lang === "ta" ? "on" : ""} onClick={() => switchLang("ta")}>
                தமிழ்
              </button>
            </span>
            <button type="button" className="hb-chat-x" onClick={() => setOpen(false)} aria-label={t.close}>
              ×
            </button>
          </header>
          <div className="hb-chat-body" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={`hb-msg ${m.from}`}>
                <p>{m.text}</p>
                {m.links && m.links.length > 0 && (
                  <p className="hb-msg-links">
                    {m.links.map((l) =>
                      l.external ? (
                        <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">
                          {l.label[lang]}
                        </a>
                      ) : (
                        <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
                          {l.label[lang]}
                        </Link>
                      )
                    )}
                  </p>
                )}
              </div>
            ))}
            <div className="hb-chips" aria-label={t.quick}>
              {TOPICS.map((tp) => (
                <button key={tp.id} type="button" onClick={() => answer(tp, tp.q[lang])}>
                  {tp.q[lang]}
                </button>
              ))}
            </div>
            <div ref={endRef} />
          </div>
          <form className="hb-chat-form" onSubmit={send}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.placeholder} maxLength={200} aria-label={t.placeholder} />
            <button type="submit">{t.send}</button>
          </form>
        </section>
      )}
      <button type="button" className="hb-chat-fab" onClick={() => setOpen((o) => !o)} aria-label={open ? t.close : t.open} aria-expanded={open}>
        {open ? "×" : "💬"}
      </button>
    </div>
  );
}
