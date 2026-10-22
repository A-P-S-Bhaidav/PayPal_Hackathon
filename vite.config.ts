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
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-ag-grid': ['ag-grid-community', 'ag-grid-react'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});
