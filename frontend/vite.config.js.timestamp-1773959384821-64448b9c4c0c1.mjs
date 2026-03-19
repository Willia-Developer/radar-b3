// vite.config.js
import { defineConfig } from "file:///sessions/friendly-gallant-curie/mnt/files/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///sessions/friendly-gallant-curie/mnt/files/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
var vite_config_default = defineConfig({
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
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvZnJpZW5kbHktZ2FsbGFudC1jdXJpZS9tbnQvZmlsZXMvZnJvbnRlbmRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9zZXNzaW9ucy9mcmllbmRseS1nYWxsYW50LWN1cmllL21udC9maWxlcy9mcm9udGVuZC92aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vc2Vzc2lvbnMvZnJpZW5kbHktZ2FsbGFudC1jdXJpZS9tbnQvZmlsZXMvZnJvbnRlbmQvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICAvLyBiYXNlOiBcIi4vXCIgZ2FyYW50ZSBxdWUgb3MgYXNzZXRzIHVzYW0gY2FtaW5ob3MgcmVsYXRpdm9zXG4gIC8vIFx1MjAxNCBuZWNlc3NcdTAwRTFyaW8gcGFyYSBmdW5jaW9uYXIgZW0gcXVhbHF1ZXIgc3VicGFzdGEgZGEgSG9zdGluZ2VyXG4gIGJhc2U6IFwiLi9cIixcbiAgcGx1Z2luczogW3JlYWN0KCldLFxuICBidWlsZDoge1xuICAgIG91dERpcjogXCJkaXN0XCIsXG4gICAgLy8gRXZpdGEgZXJybyBkZSBwZXJtaXNzXHUwMEUzbyBubyBXaW5kb3dzIGFvIHRlbnRhciBsaW1wYXIgYSBwYXN0YSBkaXN0XG4gICAgZW1wdHlPdXREaXI6IGZhbHNlLFxuICAgIC8vIENodW5rIGRlIHZlbmRvciBzZXBhcmFkbyBwYXJhIG1lbGhvciBjYWNoZVxuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIG91dHB1dDoge1xuICAgICAgICBtYW51YWxDaHVua3M6IHtcbiAgICAgICAgICB2ZW5kb3I6IFtcInJlYWN0XCIsIFwicmVhY3QtZG9tXCJdXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUEyVSxTQUFTLG9CQUFvQjtBQUN4VyxPQUFPLFdBQVc7QUFFbEIsSUFBTyxzQkFBUSxhQUFhO0FBQUE7QUFBQTtBQUFBLEVBRzFCLE1BQU07QUFBQSxFQUNOLFNBQVMsQ0FBQyxNQUFNLENBQUM7QUFBQSxFQUNqQixPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUE7QUFBQSxJQUVSLGFBQWE7QUFBQTtBQUFBLElBRWIsZUFBZTtBQUFBLE1BQ2IsUUFBUTtBQUFBLFFBQ04sY0FBYztBQUFBLFVBQ1osUUFBUSxDQUFDLFNBQVMsV0FBVztBQUFBLFFBQy9CO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
