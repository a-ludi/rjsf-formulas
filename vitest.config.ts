import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'rjsf-v6',
          include: ['tests/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'rjsf-v6-react',
          include: ['tests/**/*.test.tsx'],
          environment: 'jsdom',
        },
      },
      {
        test: {
          name: 'rjsf-v5',
          include: ['tests/**/*.test.ts'],
          environment: 'node',
        },
        resolve: {
          alias: {
            '@rjsf/core': 'rjsf-core-v5',
            '@rjsf/utils': 'rjsf-utils-v5',
            '@rjsf/validator-ajv8': 'rjsf-validator-v5',
          },
        },
      },
      {
        test: {
          name: 'rjsf-v5-react',
          include: ['tests/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup.rjsf-v5.ts'],
        },
        resolve: {
          alias: {
            '@rjsf/core': 'rjsf-core-v5',
            '@rjsf/utils': 'rjsf-utils-v5',
            '@rjsf/validator-ajv8': 'rjsf-validator-v5',
          },
        },
      },
    ],
  },
})
