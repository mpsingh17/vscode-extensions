import { test } from "node:test";
import assert from "node:assert/strict";

import { renderMarkdown } from "../src/markdown";

test("extracts headings with levels and slugs from tokens", () => {
  const model = renderMarkdown(
    "# Title\n\n## Section One\n\ntext\n\n## Section One\n",
  );
  assert.equal(model.headings.length, 3);
  assert.deepEqual(
    model.headings.map((h) => h.level),
    [1, 2, 2],
  );
  assert.equal(model.headings[0].slug, "title");
});

test("deduplicates repeated heading slugs deterministically", () => {
  const model = renderMarkdown("## Repeat\n\n## Repeat\n\n## Repeat\n");
  const slugs = model.headings.map((h) => h.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.deepEqual(slugs, ["repeat", "repeat-1", "repeat-2"]);
});

test('does not treat "#" lines inside fenced code blocks as headings', () => {
  const model = renderMarkdown("# Real Heading\n\n```\n# Not a heading\n```\n");
  assert.equal(model.headings.length, 1);
  assert.equal(model.headings[0].text, "Real Heading");
});

test("records the source line for each heading", () => {
  const model = renderMarkdown("para\n\n## Second Line Heading\n");
  assert.equal(model.headings[0].line, 2);
});

test("marks whitespace-only documents as empty", () => {
  const model = renderMarkdown("   \n\n  ");
  assert.equal(model.isEmpty, true);
  assert.equal(model.html, "");
});

test("reports no headings for heading-less documents without marking them empty", () => {
  const model = renderMarkdown("Just a paragraph, nothing else.");
  assert.equal(model.headings.length, 0);
  assert.equal(model.isEmpty, false);
});

test("renders inline HTML as inert escaped text", () => {
  const model = renderMarkdown("<script>alert(1)</script>\n\nHello");
  assert.ok(!model.html.includes("<script>alert"));
  assert.ok(model.html.includes("&lt;script&gt;"));
});

test("escapes unknown fence languages instead of executing markup", () => {
  const model = renderMarkdown("```unknownlang\n<b>bold</b>\n```\n");
  assert.ok(model.html.includes("&lt;b&gt;"));
  assert.ok(!model.html.includes("<b>bold</b>"));
});

test("renders Mermaid code fences as mermaid blocks", () => {
  const model = renderMarkdown("```mermaid\ngraph TD\nA-->B\n```");
  assert.match(model.html, /class="mermaid"/);
  assert.ok(model.html.includes("graph TD"));
});

test("rejects unsupported image sources via the resolver callback", () => {
  const model = renderMarkdown("![alt](/etc/passwd)", {
    resolveImage: () => null,
  });
  assert.ok(model.html.includes('src=""'));
});

test("keeps http/https image sources untouched", () => {
  const model = renderMarkdown("![alt](https://example.com/a.png)", {
    resolveImage: (src) => (src.startsWith("https://") ? src : null),
  });
  assert.ok(model.html.includes('src="https://example.com/a.png"'));
});
