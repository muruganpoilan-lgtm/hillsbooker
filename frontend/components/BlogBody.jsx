// Turns the plain text of a guide into paragraphs, headings and bullet lists.
// "## Heading" is a heading, lines starting with "- " are a list, a blank line starts a new paragraph. No HTML is accepted.
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
                <li key={j}>{l.slice(2)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="prose">
            {lines.join(" ")}
          </p>
        );
      })}
    </div>
  );
}
