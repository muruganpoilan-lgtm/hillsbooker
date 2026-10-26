// Where the site lives. Search engines and link previews need full addresses.
export const SITE_URL = (process.env.SITE_URL || "https://hillbooker.com").replace(/\/$/, "");
export const SITE_NAME = "Hill Booker";

export const slugify = (s) =>
  String(s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Short introductions for the places on the home page. Keep them general and true; the property list does the rest.
export const CITY_INFO = {
  ooty: { name: "Ooty", blurb: "Ooty, in the Nilgiri hills of Tamil Nadu, is known for cool weather, tea estates, gardens and misty viewpoints." },
  kodaikanal: { name: "Kodaikanal", blurb: "Kodaikanal is a hill station in Tamil Nadu's Palani hills, known for its star-shaped lake, pine forests and viewpoints." },
  munnar: { name: "Munnar", blurb: "Munnar, in the high ranges of Kerala, is known for rolling tea plantations, cool air and mountain views." },
  yercaud: { name: "Yercaud", blurb: "Yercaud is a quiet hill station in the Shevaroy hills of Tamil Nadu, with coffee estates, a lake and cool weather." },
  coorg: { name: "Coorg", blurb: "Coorg (Kodagu) in Karnataka is known for coffee estates, misty hills, waterfalls and homestays." },
  valparai: { name: "Valparai", blurb: "Valparai, in the Anamalai hills of Tamil Nadu, is surrounded by tea estates, forests and wildlife, and is far from the crowds." },
  thekkady: { name: "Thekkady", blurb: "Thekkady in Kerala is known for the Periyar forest, spice plantations and boat rides on the lake." },
  wayanad: { name: "Wayanad", blurb: "Wayanad in Kerala has forests, waterfalls, spice and coffee plantations, and many homestays." },
  alleppey: { name: "Alleppey", blurb: "Alleppey (Alappuzha) in Kerala is known for its backwaters, canals and houseboat stays." },
  kovalam: { name: "Kovalam", blurb: "Kovalam in Kerala is a beach town with a sheltered coast, lighthouse and seaside stays." },
  varkala: { name: "Varkala", blurb: "Varkala in Kerala is known for its cliff-top beach, cafes and sea views." },
  pondicherry: { name: "Pondicherry", blurb: "Pondicherry (Puducherry) is a coastal town with a French-era quarter, seafront walks and cafes." },
  goa: { name: "Goa", blurb: "Goa on India's west coast is known for its beaches, old churches, markets and nightlife." },
};

export function jsonLd(data) {
  // Escape "<" so a property name can never close the script tag.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
