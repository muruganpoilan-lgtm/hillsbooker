"use client";

import { useLang } from "./LangProvider";

// Bed types a host can choose, with the usual Indian mattress size (inches) shown on hover.
export const BED_TYPES = [
  { id: "single", size: "36 × 72 in" },
  { id: "double", size: "48 × 72 in" },
  { id: "queen", size: "60 × 78 in" },
  { id: "king", size: "72 × 78 in" },
  { id: "twin", size: "2 × 36 × 72 in" },
  { id: "bunk", size: "36 × 72 in" },
];

// Bed symbol: a wider bed drawing for bigger beds, two small beds for twin, stacked for bunk.
export function BedIcon({ type, size = 22 }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  if (type === "twin") {
    return (
      <svg width={size * 1.4} height={size} viewBox="0 0 34 24" aria-hidden="true" {...common}>
        <path d="M2 19V9M2 15h12v4M14 15V12a2 2 0 0 0-2-2H6M5 12.5h3" />
        <path d="M20 19V9M20 15h12v4M32 15V12a2 2 0 0 0-2-2h-6M23 12.5h3" />
      </svg>
    );
  }
  if (type === "bunk") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...common}>
        <path d="M3 3v19M21 3v19M3 9h18M3 18h18M6 7h4M6 16h4" />
      </svg>
    );
  }
  const w = { single: 12, double: 16, queen: 18, king: 20 }[type] || 16;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...common}>
      <path d={`M2 19V7M2 15h${w}v4M${2 + w} 15v-3a2 2 0 0 0-2-2H10a2 2 0 0 0-2 2v3`} />
      <circle cx="5.5" cy="12" r="1.6" />
    </svg>
  );
}

// "1 queen bed" with the symbol, for the guest room list.
export default function BedInfo({ type, count = 1 }) {
  const { t } = useLang();
  if (!type) return null;
  const info = BED_TYPES.find((b) => b.id === type);
  return (
    <p className="bed-info" title={info ? info.size : undefined}>
      <BedIcon type={type} />
      <span>{t.n(`bed.${type}`, count || 1)}</span>
    </p>
  );
}
