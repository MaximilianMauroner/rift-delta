import { availableParallelism } from 'node:os'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/dps/**/*.test.{ts,tsx}'],
    maxWorkers: Math.max(1, Math.min(availableParallelism() - 1, 2)),
    testTimeout: 30_000,
  },
})
