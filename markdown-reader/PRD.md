# Product Requirement Document (PRD) & Implementation Plan

**Project:** VS Code Extension – Fixed-Width Markdown Reader with ToC
**Extension ID / folder:** `markdown-reader`
**Command namespace:** `markdown-reader.*`

---

## 1. Objective & Scope

Build a VS Code extension that provides a **distraction-free reading preview** for Markdown files. The preview renders content in a **fixed-width, horizontally centered column** (default **552px**, matching a desktop LinkedIn feed post, but configurable) next to a **collapsible left Table of Contents (ToC)** for fast navigation through long documents.

The core value is **comfortable long-form reading and review** inside the editor — a calm reading column plus a persistent map of the document. Content creators drafting platform posts are the primary users, but the tool is useful for anyone reading long Markdown (docs, READMEs, articles).

**Primary users**

- Content creators drafting/reviewing long-form posts who want to preview true reading width.
- Developers/writers reading long Markdown who want an outline and a narrow, readable column.

### 1.1 Non-Goals (to keep it simple)

- No WYSIWYG editing inside the preview — it is **read-only**; editing stays in the normal editor.
- No export to PDF/HTML/image, no publishing, and no platform (LinkedIn/X) integration or API posting.
- No custom Markdown dialects or plugin ecosystem beyond a standard parser + common extensions (tables, code, task lists).
- Not a replacement for VS Code's built-in Markdown preview; this is an opinionated reading view.

---

## 2. Core Functional Requirements

| Feature                         | Description                                  | Target Specification                                                                                                                                                                                                                                    |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trigger Mechanism**           | How the user launches the view.              | Command Palette entry **“Markdown Reader: Open Preview”** (`markdown-reader.open`) and an **editor title-bar icon** shown for `.md`/`.markdown` files. Opens the preview for the active Markdown file **beside** the editor (`ViewColumn.Beside`).      |
| **Fixed-Width Reading Column**  | The visual rendering container for the text. | Central reading pane centered on screen with a **max width of 552px by default** (configurable via `markdown-reader.contentWidth`). Comfortable padding, `line-height: 1.5`, and readable base font size.                                               |
| **Collapsible Left ToC**        | Navigation panel on the left.                | Extracts headings (`#`–`######`) into a clickable, **indented** list reflecting heading depth. Sidebar is **collapsible** via a toggle (and keyboard shortcut); collapsed/expanded state is **remembered** across sessions.                             |
| **Scroll-Spy (Active Heading)** | Orientation while reading.                   | As the reader scrolls, the ToC **highlights the heading currently in view** and keeps it visible within the ToC’s own scroll area.                                                                                                                      |
| **Click-to-Navigate**           | Jump to a section.                           | Clicking a ToC entry **smoothly scrolls** the reading column to that heading with a small top offset (heading not glued to the very edge).                                                                                                              |
| **Live Update / Sync**          | Keeping the preview current.                 | Preview re-renders when the source document changes (live, **debounced ~300ms**) or on save, and **preserves the reader’s scroll position** (does not jump to top on each keystroke). Switching the active Markdown editor updates the target document. |
| **Empty / Edge States**         | Graceful behavior.                           | No active Markdown file → actionable message. No headings → show content with a “No headings found” ToC placeholder. Empty file → clean empty state.                                                                                                    |

---

## 3. UI/UX Specifications

- **Layout:** Two-pane interface inside a single Webview panel — **left ToC** + **right reading column** — built with CSS grid/flexbox.
- **Left ToC pane:**
  - Fixed, comfortable width (e.g. ~240–280px) with its **own independent vertical scroll**.
  - **Collapsible:** a toggle button (chevron/“hamburger”) collapses the pane to a thin rail or hides it, expanding the reading area; state persists.
  - **Indented by level** (`#` → `######`) so structure is visible at a glance.
  - **Active item highlighted** via scroll-spy; the current item auto-scrolls into view.
  - Keyboard accessible: entries are focusable, `Enter`/`Space` navigates, arrow keys move between entries; proper `nav`/list ARIA roles.
- **Right reading column:**
  - Horizontally centered, **max width driven by `contentWidth` (default 552px)**.
  - Generous line-height (`1.5`) and vertical rhythm for long-form comfort.
- **Typography:** Clean system sans-serif stack (`system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`); readable base size; wrapped, scrollable code blocks that never break the column bounds.
- **Theme:** Inherit VS Code theme via CSS variables (`--vscode-editor-foreground`, `--vscode-editor-background`, `--vscode-textLink-foreground`, etc.) so the reader matches light/dark/high-contrast themes.
- **Interactivity:** Smooth scroll on ToC click; external links open in the default browser; in-document anchor links jump within the column.

---

## 4. Technical Architecture Guidance

- **Extension type:** VS Code extension using the **Webview API** for custom HTML/CSS/JS rendering. Target a recent `engines.vscode` (e.g. `^1.90.0`), TypeScript, bundled with **esbuild**.
- **Activation:** Contribute the command and title-menu icon; activate on the command and on Markdown language (avoid `*` activation).
- **Markdown parsing:** Use **`markdown-it`** with `html: false` (or sanitized output) plus common plugins: tables, fenced code, task lists, and heading anchors (`markdown-it-anchor`) to generate stable `id`s used by the ToC.
- **ToC generation:** Prefer the parser’s **heading tokens** (level + text + slug) over regex, so headings inside code blocks are not misdetected. Deduplicate slugs for repeated headings.
- **Theme integration:** Style exclusively through `--vscode-*` CSS variables; react to theme changes without a full reload where possible.

### 4.1 Configuration (Settings)

Expose a small, focused set of settings under `markdown-reader.*`:

| Setting                               | Type                   | Default  | Purpose                                                |
| ------------------------------------- | ---------------------- | -------- | ------------------------------------------------------ |
| `markdown-reader.contentWidth`        | number (px)            | `552`    | Max width of the reading column.                       |
| `markdown-reader.tocDefaultCollapsed` | boolean                | `false`  | Whether the ToC starts collapsed.                      |
| `markdown-reader.updateMode`          | `"live"` \| `"onSave"` | `"live"` | Re-render on every change (debounced) or only on save. |
| `markdown-reader.fontSize`            | number (px)            | `16`     | Base reading font size.                                |

Keep defaults sensible so the extension is great with **zero configuration**.

### 4.2 Security (Webview hardening)

- Set a strict **Content Security Policy** with a per-load **nonce**; only allow scripts/styles bearing that nonce.
- Set `localResourceRoots` and load bundled assets via `webview.asWebviewUri`; grant no more capability than needed.
- Render Markdown with HTML disabled/sanitized to prevent **XSS from untrusted document content** (Markdown files can embed malicious HTML/links).
- Route link clicks safely: open `http(s)` links externally via `env.openExternal`; ignore or explicitly allow-list other URL schemes.
- Consider `retainContextWhenHidden: true` (or state restore) so scroll position and ToC state survive tab switches.

### 4.3 Markdown Feature Support

Render cleanly within the narrow column: headings, paragraphs, **bold/italic**, ordered/unordered lists, **task lists**, blockquotes, **fenced code with syntax highlighting**, inline code, **tables** (horizontally scrollable if wide), images (local via `asWebviewUri`, remote allowed by CSP `img-src`), and links.

### 4.4 Panel Lifecycle & Messaging

- **Single reusable panel:** reveal the existing panel instead of opening duplicates; track the source document URI.
- **Update triggers:** `onDidChangeTextDocument` (debounced) or `onDidSaveTextDocument` per `updateMode`; `onDidChangeActiveTextEditor` to retarget when the user switches Markdown files; dispose listeners on panel close.
- **Extension ↔ webview messaging:** `postMessage` for “open external link”, optional “reveal source line”, and pushing new HTML/ToC on updates; the webview handles scroll, scroll-spy, and ToC collapse locally.

---

## 5. Step-by-Step Implementation Roadmap

### Phase 1: Project Initialization & Configuration

- [ ] Scaffold with `yo code` (TypeScript); set up **esbuild** bundling and a sensible `engines.vscode`.
- [ ] Register command `markdown-reader.open` with title **“Markdown Reader: Open Preview”**; add an **editor title-bar icon** shown only for Markdown (`when: resourceLangId == markdown`).
- [ ] Declare the `markdown-reader.*` **settings** (Section 4.1) in `contributes.configuration`.

### Phase 2: Webview Infrastructure

- [ ] Implement a **single reusable** Webview panel provider (reveal-if-exists) opened `Beside` the editor.
- [ ] Apply **CSP + nonce**, `localResourceRoots`, and `asWebviewUri` for all assets.
- [ ] Wire update triggers per `updateMode` (`onDidChangeTextDocument` **debounced ~300ms** / `onDidSaveTextDocument`) and `onDidChangeActiveTextEditor`; dispose cleanly.

### Phase 3: Parsing & ToC Generation

- [ ] Integrate `markdown-it` (+ tables, task lists, `markdown-it-anchor`) with HTML disabled/sanitized.
- [ ] Extract headings from tokens (level + text + **unique slug**) and build the **indented** ToC model.
- [ ] Handle the **no-headings** case with a placeholder.

### Phase 4: Frontend Styling & Behavior (Webview)

- [ ] Build the two-pane grid/flex layout; enforce `.content-container { max-width: var(--content-width, 552px); margin: 0 auto; }`.
- [ ] Implement **collapsible ToC** (toggle + persisted state) and **click-to-scroll** with smooth behavior and a small top offset.
- [ ] Implement **scroll-spy** (IntersectionObserver) to highlight the active heading and keep it visible in the ToC.
- [ ] **Preserve scroll position** across re-renders; open external links via `env.openExternal`.

### Phase 5: Polishing & Edge Cases

- [ ] Verify code blocks, tables, images, blockquotes, and lists render within bounds (wide tables scroll, not overflow).
- [ ] Handle: no active file, empty file, non-Markdown file, and editor splits/closes.
- [ ] Basic tests: heading/slug extraction and ToC model; a manual test doc covering all Markdown features.

---

## 6. Acceptance Criteria / Definition of Done (DoD)

1. **Reading view:** Opening a ~3,000-word Markdown file shows a centered reading column beside a populated left ToC.
2. **Width precision:** The reading column measures **`contentWidth` (default 552px)** when inspected; changing the setting updates the column live.
3. **Collapsible ToC:** The ToC can be collapsed/expanded via its toggle; the state **persists** across reopen/reload.
4. **Scroll-spy:** While scrolling, the ToC highlights the heading currently in view.
5. **Navigation:** Clicking the last ToC entry smoothly scrolls the column to the final section; clicking any entry lands on the right heading.
6. **Live accuracy:** Editing a heading updates **both** the ToC and the rendered content (debounced) **without losing scroll position**.
7. **Robustness:** No active / empty / heading-less / non-Markdown files are handled gracefully with clear messaging.
8. **Security:** A strict CSP + nonce is enforced; embedded HTML in Markdown cannot execute scripts; external links open in the browser.
9. **Theme:** The reader visually matches the active VS Code light/dark/high-contrast theme.
