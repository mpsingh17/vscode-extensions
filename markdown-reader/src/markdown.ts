import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const taskLists = require("markdown-it-task-lists");
import hljs from "highlight.js/lib/common";
import type { HeadingInfo } from "./shared/messages";

export interface DocumentModel {
  html: string;
  headings: HeadingInfo[];
  isEmpty: boolean;
}

export interface RenderOptions {
  /**
   * Resolves an image `src` to a usable URI, or returns null to reject it.
   * Kept as a callback so this parser module stays independent of vscode/webview APIs.
   */
  resolveImage?: (src: string) => string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightFence(code: string, lang: string): string {
  const normalizedLang = lang ? lang.toLowerCase() : "";
  if (normalizedLang === "mermaid") {
    return `<div class="mermaid">${escapeHtml(code)}</div>`;
  }

  const language = lang && hljs.getLanguage(lang) ? lang : undefined;
  const highlighted = language
    ? hljs.highlight(code, { language, ignoreIllegals: true }).value
    : escapeHtml(code);
  const className = language ? `hljs language-${language}` : "hljs";
  return `<pre><code class="${className}">${highlighted}</code></pre>`;
}

export function renderMarkdown(
  source: string,
  options: RenderOptions = {},
): DocumentModel {
  const headings: HeadingInfo[] = [];

  const md: MarkdownIt = new MarkdownIt({
    html: false,
    linkify: true,
    highlight: highlightFence,
  });

  md.use(taskLists, { enabled: true, label: true });
  md.use(anchor, {
    level: [1, 2, 3, 4, 5, 6],
    uniqueSlugStartIndex: 1,
    callback: (token, info) => {
      headings.push({
        level: Number(token.tag.slice(1)),
        text: info.title,
        slug: info.slug,
        line: token.map ? token.map[0] : 0,
      });
    },
  });

  if (options.resolveImage) {
    const resolveImage = options.resolveImage;
    const defaultRender =
      md.renderer.rules.image ??
      ((tokens, idx, opts, env, self) => self.renderToken(tokens, idx, opts));
    md.renderer.rules.image = (tokens, idx, opts, env, self) => {
      const token = tokens[idx];
      const srcIndex = token.attrIndex("src");
      if (srcIndex >= 0 && token.attrs) {
        const resolved = resolveImage(token.attrs[srcIndex][1]);
        token.attrs[srcIndex][1] = resolved ?? "";
      }
      return defaultRender(tokens, idx, opts, env, self);
    };
  }

  const isEmpty = source.trim().length === 0;
  const html = isEmpty ? "" : md.render(source);

  return { html, headings, isEmpty };
}
