"use client";

import { useState } from "react";

// Shows the video's thumbnail (about 20 KB) with a play button. The real YouTube player, about 1 MB, loads only
// when someone taps it, so the home page stays light for everyone else.
export default function LiteYouTube({ id, title }) {
  const [on, setOn] = useState(false);
  if (on) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
        title={title}
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return (
    <button type="button" className="lite-yt" onClick={() => setOn(true)} aria-label={`Play video: ${title}`}>
      <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" />
      <span className="lite-yt-play" aria-hidden="true" />
    </button>
  );
}
