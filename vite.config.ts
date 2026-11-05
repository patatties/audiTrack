import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "child_process";

function getAppVersion(): string {
  // Docker builds have no .git; the version is passed in as a build arg instead.
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    const raw = execSync('git describe --tags --match "v*" --long', { encoding: "utf8" }).trim();
    const match = raw.match(/^(v\d+)-(\d+)-g[a-f0-9]+$/);
    if (match) {
      const tag = match[1];
      const count = parseInt(match[2]);
      return count === 0 ? tag : `${tag}.${count}`;
    }
    return raw;
  } catch {
    return "dev";
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": {
        // `npm run server` (API + database) listens on port 3000.
        target: process.env.VITE_API_TARGET ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(getAppVersion()),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
