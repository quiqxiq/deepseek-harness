import { defineConfig } from 'tsdown'

/** Build the bundle glue and its two function-plugin subpaths. */
export default defineConfig([
  {
    entry: ['lib/types/index.js', 'lib/types/policy.js', 'lib/types/read-only-guard.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
])
