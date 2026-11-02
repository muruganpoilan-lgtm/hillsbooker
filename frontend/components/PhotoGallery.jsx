"use client";

import { useRef } from "react";
import Ridge from "./Ridge";
import { useLang } from "./LangProvider";

// One large photo, four smaller ones, and a full-screen viewer for the rest.
export default function PhotoGallery({ photos, name, seed }) {
  const dialog = useRef(null);
  const { t } = useLang();
  if (!photos.length) {
    return (
      <div className="gallery gallery-empty">
        <Ridge seed={seed} w={800} h={400} className="gallery-ridge" />
        <p>{t("gal.none")}</p>
      </div>
    );
  }
  const shown = photos.slice(0, 5);
  const open = () => dialog.current && dialog.current.showModal();
  return (
    <>
      <div className={`gallery gallery-${Math.min(shown.length, 5)}`}>
        {shown.map((url, i) => (
          <button type="button" key={url} className="gallery-cell" onClick={open} aria-label={t("gal.open", { i: i + 1, n: photos.length })}>
            <img src={url} alt={i === 0 ? name : ""} loading={i === 0 ? "eager" : "lazy"} />
          </button>
        ))}
        {photos.length > 1 && (
          <button type="button" className="gallery-all" onClick={open}>
            {t("gal.all", { n: photos.length })}
          </button>
        )}
      </div>
      <dialog ref={dialog} className="viewer" aria-label={t("gal.of", { name })} onClick={(e) => e.target === dialog.current && dialog.current.close()}>
        <button type="button" className="viewer-close btn btn-small" onClick={() => dialog.current.close()}>
          {t("gal.close")}
        </button>
        <div className="viewer-list">
          {photos.map((url, i) => (
            <img key={url} src={url} alt={t("gal.alt", { name, i: i + 1 })} loading="lazy" />
          ))}
        </div>
      </dialog>
    </>
  );
}
