"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "./LangProvider";
import { api } from "../lib/api";

// "Search by property name" box under the booking slip. Suggests matching hotels/homestays as you type;
// picking one opens that property, pressing Search lists every match.
// onPick(property) and onSearch(text) are given by the slip so the chosen dates and guests carry over.
export default function PropertyNameSearch({ initial = "", onPick, onSearch }) {
  const { t } = useLang();
  const [text, setText] = useState(initial);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);

  // Ask the server for suggestions a moment after typing stops.
  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) {
      setItems([]);
      return;
    }
    let stale = false;
    const timer = setTimeout(async () => {
      const res = await api(`/property-names?q=${encodeURIComponent(q)}`);
      if (!stale) {
        setItems(res.ok ? res.data : []);
        setActive(-1);
      }
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [text]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => boxRef.current && !boxRef.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function go() {
    if (active >= 0 && items[active]) return onPick(items[active]);
    if (text.trim().length >= 2) onSearch(text.trim());
  }

  function onKey(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && items.length > 0;

  return (
    <div className="pname" ref={boxRef}>
      <label className="pname-label" htmlFor="pname-input">
        {t("pname.label")}
      </label>
      <div className="pname-row">
        <div className="pname-box">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 10h.01M15 10h.01" />
          </svg>
          <input
            id="pname-input"
            type="search"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
            placeholder={t("pname.placeholder")}
            autoComplete="off"
            role="combobox"
            aria-expanded={showList}
            aria-controls="pname-list"
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `pname-opt-${active}` : undefined}
          />
        </div>
        <button type="button" className="btn pname-go" onClick={go}>
          {t("pname.find")}
        </button>
      </div>
      {showList && (
        <ul className="pname-list" id="pname-list" role="listbox">
          {items.map((p, i) => (
            <li
              key={p.id}
              id={`pname-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "on" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(p);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <strong>{p.name}</strong>
              <span>
                {p.city} · {t(`type.${p.type}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && text.trim().length >= 2 && items.length === 0 && <p className="pname-empty">{t("pname.none")}</p>}
    </div>
  );
}
