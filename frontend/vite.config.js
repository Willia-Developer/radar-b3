import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // base: "./" garante que os assets usam caminhos relativos
  // — necessário para funcionar em qualquer subpasta da Hostinger
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    // Evita erro de permissão no Windows ao tentar limpar a pasta dist
    emptyOutDir: false,
    // Chunk de vendor separado para melhor cache
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"]
        }
      }
    }
  }
});
