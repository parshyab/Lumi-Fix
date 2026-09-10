import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const emitted = resolve(projectRoot, "dist/src/ui/index.html");
const target = resolve(projectRoot, "dist/ui.html");

if (!existsSync(emitted)) throw new Error(`Vite did not emit the UI entry: ${emitted}`);
mkdirSync(dirname(target), { recursive: true });
renameSync(emitted, target);
const html = readFileSync(target, "utf8").replaceAll("../../ui.js", "./ui.js").replaceAll("../../ui.css", "./ui.css");
writeFileSync(target, html);
const nested = resolve(projectRoot, "dist/src");
if (existsSync(nested)) rmSync(nested, { recursive: true, force: true });
