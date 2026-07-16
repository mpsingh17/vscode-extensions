import * as path from "path";
import * as vscode from "vscode";

import { renderMarkdown } from "./markdown";
import type {
  ExtensionMessage,
  RenderPayload,
  RenderSettings,
  WebviewMessage,
} from "./shared/messages";

const TOC_COLLAPSED_KEY = "markdown-reader.tocCollapsed";
const LIVE_DEBOUNCE_MS = 300;
const READER_VIEW_COLUMN = vscode.ViewColumn.Beside;

interface CachedModel {
  uri: vscode.Uri;
  fileName: string;
  html: string;
  headings: RenderPayload["headings"];
  isEmpty: boolean;
}

/** Owns the single reusable Markdown Reader webview panel and its lifecycle. */
export class ReaderPanel implements vscode.Disposable {
  private readonly context: vscode.ExtensionContext;
  private readonly disposables: vscode.Disposable[] = [];

  private panel: vscode.WebviewPanel | undefined;
  private targetUri: vscode.Uri | undefined;
  private lastModel: CachedModel | undefined;
  private lastMessage: ExtensionMessage | undefined;
  private ready = false;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  openFor(document: vscode.TextDocument | undefined): void {
    this.ensurePanel();

    if (!document) {
      this.showState("noActiveFile");
      return;
    }
    if (document.languageId !== "markdown") {
      this.showState("nonMarkdown");
      return;
    }
    this.setTarget(document);
  }

  dispose(): void {
    this.clearDebounce();
    this.disposables.forEach((d) => d.dispose());
    this.disposables.length = 0;
    this.panel?.dispose();
    this.panel = undefined;
    this.ready = false;
    this.lastMessage = undefined;
    this.lastModel = undefined;
    this.targetUri = undefined;
  }

  private ensurePanel(): void {
    if (this.panel) {
      this.panel.reveal(this.panel.viewColumn ?? READER_VIEW_COLUMN, true);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "markdownReader",
      "Markdown Reader",
      { viewColumn: READER_VIEW_COLUMN, preserveFocus: true },
      {
        enableScripts: true,
        enableForms: false,
        enableCommandUris: false,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "dist"),
        ],
      },
    );

    this.panel = panel;
    this.ready = false;
    panel.webview.html = this.buildHtml(panel.webview);

    panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handleMessage(message),
      undefined,
      this.disposables,
    );
    panel.onDidChangeViewState(() => this.flush(), undefined, this.disposables);
    panel.onDidDispose(() => this.dispose(), undefined, this.disposables);

    vscode.workspace.onDidChangeTextDocument(
      (e) => this.handleDocumentChange(e),
      undefined,
      this.disposables,
    );
    vscode.workspace.onDidSaveTextDocument(
      (d) => this.handleDocumentSave(d),
      undefined,
      this.disposables,
    );
    vscode.workspace.onDidCloseTextDocument(
      (d) => this.handleDocumentClose(d),
      undefined,
      this.disposables,
    );
    vscode.window.onDidChangeActiveTextEditor(
      (e) => this.handleActiveEditorChange(e),
      undefined,
      this.disposables,
    );
    vscode.workspace.onDidChangeConfiguration(
      (e) => this.handleConfigChange(e),
      undefined,
      this.disposables,
    );
  }

  private buildHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "reader.css"),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js"),
    );
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https: http:`,
      `style-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}' https://cdn.jsdelivr.net`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="stylesheet" href="${cssUri}" />
<title>Markdown Reader</title>
</head>
<body>
<div id="app" class="app" data-state="loading">
  <nav id="toc" class="toc" aria-label="Table of contents">
    <button id="toc-toggle" class="toc-toggle" type="button" aria-expanded="true" aria-controls="toc-list" aria-label="Collapse table of contents">&laquo;</button>
    <ol id="toc-list" class="toc-list"></ol>
  </nav>
  <main id="reader" class="reader" tabindex="-1">
    <div id="content" class="content"></div>
  </main>
</div>
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  // ---- message handling ----------------------------------------------------

  private handleMessage(message: WebviewMessage): void {
    switch (message.type) {
      case "ready":
        this.ready = true;
        this.flush();
        break;
      case "openExternal":
        this.openExternalIfSafe(message.href);
        break;
      case "tocCollapsed":
        this.context.globalState.update(TOC_COLLAPSED_KEY, message.collapsed);
        break;
    }
  }

  private openExternalIfSafe(href: string): void {
    try {
      const url = new URL(href);
      if (url.protocol === "http:" || url.protocol === "https:") {
        vscode.env.openExternal(vscode.Uri.parse(href));
      }
    } catch {
      // Ignore malformed URLs; nothing to open.
    }
  }

  private send(message: ExtensionMessage): void {
    this.lastMessage = message;
    this.flush();
  }

  private flush(): void {
    if (this.panel && this.ready && this.panel.visible && this.lastMessage) {
      this.panel.webview.postMessage(this.lastMessage);
    }
  }

  private showState(state: "noActiveFile" | "nonMarkdown"): void {
    this.targetUri = undefined;
    this.lastModel = undefined;
    this.clearDebounce();
    if (this.panel) {
      this.panel.title = "Markdown Reader";
    }
    this.send({ type: "state", state });
  }

  // ---- document targeting ---------------------------------------------------

  private setTarget(document: vscode.TextDocument): void {
    this.targetUri = document.uri;
    this.clearDebounce();
    this.refreshLocalResourceRoots(document.uri);
    this.render(document, true);
  }

  private refreshLocalResourceRoots(documentUri: vscode.Uri): void {
    if (!this.panel) {
      return;
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
    const folderUri = workspaceFolder
      ? workspaceFolder.uri
      : vscode.Uri.file(path.dirname(documentUri.fsPath));
    this.panel.webview.options = {
      enableScripts: true,
      enableForms: false,
      enableCommandUris: false,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "dist"),
        folderUri,
      ],
    };
  }

  private render(document: vscode.TextDocument, resetScroll: boolean): void {
    if (!this.panel) {
      return;
    }
    const webview = this.panel.webview;
    const model = renderMarkdown(document.getText(), {
      resolveImage: (src) => this.resolveImage(webview, document.uri, src),
    });

    this.lastModel = {
      uri: document.uri,
      fileName: path.basename(document.fileName),
      html: model.html,
      headings: model.headings,
      isEmpty: model.isEmpty,
    };
    this.panel.title = this.lastModel.fileName;
    this.sendRender(resetScroll);
  }

  private sendRender(resetScroll: boolean): void {
    if (!this.lastModel) {
      return;
    }
    const payload: RenderPayload = {
      fileName: this.lastModel.fileName,
      html: this.lastModel.html,
      headings: this.lastModel.headings,
      isEmpty: this.lastModel.isEmpty,
      settings: this.getRenderSettings(this.lastModel.uri),
      tocCollapsed: this.getTocCollapsed(this.lastModel.uri),
      resetScroll,
    };
    this.send({ type: "render", payload });
  }

  private resolveImage(
    webview: vscode.Webview,
    documentUri: vscode.Uri,
    src: string,
  ): string | null {
    if (/^https?:\/\//i.test(src)) {
      return src;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(src) || path.isAbsolute(src)) {
      return null;
    }
    const resolvedPath = path.normalize(
      path.join(path.dirname(documentUri.fsPath), src),
    );
    return webview.asWebviewUri(vscode.Uri.file(resolvedPath)).toString();
  }

  // ---- vscode event handlers -------------------------------------------------

  private handleDocumentChange(e: vscode.TextDocumentChangeEvent): void {
    if (
      !this.isTarget(e.document.uri) ||
      this.getUpdateMode(e.document.uri) !== "live"
    ) {
      return;
    }
    this.scheduleRender(e.document);
  }

  private handleDocumentSave(document: vscode.TextDocument): void {
    if (!this.isTarget(document.uri)) {
      return;
    }
    this.clearDebounce();
    this.render(document, false);
  }

  private handleDocumentClose(document: vscode.TextDocument): void {
    if (this.isTarget(document.uri)) {
      this.showState("noActiveFile");
    }
  }

  private handleActiveEditorChange(
    editor: vscode.TextEditor | undefined,
  ): void {
    if (!editor) {
      // Focus moved to the reader webview itself (or elsewhere); keep current content.
      return;
    }
    if (editor.document.languageId !== "markdown") {
      this.showState("nonMarkdown");
      return;
    }
    if (!this.isTarget(editor.document.uri)) {
      this.setTarget(editor.document);
    }
  }

  private handleConfigChange(e: vscode.ConfigurationChangeEvent): void {
    if (e.affectsConfiguration("markdown-reader") && this.lastModel) {
      this.sendRender(false);
    }
  }

  private scheduleRender(document: vscode.TextDocument): void {
    this.clearDebounce();
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.render(document, false);
    }, LIVE_DEBOUNCE_MS);
  }

  private clearDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  private isTarget(uri: vscode.Uri): boolean {
    return this.targetUri?.toString() === uri.toString();
  }

  // ---- configuration ----------------------------------------------------------

  private getRenderSettings(uri: vscode.Uri): RenderSettings {
    const config = vscode.workspace.getConfiguration("markdown-reader", uri);
    return {
      contentWidth: clamp(config.get<number>("contentWidth", 552), 320, 1200),
      fontSize: clamp(config.get<number>("fontSize", 16), 12, 32),
    };
  }

  private getUpdateMode(uri: vscode.Uri): "live" | "onSave" {
    return vscode.workspace
      .getConfiguration("markdown-reader", uri)
      .get<"live" | "onSave">("updateMode", "live");
  }

  private getTocCollapsed(uri: vscode.Uri): boolean {
    const explicit = this.context.globalState.get<boolean>(TOC_COLLAPSED_KEY);
    if (explicit !== undefined) {
      return explicit;
    }
    return vscode.workspace
      .getConfiguration("markdown-reader", uri)
      .get<boolean>("tocDefaultCollapsed", false);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
