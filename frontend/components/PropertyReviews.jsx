// The Reviews tab on a property page. Server component: the reviews come with the page, so Google can read them too.

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(ym) {
  const [y, m] = String(ym || "").split("-");
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MONTHS_EN[i]} ${y}` : "";
}

export function Stars({ value, label }) {
  const full = Math.round(Number(value) || 0);
  return (
    <span className="stars" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden="true" className={i <= full ? "on" : ""}>
          ★
        </span>
      ))}
    </span>
  );
}

export default function PropertyReviews({ data, t }) {
  const count = data ? Number(data.rating_count) : 0;
  const list = data ? data.reviews : [];

  return (
    <section className="prop-section" id="reviews">
      <h2>{t("rev.title")}</h2>

      {!data && <p className="meta">{t("rev.loadFail")}</p>}

      {data && count === 0 && (
        <div className="rev-empty">
          <p>{t("rev.none")}</p>
          <p className="meta">{t("rev.howTo")}</p>
        </div>
      )}

      {data && count > 0 && (
        <>
          <div className="rev-summary">
            <div className="rev-big">
              <b className="score">{Number(data.rating_avg).toFixed(1)}</b>
              <div>
                <Stars value={data.rating_avg} label={t("rev.outOf", { r: Number(data.rating_avg).toFixed(1) })} />
                <p className="meta">{t("rev.basedOn", { reviews: t.n("unit.review", count) })}</p>
              </div>
            </div>
            <ul className="rev-bars" aria-label={t("rev.breakdown")}>
              {["5", "4", "3", "2", "1"].map((k) => {
                const n = Number(data.breakdown[k] || 0);
                const pct = count ? Math.round((n / count) * 100) : 0;
                return (
                  <li key={k}>
                    <span className="rev-bar-label">{t("rev.starN", { n: k })}</span>
                    <span className="rev-bar" aria-hidden="true">
                      <i style={{ width: `${pct}%` }} />
                    </span>
                    <span className="rev-bar-n">{n}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <ul className="rev-list">
            {list.map((r) => (
              <li key={r.id} className="rev-item">
                <div className="rev-head">
                  <span className="rev-avatar" aria-hidden="true">
                    {(r.guest || "G").charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <b>{r.guest}</b>
                    <p className="meta">
                      {t("rev.stayed", { month: monthLabel(r.stayed), room: r.room_type })}
                    </p>
                  </div>
                  <Stars value={r.rating} label={t("rev.outOf", { r: r.rating })} />
                </div>
                {r.comment && <p className="rev-text">{r.comment}</p>}
              </li>
            ))}
          </ul>
          {count > list.length && <p className="meta">{t("rev.latest", { n: list.length, total: count })}</p>}
        </>
      )}
    </section>
  );
}
