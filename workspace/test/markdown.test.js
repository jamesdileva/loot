import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../public/markdown.js";

test("raw HTML is escaped, not emitted", () => {
  const html = renderMarkdown("<script>alert(1)</script>");
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("event-handler markup is escaped into inert text", () => {
  const html = renderMarkdown("<img src=x onerror=alert(1)>");
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test("javascript: links are dropped, text is kept", () => {
  const html = renderMarkdown("[click](javascript:alert(1))");
  assert.doesNotMatch(html, /href=/);
  assert.match(html, /click/);
});

test("data: links are dropped", () => {
  const html = renderMarkdown("[bad](data:text/html,<script>x</script>)");
  assert.doesNotMatch(html, /href=/);
});

test("safe link schemes are preserved", () => {
  const html = renderMarkdown("[home](/notes) and [web](https://example.com/page)");
  assert.match(html, /href="\/notes"/);
  assert.match(html, /href="https:\/\/example\.com\/page"/);
});

test("href quotes cannot break the attribute", () => {
  const html = renderMarkdown('[x](https://a.com/" onclick="alert(1))');
  assert.doesNotMatch(html, /"\s*onclick\s*=/);
  assert.match(html, /href="https:\/\/a\.com\/&quot; onclick=&quot;alert\(1"/);
});

test("renders headings, bold, italic, code and lists", () => {
  const html = renderMarkdown("# Title\n\n- one\n- two\n\n`c()` and **bold** and *ita*");
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<code>c\(\)<\/code>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>ita<\/em>/);
});

test("markup inside a code span stays escaped", () => {
  const html = renderMarkdown("`<b>x</b>`");
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /<code>&lt;b&gt;x&lt;\/b&gt;<\/code>/);
});

test("fenced code block keeps its content escaped", () => {
  const html = renderMarkdown("```\n<script>x</script>\n```");
  assert.match(html, /<pre><code>/);
  assert.doesNotMatch(html, /<script>/);
});

test("ordered lists render as ol", () => {
  const html = renderMarkdown("1. one\n2. two");
  assert.match(html, /<ol><li>one<\/li><li>two<\/li><\/ol>/);
});

test("notes content round-trips through the renderer text", () => {
  const src = "todo:\n- finish slice\n- ship it";
  const html = renderMarkdown(src);
  assert.match(html, /finish slice/);
  assert.match(html, /ship it/);
});

test("empty and missing input render empty", () => {
  assert.equal(renderMarkdown(""), "");
  assert.equal(renderMarkdown(undefined), "");
  assert.equal(renderMarkdown(null), "");
});