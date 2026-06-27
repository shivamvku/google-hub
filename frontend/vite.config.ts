import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: "automatic",   // suppresses the rolldown jsx key warning in Vite 8
    }),
  ],
  server: {
    port: 5174,
    strictPort: true,
  },
});
