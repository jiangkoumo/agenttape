import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { agentTapeLocalApiPlugin } from "./plugins/agenttape/http/local-api.mjs";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), agentTapeLocalApiPlugin({ workspaceRoot: process.cwd() })],
});
