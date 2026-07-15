/**
 * Message contract shared between the extension host and the webview script.
 * Keep this file free of Node/DOM/vscode types so it can be imported by both bundles.
 */

export interface HeadingInfo {
  level: number;
  text: string;
  slug: string;
  line: number;
}

export interface RenderSettings {
  contentWidth: number;
  fontSize: number;
}

export interface RenderPayload {
  fileName: string;
  html: string;
  headings: HeadingInfo[];
  isEmpty: boolean;
  settings: RenderSettings;
  tocCollapsed: boolean;
  /** True when the reader should jump to top instead of preserving scroll position. */
  resetScroll: boolean;
}

export type ReaderState = "noActiveFile" | "nonMarkdown";

export type ExtensionMessage =
  | { type: "render"; payload: RenderPayload }
  | { type: "state"; state: ReaderState };

export type WebviewMessage =
  | { type: "ready" }
  | { type: "openExternal"; href: string }
  | { type: "tocCollapsed"; collapsed: boolean };
