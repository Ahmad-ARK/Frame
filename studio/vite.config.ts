import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The studio is a client SPA that talks to the local pipeline API (npm run serve
// in ../pipeline, default :8787). Everything under /api is proxied there, so the
// app code uses same-origin /api/* and there's no CORS to fight in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.API_URL ?? "http://localhost:8787",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
        // When the backend isn't running, http-proxy emits ECONNREFUSED. By
        // default Vite answers 500 with an HTML body, which the client can't
        // tell apart from a real server error. Reply with a clean JSON 503 so the
        // app reliably routes it to the friendly "pipeline isn't running" path.
        configure: (proxy) => {
          proxy.on("error", (err, _req, res) => {
            const out = res as any; // ServerResponse when the error is on the HTTP path
            if (out && typeof out.writeHead === "function" && !out.headersSent) {
              out.writeHead(503, { "content-type": "application/json" });
              out.end(JSON.stringify({ error: "pipeline unreachable", code: (err as any)?.code }));
            }
          });
        },
      },
    },
  },
});
