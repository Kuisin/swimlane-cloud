import * as vscode from "vscode";

/**
 * The webview shell.
 *
 * `style-src` must allow `'unsafe-inline'`. That is not laziness: the generated
 * SVG carries inline `style=` attributes on its root element, and the editor
 * injects it (and several previews) through `dangerouslySetInnerHTML`. With a
 * strict style-src the workbench silently strips those and the preview loses
 * its sizing and background.
 *
 * `img-src blob:` is needed by the PNG export path, which draws the SVG onto a
 * canvas via a blob URL.
 */
export function webviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = makeNonce();
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview.js"));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview.css"));

  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} blob: data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
    "connect-src 'none'",
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="${style}" rel="stylesheet" />
    <title>Swimlane Diagrams</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${script}"></script>
  </body>
</html>`;
}

function makeNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}
