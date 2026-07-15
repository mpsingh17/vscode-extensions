# Markdown Reader

A distraction-free reading view for Markdown files: a fixed-width, centered reading column next to a collapsible Table of Contents.

## Features

- **Fixed-width reading column** (default 552px, configurable) for comfortable long-form reading.
- **Collapsible Table of Contents** with heading indentation, click-to-navigate, and scroll-spy highlighting of the current section.
- **Live preview** that updates as you type (debounced) or only on save, without losing your scroll position.
- Renders headings, lists, task lists, tables, blockquotes, syntax-highlighted code blocks, images, and links, all themed to match your VS Code color theme.
- Untrusted Markdown content is sanitized: inline HTML doesn't execute, and a strict Content Security Policy is enforced.

## Usage

1. Open a Markdown (`.md`) file.
2. Run **Markdown Reader: Open Preview** from the Command Palette, or click the book icon in the editor title bar.
3. The reader opens beside your editor. Click a heading in the Table of Contents to jump to it, or use the toggle to collapse the ToC.

## Settings

| Setting                               | Default  | Description                                                    |
| ------------------------------------- | -------- | -------------------------------------------------------------- |
| `markdown-reader.contentWidth`        | `552`    | Max width (px) of the reading column.                          |
| `markdown-reader.fontSize`            | `16`     | Base font size (px) of the reading column.                     |
| `markdown-reader.tocDefaultCollapsed` | `false`  | Whether the Table of Contents starts collapsed.                |
| `markdown-reader.updateMode`          | `"live"` | `"live"` updates as you type; `"onSave"` updates on save only. |

## Development

```powershell
npm install
npm run check    # type-check
npm test          # parser unit tests
npm run compile   # bundle extension + webview
```

Press `F5` in VS Code to launch an Extension Development Host and try it out.
