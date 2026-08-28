import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@slide-to-pay/react": path.resolve(__dirname, "../../src/index.ts"),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
