import Link from "next/link";

// Turns the plain text of a guide into paragraphs, headings and bullet lists.
// "## Heading" is a heading, lines starting with "- " are a list, a blank line starts a new paragraph. No HTML is accepted.
// [words](/page) makes a link. Only links to pages on this site or to our WhatsApp are allowed.

const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

function safeHref(href) {
  if (href.startsWith("/") && !href.startsWith("//")) return { href, internal: true };
  if (/^https:\/\/wa\.me\/\d+(\?[^\s]*)?$/.test(href)) return { href, internal: false };
  return null;
}

function Inline({ text }) {
  const out = [];
  let last = 0;
  let m;
  LINK.lastIndex = 0;
  while ((m = LINK.exec(text))) {
    const target = safeHref(m[2]);
    if (!target) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      target.internal ? (
        <Link key={m.index} href={target.href}>{m[1]}</Link>
      ) : (
        <a key={m.index} href={target.href} target="_blank" rel="noopener noreferrer">{m[1]}</a>
      )
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function BlogBody({ text }) {
  const blocks = String(text || "")
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <div className="blog-body">
      {blocks.map((b, i) => {
        if (b.startsWith("## ")) return <h2 key={i}>{b.slice(3).trim()}</h2>;
        const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}><Inline text={l.slice(2)} /></li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="prose">
            <Inline text={lines.join(" ")} />
          </p>
        );
      })}
    </div>
  );
}
