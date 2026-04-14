import { defineConfig, loadEnv, mergeConfig } from 'vite'
import { defineConfig as defineTestConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return mergeConfig({
    plugins: [react()],
    server: {
      proxy: {
        '/api/alpaca': {
          target: 'https://data.alpaca.markets',
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/api\/alpaca/, ''),
          headers: {
            'APCA-API-KEY-ID': env.ALPACA_KEY_ID ?? '',
            'APCA-API-SECRET-KEY': env.ALPACA_SECRET_KEY ?? '',
          },
        },
        '/api/sahmk': {
          target: env.SAHMK_BASE_URL ?? 'https://app.sahmk.sa/api/v1',
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/api\/sahmk/, ''),
          headers: {
            'X-API-Key': env.SAHMK_API_KEY ?? '',
          },
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
