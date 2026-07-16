const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** Copies static webview assets into dist/ after every webview build. */
const copyAssetsPlugin = {
  name: "copy-assets",
  setup(build) {
    build.onEnd(() => {
      fs.mkdirSync("dist", { recursive: true });
      fs.copyFileSync(
        path.join("media", "reader.css"),
        path.join("dist", "reader.css"),
      );
      fs.copyFileSync(
        path.join("node_modules", "mermaid", "dist", "mermaid.min.js"),
        path.join("dist", "mermaid.min.js"),
      );
    });
  },
};

async function main() {
  const extensionCtx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    outfile: "dist/extension.js",
    platform: "node",
    format: "cjs",
    target: "node18",
    external: ["vscode"],
    sourcemap: !production,
    minify: production,
    logLevel: "warning",
  });

  const webviewCtx = await esbuild.context({
    entryPoints: ["src/webview/main.ts"],
    bundle: true,
    outfile: "dist/webview.js",
    platform: "browser",
    format: "iife",
    target: "es2020",
    sourcemap: !production,
    minify: production,
    logLevel: "warning",
    plugins: [copyAssetsPlugin],
  });

  if (watch) {
    await extensionCtx.watch();
    await webviewCtx.watch();
  } else {
    await extensionCtx.rebuild();
    await webviewCtx.rebuild();
    await extensionCtx.dispose();
    await webviewCtx.dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
