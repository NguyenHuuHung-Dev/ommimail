import { copyFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-spa-htaccess",
      closeBundle() {
        copyFileSync("public/.htaccess", "dist/.htaccess");
      },
    },
  ],
  server: { port: 5173 },
});
