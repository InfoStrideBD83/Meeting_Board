import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies /api to the existing Express backend (unchanged),
// exactly like vercel.json does in production — so apiFetch('/api/...')
// keeps working unmodified while this React app is developed alongside
// the still-live HTML pages.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5050',
        changeOrigin: true,
      },
    },
  },
});
