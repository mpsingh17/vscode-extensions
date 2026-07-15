# Markdown Reader Implementation Plan

This plan turns [PRD.md](PRD.md) into an execution sequence that a developer can follow without guessing the architecture or the test gates.

## Working Assumptions

- The extension will be implemented as a single reusable webview panel.
- The panel will render Markdown with `markdown-it` and derive the ToC from parsed heading tokens, not regex.
- The first release should prioritize correctness, update stability, and security over visual polish.
- The webview will use plain TypeScript/JavaScript and CSS. No UI framework, dependency injection container, state library, or service layer is needed.
- The extension host will create the webview shell once. Document changes will update the existing DOM through messages rather than replacing `webview.html` and reloading the page.

## Simplicity Guardrails and Concrete Decisions

- Keep the production structure small: `extension.ts` for activation, `readerPanel.ts` for panel lifecycle, `markdown.ts` for the pure parser/model, and one webview script and stylesheet under `media/`. Split a file only when it has a distinct runtime boundary or independently testable logic.
- Use direct classes/functions and discriminated-union message types. Do not add interfaces with one implementation, factories, a generic message bus, or a webview provider abstraction.
- Use only focused runtime dependencies: `markdown-it`, `markdown-it-anchor`, `markdown-it-task-lists`, and the common-language build of `highlight.js`. Tables and fenced code already come from `markdown-it`; do not add plugins for them.
- Use Node's built-in test runner for parser tests. Do not add a test framework unless VS Code integration tests later justify one.
- Persist ToC collapse preference in `ExtensionContext.globalState`, because it must survive panel disposal and VS Code restarts. Use `acquireVsCodeApi().getState()` / `setState()` for transient webview state such as scroll position. Do not use `retainContextWhenHidden`; this reader is cheap to recreate and should not retain a hidden browser context in memory.
- Do not register a webview serializer in the first release. Restoring an open panel after a full VS Code restart is not an acceptance criterion; the persisted ToC preference still applies when the user opens it again.
- With `engines.vscode` at `^1.90.0`, the contributed command supplies command activation automatically. Do not add `onLanguage:markdown`, because no background work is needed before the user opens the reader. This is a deliberate simplification of the PRD's non-binding activation guidance.

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
- Let the command handler accept the URI supplied by an editor title action and otherwise fall back to the active text editor. This keeps split-editor behavior explicit and testable.
- Add the `markdown-reader.*` configuration keys from the PRD.
- Bundle two explicit entry points: the Node extension host and the browser-targeted webview script. Copy the single stylesheet as a build asset.
- Let the command contribution activate the extension lazily; do not add `*` or language activation.
- Add sensible setting bounds in the manifest so invalid layout values cannot reach the UI (for example, `contentWidth` 320–1200px and `fontSize` 12–32px).
- Give the title command a built-in codicon and gate only its menu item with `resourceLangId == markdown`; keep the Command Palette entry available so it can show the no-active-Markdown state.

Checkpoint:

- The extension activates only when expected.
- The command is visible in the Command Palette.
- The title-bar button appears only for Markdown editors.
- Settings resolve with the documented defaults.
- Both esbuild entry points compile, and the packaged extension contains the script and stylesheet expected by the webview.

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
- Configure `markdown-it` with HTML disabled, its built-in tables/fences enabled, task lists, anchors, and a `highlight.js/lib/common` fence callback. Unknown fence languages must fall back to escaped plain code.
- Configure `markdown-it-anchor` as the single owner of heading IDs. Build the ToC from the same heading tokens/anchor callback so rendered IDs and ToC slugs cannot drift apart.
- Ensure heading extraction comes from parsed tokens so code blocks and inline code do not become false headings.
- Deduplicate repeated slugs deterministically.
- Normalize heading text for the ToC while preserving the original rendered heading content.
- Derive the source line from each heading token's `map` value and keep it in the model for deterministic parser tests; do not add a reveal-source action in the first release.
- Make image resolution an explicit parser callback so the parser remains independent of VS Code and easy to test. The panel callback resolves relative paths against the document directory and converts them with `webview.asWebviewUri`; `http`/`https` sources remain remote, and unsupported schemes or absolute local paths are rejected.
- Escape all fallback code and attribute values through `markdown-it` helpers; never concatenate raw Markdown into HTML.

Checkpoint:

- A sample Markdown document produces stable HTML and a correct heading list.
- Repeated headings generate unique, predictable slugs.
- Code fences containing `#` lines do not create phantom headings.
- A fixture document with both a local image and a remote image renders both sources correctly.
- Inline HTML is rendered as inert text, unknown code languages stay escaped, and malformed image/link inputs do not throw.

Validation gate:

- Add focused unit tests for heading extraction/source lines, slug deduplication, code-fence exclusion, HTML escaping, unknown fence languages, image resolution, no-headings, and empty-file handling.
- Run those tests before moving on.

## Step 3. Build the reusable webview host

Create the panel container and message bridge before adding the detailed UI.

- Implement a single panel instance that reveals the existing panel instead of creating duplicates.
- Store the active Markdown document URI with the panel state.
- Build the HTML shell once with a strict CSP: scripts require the nonce, styles load only from the webview resource source, images allow the webview resource source plus `https:` and `http:`, and all other sources default to none. Keep inline styles out of the shell.
- Set `enableScripts: true`, `enableForms: false`, and `enableCommandUris: false`.
- Limit `localResourceRoots` to the extension's `media/` directory plus the current document's workspace folder (or its containing directory when outside a workspace). Refresh these roots when the reusable panel targets a document in another folder. This is required for local Markdown images and resolves the earlier conflict between image support and asset-only roots.
- Load CSS and scripts through `webview.asWebviewUri`.
- Initialize the shell once, then send typed render payloads for the initial document and every update. Never assign `webview.html` during normal document updates.
- Restore transient webview state with `getState()` on startup and update it with `setState()` after scrolling or collapsing. Mirror collapse changes to the extension host so `globalState` preserves the preference after panel disposal.
- Prepare the postMessage contract for:
  - Webview-ready notification.
  - Initial render payload.
  - Subsequent document updates.
  - External link requests.
  - ToC collapse-state changes.
- Wait for the webview-ready notification before sending the first payload. Keep only the latest payload while the panel is hidden or not ready, then send it from `onDidChangeViewState` or the next ready notification. This avoids lost updates without retaining the hidden webview context.
- Represent messages as small discriminated unions and validate their `type` and primitive fields at the receiving boundary. Do not add a schema library.

Checkpoint:

- Only one panel instance exists at a time.
- The webview loads with a valid CSP and no blocked asset errors.
- The extension can send a render payload and receive a response from the webview.
- A malicious HTML fixture cannot execute script, and unsupported URL schemes are rejected in the webview message flow.
- Switching the panel to a Markdown file in another workspace folder refreshes local resource roots and still loads that file's relative images.

Validation gate:

- Open the panel for two different Markdown files and confirm the same panel is reused.
- Verify the browser console shows no unexpected CSP violations and that a local image outside the extension install directory loads.

## Step 4. Implement the reader layout and theme contract

Build the visible structure once the data and panel plumbing are stable.

- Create the two-pane layout with a left ToC and right reading area.
- Make the content column centered with a configurable max width and readable line height.
- Make the ToC and the main reader the only two vertical scroll containers. Avoid body/document scrolling so scroll preservation and scroll-spy have one explicit reader root.
- Keep the ToC in its own scroll container with a fixed comfortable width.
- Use VS Code theme variables for foreground, background, links, code, borders, and active states.
- Style `highlight.js` token classes with VS Code theme variables rather than importing a fixed light/dark color theme.
- Ensure code blocks and tables can scroll horizontally instead of breaking the layout.
- Read document-scoped settings with the source URI so multi-root workspaces behave correctly. Send `contentWidth` and `fontSize` as numeric render settings and apply validated values as CSS variables in the webview. Do not generate a new stylesheet or HTML shell for setting changes.
- Constrain images, preformatted content, and tables to the reading column; wrap tables in an overflow container during rendering instead of relying on invalid overflow behavior on the table element itself.

Checkpoint:

- A large Markdown document is readable in a narrow centered column.
- The ToC and content panes remain independent in their scrolling behavior.
- Theme colors match the active VS Code theme without hard-coded palette leakage.
- Changing `contentWidth` and `fontSize` updates the visible panel without reopening it.

Validation gate:

- Inspect the rendered widths against the configured content width.
- Test light, dark, and high-contrast themes, plus narrow panel widths with the ToC both open and collapsed.

## Step 5. Add ToC interactions and scroll behavior

This step makes the reader feel like a navigable document instead of a static preview.

- Render the ToC as a labelled `nav` containing a simple flat list of anchors. Indent each anchor from its heading level; do not build a recursive tree solely for visual indentation.
- Add a collapse/expand toggle and persist the state across sessions.
- Initialize the first-open ToC state from `tocDefaultCollapsed`, with persisted user state taking precedence on later opens.
- Implement click-to-navigate with `scrollIntoView({ behavior: 'smooth' })` and CSS `scroll-margin-top` for the offset; avoid manual scroll-position arithmetic.
- Implement scroll-spy as one `requestAnimationFrame`-throttled listener on the main reader scroll container. Select the last heading above a small top threshold. This is simpler and more deterministic than coordinating many IntersectionObserver entries for a modest heading list.
- Keep the active heading visible within the ToC scroll container.
- Mark the active link with both a class and `aria-current="location"`.
- Keep native anchor behavior for `Enter`; add `Space` activation and `ArrowUp`, `ArrowDown`, `Home`, and `End` focus movement without introducing a custom focus-management component.

Checkpoint:

- Clicking a ToC item jumps to the correct section.
- The active heading changes as the document scrolls.
- The ToC remembers collapsed state after reopening the panel.
- Keyboard users can operate the ToC without a mouse.

Validation gate:

- Test long documents with dense headings and verify the active item always tracks the visible section.
- Confirm the scroll offset prevents headings from landing flush against the top edge.
- Confirm keyboard focus remains visible and the toggle exposes `aria-expanded` and an accessible name in both states.

## Step 6. Add live update and state preservation

Make the preview reliable during editing before worrying about visual polish.

- Listen for text document changes and saves according to `updateMode`.
- Debounce live updates to about 300 ms when in live mode.
- Register one change listener and one save listener while the panel exists, and branch on the current setting inside them rather than disposing and rebuilding subscriptions when `updateMode` changes.
- Re-render only the active Markdown document.
- Before replacing the rendered content DOM, capture the main reader's `scrollTop`; restore it after replacement, clamped to the new scroll range. Keep this pixel-based first version until real use demonstrates a need for anchor-relative restoration.
- Retarget the panel when the active Markdown editor changes.
- Treat focus moving to the reader webview (`activeTextEditor` becomes `undefined`) as a no-op so opening the panel does not immediately clear its content. Retarget for a concrete Markdown text editor, show the non-Markdown state for a concrete non-Markdown text editor, and listen for the source document closing to show the no-active-file state.
- Dispose listeners when the panel closes.
- Listen for `workspace.onDidChangeConfiguration` filtered to `markdown-reader.*`, and re-render or update CSS variables when `contentWidth`, `fontSize`, `tocDefaultCollapsed`, or `updateMode` change.
- On `updateMode` changes, cancel any pending debounce before switching listener behavior. On panel disposal or retargeting, cancel pending work so an old document cannot overwrite the new payload.
- Treat `tocDefaultCollapsed` only as a default: configuration changes apply immediately only when the user has no persisted collapse preference. Never overwrite an explicit user choice with a default-setting refresh.

Checkpoint:

- Editing the source updates the content without resetting the user to the top.
- Switching between Markdown files updates the preview target predictably.
- The update mode setting changes behavior exactly as documented.
- Changing `contentWidth` or `fontSize` updates the live panel without reopening it; `tocDefaultCollapsed` updates only an uncustomized collapse state.
- Focusing the webview itself does not replace valid content with an empty state, and hidden-panel edits appear when the panel becomes visible again.

Validation gate:

- Edit headings, paragraphs, and code blocks in a sample file and confirm the preview stays in sync.
- Compare live mode versus on-save mode behavior.

## Step 7. Harden security and link handling

Lock down the webview before broad feature testing.

- Keep HTML rendering disabled or sanitized so untrusted Markdown cannot inject script execution.
- Intercept every content-link click in the webview. Handle `#fragment` locally, send only `http` and `https` URLs to the extension, and prevent navigation for relative URLs and every other scheme in the first release.
- In the extension host, parse the requested URL again, allow only the exact `http:` and `https:` schemes, and then call `env.openExternal`. Webview validation is usability; host validation is the security boundary.
- Keep the CSP strict: nonce-based for scripts and allow-listed to the webview resource source for styles.
- Load images only from the document resource root or `http(s)`. Render blocked image sources without a usable `src` rather than widening the policy.
- Keep command URIs and forms disabled and never expose the VS Code API object globally in the webview script.

Checkpoint:

- Embedded malicious HTML does not execute.
- External links leave the webview safely.
- The content security policy is strict enough to block accidental script access.

Validation gate:

- Use a fixture document with inline HTML, script tags, and unusual link schemes to confirm safe behavior.
- Test mixed-case and whitespace-padded schemes, protocol-relative URLs, malicious image paths, and an ordinary in-document anchor.

## Step 8. Handle edge states and polish the experience

Finish the user-facing resilience details once the main flow is stable.

- Show an actionable empty state when no Markdown file is active.
- Show a clean empty-file state.
- Show a clear placeholder when a file has no headings.
- Ensure non-Markdown files are rejected gracefully.
- Give the no-active-file state one useful action: instruct the user to focus a Markdown editor and run the command again. Do not add file-pickers or onboarding UI.
- Verify editor splits, closes, and panel reuse do not leave stale listeners or stale content.
- Confirm tables, lists, quotes, images, and code blocks stay within bounds.
- Use the document's file name as the panel title and update it on retarget; use a generic title for edge states.

Checkpoint:

- Every edge state produces a deliberate UI instead of a blank or broken panel.
- Repeated open/close cycles do not leak listeners or break updates.

Validation gate:

- Manually exercise the empty, no-heading, and non-Markdown states.
- Confirm the panel remains stable after repeated source-editor switches.

## Step 9. Add tests and finalize acceptance checks

Close the loop with automated and manual verification.

- Keep automated coverage focused on pure parser and URL-policy logic with Node's built-in test runner. Add VS Code integration infrastructure only if panel lifecycle behavior cannot be validated reliably through the manual gates.
- Prepare one manual test Markdown file that covers headings, nested lists, tables, code blocks, images, task lists, and links.
- Verify the acceptance criteria from the PRD one by one.
- Add `compile`, `check`, `test`, and `package` scripts; `check` must run TypeScript checking, parser tests, and both esbuild bundles without launching an Extension Development Host.

Checkpoint:

- The extension passes the targeted tests.
- The manual test doc demonstrates every required Markdown feature.
- The acceptance criteria can be checked against observable behavior.
- The focused unit tests from Step 2 still pass, and the manual checks cover the live-settings, hidden-panel refresh, and panel-reuse paths.

Validation gate:

- Run the focused test suite.
- Perform a final manual walkthrough of the open, edit, navigate, collapse, and security flows.
- Run `vsce ls` (or the equivalent package-content check) and confirm only required runtime files, metadata, documentation, and licenses ship.

## Implementation Notes For the Developer

- Keep the panel reusable from the start; do not build a throwaway panel and refactor later.
- Treat heading extraction and ToC generation as a pure function layer because that makes testing much easier.
- Do not defer security until the end; the CSP and link policy should be in the first webview version.
- Preserve scroll state as part of the render contract, not as a UI afterthought.
- Use the PRD acceptance criteria as the release checklist, not as a retrospective.
- Prefer native browser behavior and CSS over JavaScript: CSS grid for layout, `scroll-margin-top` for navigation offset, anchors for activation, and VS Code theme variables for color.
- Do not add speculative commands, settings, telemetry, logging frameworks, localization, source-line reveal, custom Markdown plugins, or panel serialization in the first release.
