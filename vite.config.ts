/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    // Fixture value so configFinder's required-env check passes under test.
    // Not a real project URL.
    env: {
      VITE_SUPABASE_STORAGE_URL:
        "https://test.supabase.co/storage/v1/object/public/viz-data",
    },
  },
}));
