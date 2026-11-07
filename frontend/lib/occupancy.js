// Guests in a search or booking: adults, each child's age, and how many rooms.
// In URLs: guests = adults + children (kept for older links), children = how many, ages = "2,12", rooms = "1".
export const MAX_ADULTS = 30;
export const MAX_CHILDREN = 10;
export const MAX_ROOMS = 10;

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

// Read from URL search params (a URLSearchParams or a plain object of strings). A child whose age isn't in the
// link gets -1 ("not chosen yet"), so the picker asks for it before booking.
export function readOccupancy(get) {
  const g = typeof get === "function" ? get : (k) => (get && get[k] != null ? String(get[k]) : null);
  const guests = clamp(Number(g("guests")) || 2, 1, MAX_ADULTS + MAX_CHILDREN);
  const kids = clamp(Number(g("children")) || 0, 0, Math.min(MAX_CHILDREN, guests - 1));
  const given = String(g("ages") || "")
    .split(",")
    .filter((s) => s.trim() !== "")
    .map((s) => clamp(Math.trunc(Number(s)), 0, 17))
    .filter((n) => Number.isFinite(n));
  const ages = Array.from({ length: kids }, (_, i) => (i < given.length ? given[i] : -1));
  const rooms = clamp(Number(g("rooms")) || 1, 1, MAX_ROOMS);
  return { adults: clamp(guests - kids, 1, MAX_ADULTS), ages, rooms };
}

// Write into a URLSearchParams.
export function writeOccupancy(params, { adults, ages, rooms }) {
  params.set("guests", String(adults + ages.length));
  if (ages.length > 0) {
    params.set("children", String(ages.length));
    const known = ages.filter((a) => a >= 0);
    if (known.length === ages.length) params.set("ages", ages.join(","));
  }
  if (rooms > 1) params.set("rooms", String(rooms));
  return params;
}

export const occupancyLabel = (t, { adults, ages, rooms }) =>
  [t.n("unit.adult", adults), t.n("unit.child", ages.length), t.n("unit.room", rooms)].join(" · ");

export const agesComplete = (ages) => ages.every((a) => a >= 0);
