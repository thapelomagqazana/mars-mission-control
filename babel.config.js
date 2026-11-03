/**
 * Babel configuration for Jest.
 *
 * Purpose:
 *   Jest's default runtime expects CommonJS. Our source files and tests
 *   use ESM syntax. Babel transforms them to CJS so Jest can execute
 *   them without needing Node's experimental ESM mode.
 *
 * Scope:
 *   This config is used by babel-jest during test runs only. It does not
 *   affect the webpack build, which handles its own module resolution.
 */

module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        // Target the Node version running the tests, not browsers.
        // This keeps the transform minimal and fast.
        targets: { node: 'current' },
        // Emit CommonJS so Jest can require() the transformed files.
        modules: 'commonjs',
      },
    ],
  ],
};