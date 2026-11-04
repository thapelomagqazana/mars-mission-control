/**
 * Mars Mission Control — webpack configuration
 *
 * Scope (per assessment brief):
 *   - Vanilla JavaScript SPA — no framework, no transpiler required.
 *   - Single HTML entry point, injected by HtmlWebpackPlugin.
 *   - CSS processed by css-loader + a mode-dependent injector:
 *       development → style-loader (runtime <style> injection)
 *       production  → MiniCssExtractPlugin.loader (linked .css file)
 *   - Static assets (Mars imagery is remote; local assets are decorative only).
 *
 * Two modes:
 *   - development: webpack-dev-server on http://localhost:8080 with HMR
 *     enabled (the app falls back to full reload because its modules do
 *     not call `module.hot.accept()` — see docs/dev-server.md).
 *   - production:  minified bundle in ./dist, ready for static serving.
 *
 * CSS mechanism:
 *   The loader chain is `[<injector>, 'css-loader']` in both modes;
 *   only the injector differs. Development uses `style-loader`,
 *   which injects the CSS as a `<style>` element at runtime — fast,
 *   hot-reloadable, no separate file. Production uses
 *   `MiniCssExtractPlugin.loader`, which emits a real `.css` file
 *   linked from the HTML — required for a strict Content Security
 *   Policy (`style-src 'self'` blocks inline `<style>`) and for
 *   avoiding a flash of unstyled content (the `<link>` blocks
 *   rendering until the CSS loads). The plugin is added only in
 *   production; the development build does not carry it, which is
 *   what keeps the dev loop's CSS HMR working.
 *
 *   A future change that wants to unify the two (e.g., always
 *   extract) would trade the dev loop's HMR for a single code path.
 *   The current choice keeps the dev loop fast and the production
 *   build CSP-safe.
 *
 * Production settings declaration:
 *   `docs/production-build.md` is the reviewable summary of the
 *   production settings: mode, output.path, output.filename,
 *   output.chunkFilename, output.publicPath, output.clean, devtool,
 *   optimization.minimize, target. Every setting is either explicit
 *   here or inherited from `mode: 'production'` with a comment
 *   saying so. A change to a setting is a change to the doc in the
 *   same commit; `tests/unit/node/productionBuild.test.js` asserts
 *   the config's values against the doc.
 *
 * Run:
 *   npm start        → development server
 *   npm run build    → production bundle
 *
 * This config is the source of truth for the build. The Cypress config
 * (`cypress.config.js`) reads the dev server's port from this file via
 * `docs/cypress-configuration.md`; the HTML entry contract
 * (`docs/html-entry.md`) reads the template path and the inject
 * position from here; the dev-server contract (`docs/dev-server.md`)
 * reads the port, host, static directory, HMR, and overlay settings
 * from here; the CSS contract (`docs/css-processing.md`) reads the
 * loader chain and the production mechanism from here; the
 * production-build contract (`docs/production-build.md`) reads the
 * production settings from here. A change to any of these is a change
 * to the corresponding doc and, where relevant, the Cypress config,
 * in the same commit.
 */

const path = require('node:path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

/** Absolute paths keep relative-path mistakes from silently breaking builds. */
const PATHS = {
  src: path.resolve(__dirname, 'src'),
  entry: path.resolve(__dirname, 'src/js/index.js'),
  htmlTemplate: path.resolve(__dirname, 'src/index.html'),
  assets: path.resolve(__dirname, 'src/assets'),
  output: path.resolve(__dirname, 'dist'),
};

/**
 * Build the webpack configuration for the requested mode.
 *
 * @param {Record<string, unknown>} env - webpack env object (unused).
 * @param {{ mode?: string }} argv - webpack CLI arguments.
 * @returns {import('webpack').Configuration}
 */
function buildConfig(env, argv) {
  /**
   * Determine mode from webpack CLI (--mode ...).
   * Default to development so an accidental bare `npx webpack` never ships
   * unminified code as if it were production.
   */
  const isProduction = argv.mode === 'production';

  /**
   * Open the browser on `npm start` only when not in CI.
   *
   * `open: true` is a developer convenience: the terminal starts the
   * server and the browser opens to the app. In CI, there is no
   * browser to open; `open: true` either fails (no display) or emits a
   * warning (no browser). The `CI` env var is set by every major CI
   * provider (GitHub Actions, GitLab, CircleCI); a local run does not
   * set it.
   *
   * The alternative — a `--no-open` flag in the CI script — works, but
   * it hides the decision in the script. Reading `CI` in the config
   * makes the decision visible: the config opens the browser for a
   * developer and does not for CI.
   */
  const openBrowser = !process.env.CI;

  /**
   * The CSS injector differs by mode.
   *
   * - `style-loader` (development): injects the CSS into a `<style>`
   *   element. Fast, hot-reloadable, no separate file. The dev loop
   *   is the priority.
   * - `MiniCssExtractPlugin.loader` (production): extracts the CSS
   *   into a real file. The `<link>` is injected by
   *   `HtmlWebpackPlugin`; the browser blocks rendering until the
   *   file loads (no FOUC), and a strict CSP allows a linked
   *   stylesheet but blocks an inline `<style>`.
   *
   * `css-loader` is in the chain in both modes; only the injector
   * differs. Adding `style-loader` to production would be a defect
   * (the CSS contract's acceptance criterion names it).
   */
  const cssInjector = isProduction
    ? MiniCssExtractPlugin.loader
    : 'style-loader';

  return {
    // ----------------------------------------------------------------
    // Mode — controls webpack's built-in optimizations and devtool.
    // Explicitly 'production' or 'development'. The mode is not
    // inherited from a default; it is the declaration that everything
    // else follows from. `optimization.minimize` (below) is inherited
    // from this mode: production mode enables TerserPlugin.
    // ----------------------------------------------------------------
    mode: isProduction ? 'production' : 'development',

    // ----------------------------------------------------------------
    // Entry — single application entry point (the "app bootstrapper").
    // Layer wiring (store → views → app → index) lives in source, not here.
    // ----------------------------------------------------------------
    entry: PATHS.entry,

    // ----------------------------------------------------------------
    // Output — ./dist. Filenames include a content hash in production so
    // long-term caching works correctly when the app is deployed statically.
    // ----------------------------------------------------------------
    output: {
      // `path` is absolute (from `PATHS.output` = `path.resolve(__dirname,
      // 'dist')`). Webpack requires `output.path` to be absolute; a
      // relative path is a build error.
      path: PATHS.output,
      // `filename` is content-hashed in production. A change to the
      // file's content produces a new hash and a new filename; the
      // browser caches the old file by its hash and fetches the new
      // one. In development, the hash is omitted so the filename is
      // stable for debugging.
      filename: isProduction ? 'js/[name].[contenthash:8].js' : 'js/[name].js',
      // `chunkFilename` follows the same pattern. The app has no
      // dynamic imports today, so no chunk is produced; the setting
      // is the declaration that a future dynamic import would use.
      // Without it, webpack's default (which varies by version)
      // would be used — a default nobody decided.
      chunkFilename: isProduction
        ? 'js/[name].[contenthash:8].js'
        : 'js/[name].js',
      // Clean stale files before each build (prevents orphaned assets
      // when a filename changes — a build that emits only current assets
      // is what "required assets are present" means).
      clean: true,
      // `publicPath` is the URL prefix for emitted assets. `/` is the
      // correct value for an app served from the origin's root (both
      // `localhost:8080/` in dev and a static host in prod). A future
      // deployment under a subpath (e.g. `/mission/`) would set this
      // to the subpath; the `HtmlWebpackPlugin`-injected `<script>`
      // and `<link>` tags would then include the prefix automatically.
      publicPath: '/',
    },

    // ----------------------------------------------------------------
    // Devtool — source maps only in development.
    // Production ships without maps: a source map reveals the source
    // to anyone who opens DevTools, and it is a file the browser
    // downloads for no user benefit. A future change that wants
    // server-side error tracking generates the map but does not serve
    // it (`devtool: 'hidden-source-map'`); the map is uploaded to the
    // error tracker, not linked from the bundle.
    // ----------------------------------------------------------------
    devtool: isProduction ? false : 'eval-cheap-module-source-map',

    // ----------------------------------------------------------------
    // Module rules — CSS and images. JavaScript is native ES2020+, so no
    // Babel loader is configured: adding one without a transpilation
    // need would be unnecessary complexity.
    // ----------------------------------------------------------------
    module: {
      rules: [
        {
          test: /\.css$/i,
          // The injector is mode-dependent (see `cssInjector` above).
          // The chain is `[<injector>, 'css-loader']`; `css-loader`
          // resolves `@import` and `url()` inside the CSS in both
          // modes.
          use: [cssInjector, 'css-loader'],
        },
        {
          test: /\.(png|jpe?g|gif|svg|webp)$/i,
          type: 'asset/resource',
          generator: {
            // Local images only. The Mars hero image is loaded from
            // Unsplash at runtime, so no bundler entry is needed for it.
            filename: 'assets/[name].[contenthash:8][ext]',
          },
        },
      ],
    },

    // ----------------------------------------------------------------
    // Plugins
    // ----------------------------------------------------------------
    plugins: [
      /**
       * HtmlWebpackPlugin — generates ./dist/index.html from the source
       * template and injects hashed <script>/<link> tags automatically.
       *
       * The template is `src/index.html`, which contains the root mount
       * element (`<div id="app-root"></div>`). The `inject: 'body'`
       * option puts the bundled script at the end of <body>, after the
       * mount div — the only arrangement that guarantees the mount
       * exists when the script runs. The entry code's `querySelector`
       * for `#app-root` returns null if the script runs before the
       * mount is parsed; the htmlEntry test asserts the contract.
       *
       * In production, the plugin also injects the extracted CSS's
       * `<link rel="stylesheet">` into the `<head>`. The `<link>` is
       * what makes the CSS available to the browser without an inline
       * `<style>` (which a strict CSP would block).
       *
       * The `title` option is deliberately omitted: the template
       * hard-codes `<title>Mars Mission Control</title>`. If a future
       * change wants a dynamic title, the template must include the
       * placeholder `<%= htmlWebpackPlugin.options.title %>`, and this
       * config must set the option. Adding the option without the
       * placeholder is a no-op that a future reader would have to
       * debug; omitting it is the honest configuration.
       *
       * The `favicon` option is deliberately omitted: the app has no
       * favicon. A browser requests `/favicon.ico` by default and gets
       * a 404, which is cosmetic and tolerated by the Cypress support
       * file. A future change that wants a favicon adds a file to
       * `src/assets/` and points this option at it.
       */
      new HtmlWebpackPlugin({
        template: PATHS.htmlTemplate,
        filename: 'index.html',
        inject: 'body',
      }),

      /**
       * CopyWebpackPlugin — copies anything under src/assets/ that
       * webpack hasn't already processed (e.g. future PDFs, JSON data)
       * into dist. The .gitkeep placeholder is ignored.
       *
       * Why this is needed: `src/assets/` is where a future contributor
       * puts a static file that is not imported by the bundle (a
       * favicon, a PDF, a JSON fixture for a demo). Without this
       * plugin, the file would not reach `dist/` and would 404 when
       * the app requested it. The plugin copies the folder; the
       * `globOptions` ignore keeps the placeholder out of the build.
       */
      new CopyWebpackPlugin({
        patterns: [
          {
            from: PATHS.assets,
            to: 'assets',
            noErrorOnMissing: true,
            globOptions: {
              ignore: ['**/.gitkeep'],
            },
          },
        ],
      }),

      /**
       * MiniCssExtractPlugin — extracts the CSS into a real `.css` file
       * in production. The plugin is added only in production; its
       * absence in development is what keeps the dev loop's CSS HMR
       * working (an extracted file would not be HMR-updated; a change
       * to a CSS file would require a full reload).
       *
       * The output filename `css/[name].[contenthash:8].css` places
       * the CSS in `dist/css/` with a content hash. A CSS-only change
       * produces a new hash and a new filename; the browser caches the
       * old file by its hash and fetches the new one. The JS bundle's
       * filename is unchanged by a CSS-only change, which is the
       * cacheability win of extracting the CSS.
       *
       * Why the plugin is not added in development:
       *   `style-loader` is the development injector; the CSS is not
       *   extracted, so the plugin has nothing to extract. Adding the
       *   plugin in development would produce a `.css` file that the
       *   `<style>`-based dev loop does not use — a confusing artefact
       *   with no purpose.
       */
      ...(isProduction
        ? [
            new MiniCssExtractPlugin({
              filename: 'css/[name].[contenthash:8].css',
            }),
          ]
        : []),
    ],

    // ----------------------------------------------------------------
    // Dev server — `npm start`. Port 8080 matches the delivery note,
    // the Cypress config's `baseUrl`, and the runtime baseline. A
    // change to the port is a change to `cypress.config.js`,
    // `docs/cypress-configuration.md`, and `docs/runtime-baseline.md`
    // in the same commit.
    // ----------------------------------------------------------------
    devServer: {
      // The static directory is `dist/`, because webpack-dev-server
      // serves the *emitted* output, not the source tree. The
      // `HtmlWebpackPlugin` emits `dist/index.html`; the
      // `CopyWebpackPlugin` copies `src/assets/` to `dist/assets/`.
      // A future contributor who changes this to `src/` would serve
      // the source template (with no injected script) and the app
      // would not boot.
      static: {
        directory: PATHS.output,
      },
      port: 8080,
      host: 'localhost',
      // HMR is enabled. The app's modules do not call
      // `module.hot.accept()`, so the browser falls back to a full
      // page reload on a source change. This is the correct setting
      // for a future change that adds HMR handlers; the current
      // behaviour (full reload) is recorded in `docs/dev-server.md`.
      hot: true,
      // Open the browser on `npm start` unless we are in CI. A CI
      // machine has no display; `open: true` would fail or warn. The
      // env-var check makes the decision visible in the config rather
      // than in a CI script that passes `--no-open`.
      open: openBrowser,
      // Serve index.html for any 404 so a SPA refresh on a deep link
      // doesn't break (defensive; the app is single-route today).
      historyApiFallback: true,
      // Surface overlay errors so a runtime error is caught the
      // moment it happens, not on a failed assertion minutes later.
      // Warnings are not overlaid — they are less urgent and are
      // visible in the terminal.
      client: {
        overlay: {
          errors: true,
          warnings: false,
        },
      },
    },

    // ----------------------------------------------------------------
    // Optimization — sensible production split. In development,
    // webpack's default is fine; in production, keep one vendor chunk
    // out of app code so caching behaves predictably if a third-party
    // lib is ever added.
    //
    // `minimize` is NOT set. `mode: 'production'` enables TerserPlugin
    // by default; the inheritance is the declaration (a future change
    // that wants to disable minimization sets `minimize: false` and
    // documents why). Setting `minimize: true` explicitly would be a
    // no-op that a reader might mistake for a decision.
    // ----------------------------------------------------------------
    optimization: {
      splitChunks: isProduction ? { chunks: 'all' } : false,
      // Deterministic module IDs improve long-term cache hit rate.
      moduleIds: 'deterministic',
    },

    // ----------------------------------------------------------------
    // Resolve — allow importing without file extensions in source.
    // ----------------------------------------------------------------
    resolve: {
      extensions: ['.js', '.json'],
      alias: {
        '@': PATHS.src,
      },
    },

    // ----------------------------------------------------------------
    // Performance hints — warn in production if a bundle grows past
    // 300 KB. The current app is a few KB of vanilla JS; 300 KB is a
    // generous ceiling that leaves room for a small library without
    // being so large that a runaway bundle goes unnoticed.
    //
    // The threshold is a warning, not an error: a build that grows
    // past it still produces output, but the warning is visible in
    // the build log. A future change that adds a large library can
    // either keep the threshold and accept the warning, or raise the
    // threshold with a note in the commit message.
    // ----------------------------------------------------------------
    performance: {
      hints: isProduction ? 'warning' : false,
      maxAssetSize: 300_000,
      maxEntrypointSize: 300_000,
    },

    // ----------------------------------------------------------------
    // Stats — concise output so build evidence is legible.
    // ----------------------------------------------------------------
    stats: 'minimal',

    // ----------------------------------------------------------------
    // Target — modern browsers only (matches browserslist in
    // package.json). Cypress 13 runs Chromium/Firefox/Edge, all of
    // which support this.
    // ----------------------------------------------------------------
    target: 'web',
  };
}

module.exports = buildConfig;