# Markdown Reader Manual Test Document

This document exercises every Markdown feature the reader must render correctly inside the fixed-width column. Use it to manually verify the acceptance criteria in [PRD.md](../../PRD.md).

## Headings

### A third-level heading

#### A fourth-level heading

##### A fifth-level heading

###### A sixth-level heading

## Text Formatting

Plain paragraph text with **bold**, _italic_, and `inline code`. Here is a [link to VS Code](https://code.visualstudio.com) and a bare URL: https://example.com.

## Lists

- Top-level item one
- Top-level item two
  - Nested item A
  - Nested item B
    1. Deeply nested ordered item
    2. Another deeply nested item
- Top-level item three

## Task List

- [x] Ship the extension scaffold
- [x] Wire the webview panel
- [ ] Polish the reading experience
- [ ] Publish to the marketplace

## Blockquote

> A blockquote spanning
> multiple lines, used to check
> indentation and border styling.

## Code Blocks

```ts
export function renderMarkdown(source: string): string {
  // This fenced block should be syntax highlighted.
  return source.trim();
}
```

```text
# This "#" must NOT appear in the Table of Contents.
It is inside a fenced code block.
```

## Table

| Feature        | Status | Notes                                                              |
| -------------- | ------ | ------------------------------------------------------------------ |
| ToC            | Done   | Collapsible, scroll-spy enabled                                    |
| Live update    | Done   | Debounced at ~300ms                                                |
| Wide table col | Done   | Should scroll horizontally, not overflow, when the panel is narrow |

## Image

Remote image (should load via the `https:` CSP allowance):

![VS Code logo](https://code.visualstudio.com/assets/images/code-stable.png)

To verify local image resolution, place any `.png`/`.jpg` next to this file and reference it with a relative path, e.g. `![local](./photo.png)`.

## Repeated Heading (slug dedupe check)

Some content under the first occurrence.

## Repeated Heading (slug dedupe check)

Some content under the second occurrence; its ToC entry and anchor id must differ from the first.

## Closing Section

End of the manual test document.
