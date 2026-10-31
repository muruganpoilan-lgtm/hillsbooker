import { HELP_VIDEOS } from "../lib/helpVideos";

export default function HelpVideos() {
  if (!HELP_VIDEOS.length) return null;
  return (
    <section className="page hb-section">
      <h2 className="hb-title">How it works</h2>
      <p className="hb-lead">Short videos to help you get started</p>
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
              {v.for ? <span>{v.for}</span> : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
