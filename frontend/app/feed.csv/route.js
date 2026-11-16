import { api } from "../../lib/api";
import { SITE_URL } from "../../lib/seo";

// The product feed ChatGPT reads, served at https://hillbooker.com/feed.csv
//
// One row per trip package. OpenAI's feed requires eleven columns on every row:
// item_id, title, description, url, brand, seller_name, image_url, availability,
// price, target_countries and store_country. A row missing any of them is thrown
// away, so every value below is either real or the row is left out.
//
// Rooms are deliberately not in here. A room's price and availability change
// with the dates, and a feed can only state one price, so any row we wrote for
// a room would be wrong most of the time.

export const dynamic = "force-dynamic";

// CSV rule: wrap in quotes, and double any quote inside. Newlines and commas are
// then safe. A leading =, +, - or @ is prefixed with a space so a spreadsheet
// opening this file treats it as text rather than a formula.
function cell(value) {
  let s = value === null || value === undefined ? "" : String(value);
  s = s.replace(/\r\n|\r|\n/g, " ").replace(/\s+/g, " ").trim();
  if (/^[=+\-@]/.test(s)) s = " " + s;
  return `"${s.replace(/"/g, '""')}"`;
}

function clip(s, max) {
  const t = String(s || "").trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

// What a reader needs to know, in plain words, from what the package actually has.
function describe(p) {
  const bits = [];
  const nights = Number(p.nights) || 0;
  const days = Number(p.days) || 0;
  if (days) bits.push(`${days} day${days === 1 ? "" : "s"}${nights ? ` and ${nights} night${nights === 1 ? "" : "s"}` : ""} in ${p.destination}`);
  if (p.summary) bits.push(String(p.summary).trim());
  const min = Number(p.min_people) || 0;
  if (min > 1) bits.push(`For ${min} people or more.`);
  bits.push("The price shown is per person.");
  bits.push("Booked through Hill Booker; the team confirms dates and the final price by phone before anything is paid.");
  return clip(bits.join(" "), 5000);
}

const COLUMNS = [
  "item_id",
  "title",
  "description",
  "url",
  "brand",
  "seller_name",
  "image_url",
  "availability",
  "price",
  "product_category",
  "target_countries",
  "store_country",
];

export async function GET() {
  const res = await api("/packages");
  const packages = res.ok && Array.isArray(res.data) ? res.data : [];

  const rows = [COLUMNS.map(cell).join(",")];
  let skipped = 0;

  for (const p of packages) {
    const price = Number(p.price_per_person);
    const image = p.photo ? String(p.photo) : "";

    // Every one of the eleven is required. No price or no photo means the row
    // would be rejected, so it is left out rather than sent half empty.
    if (!p.slug || !p.title || !image || !(price > 0)) {
      skipped += 1;
      continue;
    }

    rows.push(
      [
        p.slug,
        clip(`${p.title} — ${p.destination}`, 150),
        describe(p),
        `${SITE_URL}/packages/${p.slug}`,
        "Hill Booker",
        "Hill Booker",
        image.startsWith("http") ? image : `${SITE_URL}${image}`,
        "in_stock",
        `${price.toFixed(2)} INR`,
        "Travel > Tour Packages",
        // An array field, so in a CSV cell it is JSON, not a bare code.
        '["IN"]',
        "IN",
      ]
        .map(cell)
        .join(","),
    );
  }

  return new Response(rows.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'inline; filename="feed.csv"',
      // Fetched by OpenAI on a schedule, so a short cache is enough and a
      // price change reaches them within the hour.
      "Cache-Control": "public, max-age=900",
      "X-Packages-Listed": String(rows.length - 1),
      "X-Packages-Skipped": String(skipped),
    },
  });
}
