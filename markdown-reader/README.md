# Markdown Reader

A distraction-free reading view for Markdown files: a fixed-width, centered reading column next to a collapsible Table of Contents.

## Features

- **Fixed-width reading column** (default 552px, configurable) for comfortable long-form reading.
- **Collapsible Table of Contents** with heading indentation, click-to-navigate, and scroll-spy highlighting of the current section.
- **Live preview** that updates as you type (debounced) or only on save, without losing your scroll position.
- Renders headings, lists, task lists, tables, blockquotes, syntax-highlighted code blocks, Mermaid diagrams, images, and links, all themed to match your VS Code color theme.
- Untrusted Markdown content is sanitized: inline HTML doesn't execute, and a strict Content Security Policy is enforced.

## Usage

1. Open a Markdown (`.md`) file.
2. Run **Markdown Reader: Open Preview** from the Command Palette, or click the book icon in the editor title bar.
3. The reader opens beside your editor on the right. Click a heading in the Table of Contents to jump to it, or use the toggle to collapse the ToC. Mermaid fenced blocks render inline with VS Code-aligned styling using the bundled Mermaid runtime.

## Settings

| Setting                               | Default  | Description                                                    |
| ------------------------------------- | -------- | -------------------------------------------------------------- |
| `markdown-reader.contentWidth`        | `552`    | Max width (px) of the reading column.                          |
| `markdown-reader.fontSize`            | `16`     | Base font size (px) of the reading column.                     |
| `markdown-reader.tocDefaultCollapsed` | `false`  | Whether the Table of Contents starts collapsed.                |
| `markdown-reader.updateMode`          | `"live"` | `"live"` updates as you type; `"onSave"` updates on save only. |

## Install for Production Use

The extension isn't published to the Marketplace, so install it locally from a packaged `.vsix`:

1. Install dependencies and package the extension:

   ```powershell
   npm install
   npm run package
   ```

   This runs the type-check and tests, produces a production build, and creates `markdown-reader-0.0.1.vsix` in this folder.

2. Install the `.vsix` into VS Code, either:

   - **Command line:**

     ```powershell
     code --install-extension markdown-reader-0.0.1.vsix
     ```

   - **UI:** Open the Extensions view, click the `...` menu at the top, choose **Install from VSIX...**, and select the generated file.

3. Reload VS Code if prompted. The extension activates automatically the first time you run its command, no restart required otherwise.

4. Verify it's installed: open a Markdown file and confirm the book icon appears in the editor title bar, or run **Markdown Reader: Open Preview** from the Command Palette.

To update after making changes, bump `version` in `package.json`, rerun `npm run package`, then reinstall the new `.vsix` (VS Code replaces the previous version).

## Development

```powershell
npm install
npm run check    # type-check
npm test          # parser unit tests
npm run compile   # bundle extension + webview
npm run test:host # compile then open Extension Development Host
```

Press `F5` in VS Code to launch an Extension Development Host and try it out. If VS Code asks you to select a debugger, open the `markdown-reader` folder directly (not just the repo root) or run `npm run test:host`.

To verify the Development Host is running this workspace copy (not an installed `.vsix`):

1. Run `npm run test:host` from this folder. The script prints the exact `extensionDevelopmentPath` before launching VS Code.
2. In the Development Host window, run **Developer: Show Running Extensions** and confirm Markdown Reader points to this folder path.
3. Open **Output** and select **Markdown Reader (Dev)**. You should see activation lines including `extensionPath=.../vscode-extensions/markdown-reader`.
