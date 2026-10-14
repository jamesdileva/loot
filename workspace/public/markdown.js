export function renderMarkdown(src) {
  const lines = String(src ?? "").replace(/\r\n?/g, "\n").split("\n");

  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const ALLOWED_HREF = /^(https?:|mailto:|#|\/|\.\.?\/)/i;
  const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

  function safeHref(raw) {
    const href = raw.trim().replace(/["'`<>]/g, "");
    if (!href) return "";
    if (SCHEME.test(href) && !ALLOWED_HREF.test(href)) return "";
    return href;
  }

  function inline(raw) {
    const s = esc(raw);
    const codes = [];
    const stepped = s.replace(/`([^`]+)`/g, (_, c) => {
      codes.push(c);
      return `\u0000${codes.length - 1}\u0000`;
    });
    return stepped
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, href) => {
        const safe = safeHref(href);
        return safe ? `<a href="${safe}">${t}</a>` : t;
      })
      .replace(/\u0000(\d+)\u0000/g, (_, d) => `<code>${codes[Number(d)]}</code>`);
  }

  function isBlockStart(line) {
    return (
      /^(#{1,6})\s/.test(line) ||
      /^\s*[-*]\s+/.test(line) ||
      /^\s*\d+\.\s+/.test(line) ||
      /^```$/.test(line.trim())
    );
  }

  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^```$/.test(line.trim())) {
      const block = [];
      i += 1;
      while (i < lines.length && !/^```$/.test(lines[i].trim())) {
        block.push(lines[i]);
        i += 1;
      }
      i += 1;
      out.push(`<pre><code>${esc(block.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const re = ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-*]\s+(.+)$/;
      const items = [];
      while (i < lines.length && re.test(lines[i])) {
        items.push(inline(lines[i].match(re)[1]));
        i += 1;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((it) => `<li>${it}</li>`).join("")}</${tag}>`);
      continue;
    }

    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      para.push(inline(lines[i]));
      i += 1;
    }
    out.push(`<p>${para.join("<br>")}</p>`);
  }

  return out.join("\n");
}