"use client";

import { useEffect, useRef, useState } from "react";

// A row of cards that scrolls sideways, with round arrow buttons like Booking.com. On phones you swipe instead.
export default function HomeRow({ children, label }) {
  const ref = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      setCanLeft(el.scrollLeft > 4);
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  const move = (dir) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };

  return (
    <div className="hr-wrap">
      {canLeft && (
        <button type="button" className="hr-arrow hr-left" aria-label="Previous" onClick={() => move(-1)}>
          ‹
        </button>
      )}
      <div className="hr-track" ref={ref} role="list" aria-label={label}>
        {children}
      </div>
      {canRight && (
        <button type="button" className="hr-arrow hr-right" aria-label="Next" onClick={() => move(1)}>
          ›
        </button>
      )}
    </div>
  );
}
