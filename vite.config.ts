import { defineConfig, loadEnv, mergeConfig } from 'vite'
import { defineConfig as defineTestConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return mergeConfig({
    base: env.VITE_APP_BASE_PATH ?? '/',
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET ?? 'http://127.0.0.1:5050',
          changeOrigin: true,
        },
      },
    },
  }, defineTestConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test-setup.ts'],
    },
  }))
})
