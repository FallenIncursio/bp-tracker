import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: [
        'src/auth/discord.ts',
        'src/auth/auth.middleware.ts',
        'src/auth/roles.ts',
        'src/auth/session.ts',
        'src/blueprints/blueprint.dto.ts',
        'src/notifications/discord.ts',
        'src/notifications/notification.service.ts',
        'src/sirius/sirius-parts.ts',
        'src/sirius/sirius.rules.ts',
        'src/utils/http.ts',
      ],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
})
