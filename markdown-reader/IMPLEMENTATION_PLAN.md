# Markdown Reader Implementation Plan

This plan turns [PRD.md](PRD.md) into an execution sequence that a developer can follow without guessing the architecture or the test gates.

## Working Assumptions

- The extension will be implemented as a single reusable webview panel.
- The panel will render Markdown with `markdown-it` and derive the ToC from parsed heading tokens, not regex.
- The first release should prioritize correctness, update stability, and security over visual polish.

## Delivery Strategy

Build in this order:

1. Extension scaffold and command wiring.
2. Markdown parsing and ToC model generation.
3. Webview shell, messaging, and security hardening.
4. Reader UI behavior: layout, scrolling, ToC collapse, and scroll-spy.
5. Live update flow, state preservation, and edge cases.
6. Tests, validation, and final cleanup.

Do not start the next step until the checkpoint for the current step passes.

## Step 1. Establish the extension skeleton

Create the extension foundation first so all later work has a stable host.

- Scaffold a TypeScript VS Code extension with esbuild bundling.
- Set `engines.vscode` to a modern supported version and keep the package manifest focused on the reader feature.
- Register `markdown-reader.open` and the editor title-bar command for Markdown files.
- Add the `markdown-reader.*` configuration keys from the PRD.
- Wire activation so the extension loads on command execution and Markdown files, not on `*`.

Checkpoint:

- The extension activates only when expected.
- The command is visible in the Command Palette.
- The title-bar button appears only for Markdown editors.
- Settings resolve with the documented defaults.

Validation gate:

- Run the extension build and a minimal activation smoke test.
- Confirm the manifest contributes the command, menu item, and settings correctly.

## Step 2. Define the data model and parser layer

Create the parsing layer before building the webview so rendering and navigation have one source of truth.

- Introduce a document model that contains:
  - Source URI.
  - Rendered HTML.
  - Ordered heading list with level, text, slug, and source position.
  - Empty-state flags.
- Configure `markdown-it` with HTML disabled and the required common extensions.
- Add `markdown-it-anchor` or equivalent slug generation to produce stable heading IDs.
- Ensure heading extraction comes from parsed tokens so code blocks and inline code do not become false headings.
- Deduplicate repeated slugs deterministically.
- Normalize heading text for the ToC while preserving the original rendered heading content.
- Override the image renderer so relative Markdown image paths resolve against the source document and convert to webview URIs, while `http(s)` images remain unchanged.

Checkpoint:

- A sample Markdown document produces stable HTML and a correct heading list.
- Repeated headings generate unique, predictable slugs.
- Code fences containing `#` lines do not create phantom headings.
- A fixture document with both a local image and a remote image renders both sources correctly.

Validation gate:

- Add focused unit tests for heading extraction, slug deduplication, and empty-file handling.
- Run those tests before moving on.

## Step 3. Build the reusable webview host

Create the panel container and message bridge before adding the detailed UI.

- Implement a single panel instance that reveals the existing panel instead of creating duplicates.
- Store the active Markdown document URI with the panel state.
- Build the HTML shell with a nonce-based CSP.
- Limit `localResourceRoots` to the extension’s bundled assets only.
- Load CSS and scripts through `webview.asWebviewUri`.
- Set `retainContextWhenHidden: true` for the first version so scroll and ToC state survive tab switches without an explicit restore protocol.
- Prepare the postMessage contract for:
  - Initial render payload.
  - Subsequent document updates.
  - External link requests.
  - Optional source-line reveal requests.

Checkpoint:

- Only one panel instance exists at a time.
- The webview loads with a valid CSP and no blocked asset errors.
- The extension can send a render payload and receive a response from the webview.
- A malicious HTML fixture cannot execute script, and unsupported URL schemes are rejected in the webview message flow.

Validation gate:

- Open the panel for two different Markdown files and confirm the same panel is reused.
- Verify the browser console shows no CSP violations.

## Step 4. Implement the reader layout and theme contract

Build the visible structure once the data and panel plumbing are stable.

- Create the two-pane layout with a left ToC and right reading area.
- Make the content column centered with a configurable max width and readable line height.
- Keep the ToC in its own scroll container with a fixed comfortable width.
- Use VS Code theme variables for foreground, background, links, code, borders, and active states.
- Ensure code blocks and tables can scroll horizontally instead of breaking the layout.
- Read `contentWidth` and `fontSize` from configuration on render and inject them as CSS variables so changing settings updates the layout immediately.

Checkpoint:

- A large Markdown document is readable in a narrow centered column.
- The ToC and content panes remain independent in their scrolling behavior.
- Theme colors match the active VS Code theme without hard-coded palette leakage.
- Changing `contentWidth` and `fontSize` updates the visible panel without reopening it.

Validation gate:

- Inspect the rendered widths against the configured content width.
- Test light, dark, and high-contrast themes.

## Step 5. Add ToC interactions and scroll behavior

This step makes the reader feel like a navigable document instead of a static preview.

- Render the ToC as an accessible navigation list.
- Indent entries by heading level.
- Add a collapse/expand toggle and persist the state across sessions.
- Initialize the first-open ToC state from `tocDefaultCollapsed`, with persisted user state taking precedence on later opens.
- Implement click-to-navigate with smooth scrolling and a small top offset.
- Implement scroll-spy with IntersectionObserver or a similarly reliable viewport-tracking approach.
- Keep the active heading visible within the ToC scroll container.
- Support keyboard navigation for ToC entries.

Checkpoint:

- Clicking a ToC item jumps to the correct section.
- The active heading changes as the document scrolls.
- The ToC remembers collapsed state after reopening the panel.
- Keyboard users can operate the ToC without a mouse.

Validation gate:

- Test long documents with dense headings and verify the active item always tracks the visible section.
- Confirm the scroll offset prevents headings from landing flush against the top edge.

## Step 6. Add live update and state preservation

Make the preview reliable during editing before worrying about visual polish.

- Listen for text document changes and saves according to `updateMode`.
- Debounce live updates to about 300 ms when in live mode.
- Re-render only the active Markdown document.
- Preserve scroll position across re-renders.
- Retarget the panel when the active Markdown editor changes.
- If the active editor becomes non-Markdown or closes, transition immediately to the no-active-file state instead of keeping stale content visible.
- Dispose listeners when the panel closes.
- Restore or retain the panel state so scroll and ToC collapse survive tab switches.
- Listen for `workspace.onDidChangeConfiguration` filtered to `markdown-reader.*`, and re-render or update CSS variables when `contentWidth`, `fontSize`, `tocDefaultCollapsed`, or `updateMode` change.

Checkpoint:

- Editing the source updates the content without resetting the user to the top.
- Switching between Markdown files updates the preview target predictably.
- The update mode setting changes behavior exactly as documented.
- Changing `contentWidth`, `fontSize`, or `tocDefaultCollapsed` updates the live panel behavior without reopening the view.

Validation gate:

- Edit headings, paragraphs, and code blocks in a sample file and confirm the preview stays in sync.
- Compare live mode versus on-save mode behavior.

## Step 7. Harden security and link handling

Lock down the webview before broad feature testing.

- Keep HTML rendering disabled or sanitized so untrusted Markdown cannot inject script execution.
- Open `http` and `https` links externally through `env.openExternal`.
- Ignore or explicitly reject unsupported URL schemes.
- Keep the CSP strict and nonce-based for scripts and styles.
- Load images only from allowed sources that fit the security policy.

Checkpoint:

- Embedded malicious HTML does not execute.
- External links leave the webview safely.
- The content security policy is strict enough to block accidental script access.

Validation gate:

- Use a fixture document with inline HTML, script tags, and unusual link schemes to confirm safe behavior.

## Step 8. Handle edge states and polish the experience

Finish the user-facing resilience details once the main flow is stable.

- Show an actionable empty state when no Markdown file is active.
- Show a clean empty-file state.
- Show a clear placeholder when a file has no headings.
- Ensure non-Markdown files are rejected gracefully.
- Verify editor splits, closes, and panel reuse do not leave stale listeners or stale content.
- Confirm tables, lists, quotes, images, and code blocks stay within bounds.

Checkpoint:

- Every edge state produces a deliberate UI instead of a blank or broken panel.
- Repeated open/close cycles do not leak listeners or break updates.

Validation gate:

- Manually exercise the empty, no-heading, and non-Markdown states.
- Confirm the panel remains stable after repeated source-editor switches.

## Step 9. Add tests and finalize acceptance checks

Close the loop with automated and manual verification.

- Add any thin integration tests that are practical for command wiring, panel reuse, and configuration refresh behavior.
- Prepare one manual test Markdown file that covers headings, nested lists, tables, code blocks, images, task lists, and links.
- Verify the acceptance criteria from the PRD one by one.

Checkpoint:

- The extension passes the targeted tests.
- The manual test doc demonstrates every required Markdown feature.
- The acceptance criteria can be checked against observable behavior.
- The focused unit tests from Step 2 still pass, and the new integration checks cover the live-settings and panel-reuse paths.

Validation gate:

- Run the focused test suite.
- Perform a final manual walkthrough of the open, edit, navigate, collapse, and security flows.

## Implementation Notes For the Developer

- Keep the panel reusable from the start; do not build a throwaway panel and refactor later.
- Treat heading extraction and ToC generation as a pure function layer because that makes testing much easier.
- Do not defer security until the end; the CSP and link policy should be in the first webview version.
- Preserve scroll state as part of the render contract, not as a UI afterthought.
- Use the PRD acceptance criteria as the release checklist, not as a retrospective.
