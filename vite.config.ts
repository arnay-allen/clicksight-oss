import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
  },
  optimizeDeps: {
    exclude: ['@monaco-editor/react'],
  },
  build: {
    target: 'esnext',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (id.includes('antd')) {
            return 'antd';
          }

          if (id.includes('@monaco-editor')) {
            return 'monaco-editor';
          }

          if (
            id.includes('chart.js') ||
            id.includes('react-chartjs-2') ||
            id.includes('recharts') ||
            id.includes('d3-')
          ) {
            return 'charts';
          }

          if (id.includes('sql-formatter') || id.includes('@react-oauth')) {
            return 'utilities';
          }

          return undefined;
        },
      },
    },
  },
});

