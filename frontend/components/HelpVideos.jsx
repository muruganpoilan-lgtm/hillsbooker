import { HELP_VIDEOS } from "../lib/helpVideos";
import { getT } from "../lib/lang";

const FOR = { "For guests": "videos.forGuests", "For hosts": "videos.forHosts", "For guests and hosts": "videos.forBoth" };

export default async function HelpVideos() {
  if (!HELP_VIDEOS.length) return null;
  const t = await getT();
  return (
    <section className="page hb-section">
      <h2 className="hb-title">{t("videos.title")}</h2>
      <p className="hb-lead">{t("videos.lead")}</p>
      <div className="hb-videos">
        {HELP_VIDEOS.map((v) => (
          <figure key={v.id} className="hb-video">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${v.id}`}
              title={v.title}
              loading="lazy"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
            <figcaption>
              <b>{v.title}</b>
              {v.for ? <span>{FOR[v.for] ? t(FOR[v.for]) : v.for}</span> : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
