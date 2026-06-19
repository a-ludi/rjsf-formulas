import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'rjsf-v6',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'rjsf-v5',
          include: ['tests/**/*.test.ts'],
        },
        resolve: {
          alias: {
            '@rjsf/core': 'rjsf-core-v5',
            '@rjsf/utils': 'rjsf-utils-v5',
          },
        },
      },
    ],
  },
})
