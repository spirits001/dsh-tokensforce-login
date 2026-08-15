import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    // dsh-client-runtime's client module reads `window` at import time.
    environment: 'happy-dom',
  },
})
