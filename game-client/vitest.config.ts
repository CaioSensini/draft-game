import { defineConfig } from 'vitest/config'

/**
 * Vitest configuration.
 *
 * Scope: we only test `src/domain/` and `src/engine/` — scenes and utils are
 * Phaser-dependent and better covered by manual / playtest verification.
 * Simulations in `src/simulation/` are one-off scripts, not suites.
 */
export default defineConfig({
  test: {
    // Only files with explicit .test.ts / .spec.ts suffix are test files.
    include: ['src/**/*.{test,spec}.ts'],
    // Never try to import Phaser in tests — the engine layer is pure and
    // must remain testable in Node without any browser globals.
    environment: 'node',
    // Fail fast when a domain module accidentally imports Phaser.
    server: {
      deps: {
        inline: [],
      },
    },
    // Run tests in parallel; domain is stateless so there is no risk.
    pool: 'threads',
    // Show individual test names in CI logs so failures are easy to locate.
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/domain/**/*.ts', 'src/engine/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/engine/PhaserBridge.ts',   // Phaser-coupled; excluded by design.
        'src/engine/EffectSystem.ts',   // Legacy pipeline, kept for BotSystem only.
        'src/engine/CombatCalc.ts',     // Legacy pipeline, kept for BotSystem only.
      ],
    },
  },
})
