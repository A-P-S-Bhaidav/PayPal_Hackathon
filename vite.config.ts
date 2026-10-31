import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/extension.zip': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/postman': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1100,
    modulePreload: {
      resolveDependencies: (_filename, deps) =>
        deps.filter((dep) => !dep.includes('ag-grid') && !dep.includes('DiagnosticsLab')),
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/ag-grid-community') || id.includes('node_modules/ag-grid-react')) {
            return 'vendor-ag-grid';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          return undefined;
        },
      },
    },
  },
});
