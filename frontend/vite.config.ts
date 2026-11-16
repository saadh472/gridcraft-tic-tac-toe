import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5175, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8095' } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'], restoreMocks: true, pool: 'threads', maxWorkers: 1, fileParallelism: false }
});
