import * as vscode from "vscode";

import { ReaderPanel } from "./readerPanel";

export function activate(context: vscode.ExtensionContext): void {
  if (context.extensionMode === vscode.ExtensionMode.Development) {
    const output = vscode.window.createOutputChannel("Markdown Reader (Dev)");
    output.appendLine(
      `[activate] id=${context.extension.id} version=${context.extension.packageJSON.version}`,
    );
    output.appendLine(
      `[activate] extensionPath=${context.extension.extensionPath}`,
    );
    context.subscriptions.push(output);
  }

  const panel = new ReaderPanel(context);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-reader.open",
      (uri?: vscode.Uri) => {
        panel.openFor(resolveTargetDocument(uri));
      },
    ),
    panel,
  );
}

function resolveTargetDocument(
  uri?: vscode.Uri,
): vscode.TextDocument | undefined {
  if (uri) {
    const editor = vscode.window.visibleTextEditors.find(
      (e) => e.document.uri.toString() === uri.toString(),
    );
    if (editor) {
      return editor.document;
    }
  }
  return vscode.window.activeTextEditor?.document;
}

export function deactivate(): void {
  // Panel disposal is handled via context.subscriptions.
}
