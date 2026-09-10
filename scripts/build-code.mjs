import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const uiHtml = readFileSync(resolve(projectRoot, "dist/ui.html"), "utf8");
const uiJs = readFileSync(resolve(projectRoot, "dist/ui.js"), "utf8").replaceAll("</script>", "<\\/script>");
const uiCss = readFileSync(resolve(projectRoot, "dist/ui.css"), "utf8");
const embeddedUiHtml = uiHtml
  .replace(/<script[^>]*src="\.\/ui\.js"[^>]*><\/script>/, () => "")
  .replace(/<link[^>]*href="\.\/ui\.css"[^>]*>/, () => `<style>${uiCss}</style>`)
  .replace(/<\/body>/, () => `<script>${uiJs}</script>\n  </body>`);

await build({
  entryPoints: [resolve(projectRoot, "src/code.ts")],
  bundle: true,
  format: "iife",
  target: "es2020",
  outfile: resolve(projectRoot, "dist/code.js"),
  tsconfig: resolve(projectRoot, "tsconfig.json"),
  define: { __html__: JSON.stringify(embeddedUiHtml) },
});
