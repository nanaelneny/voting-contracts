import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { securityHeaders, devHeaders } from "./security-headers.js";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    headers: devHeaders,
    // Send /api requests to the backend, so the browser only ever talks to one address.
    proxy: { "/api": "http://localhost:5000" },
  },
  preview: { port: 3000, headers: securityHeaders, proxy: { "/api": "http://localhost:5000" } },
});
