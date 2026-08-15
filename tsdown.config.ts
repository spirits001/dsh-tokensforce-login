import { defineConfig } from 'tsdown'

/**
 * Mirrors the harness client-bundle contract (packages/client/tsdown.client.ts):
 * the browser artifact is a closure-factory CJS bundle registered through
 * `window.__ModuleLoader__.load`, with externals resolved by the loader's
 * frozen module table (platform modules + the documented runtime/client
 * exemption). Everything else inlines; every @deepseek-ai value import beyond
 * the table is a bundling error by that same rule.
 */
const PLUGIN_ID = 'dsh-tokensforce'

const PLATFORM_EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
] as const

const clientPurity = {
  name: 'dsh-tokensforce-client-purity',
  resolveId(source: string) {
    if (!source.startsWith('@deepseek-ai/')) return null
    if ((PLATFORM_EXTERNALS as readonly string[]).includes(source)) return null
    throw new Error(
      `client bundle purity: "${source}" is not a platform module — cross-plugin value imports are forbidden; `
      + 'collaborate through cordis services (type-only imports are erased and never reach this gate)',
    )
  },
}

export default defineConfig([
  {
    name: `${PLUGIN_ID} (node)`,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    dts: false,
    clean: true,
    external: [/^@deepseek-ai\//, /^react($|\/)/],
  },
  {
    name: `${PLUGIN_ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    clean: false,
    sourcemap: true,
    external: [...PLATFORM_EXTERNALS],
    noExternal: (id: string) => ((PLATFORM_EXTERNALS as readonly string[]).includes(id) ? undefined : true),
    plugins: [clientPurity],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
