import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = new URL(".", import.meta.url).pathname;

export default defineConfig({
  root: projectRoot,
  base: "./",
  plugins: [react()],
  build: {
    outDir: `${projectRoot}dist`,
    emptyOutDir: true,
    assetsInlineLimit: 100_000,
    rollupOptions: {
      input: { ui: `${projectRoot}src/ui/index.html` },
      output: {
        entryFileNames: "ui.js",
        assetFileNames: "ui.[ext]",
      },
    },
  },
});
