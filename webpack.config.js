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
 * Design-token discipline (added for the theme-color path):
 *   The HTML entry needs one design value — the browser chrome colour
 *   (`<meta name="theme-color">`). Its canonical source is
 *   --color-bg-elevated in src/css/tokens.css. This config reads it from
 *   that file at build time and injects it into the template via
 *   HtmlWebpackPlugin's templateParameters, so src/index.html contains
 *   zero hand-written design literals. This is the only build-time
 *   coupling between the register and the HTML, and it is a small regex
 *   against a file this project owns — the same file the tokenTraceability
 *   test asserts is the only place a hex colour may appear.
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
 * CSS import order — a build-time contract, not a runtime convention:
 *   `src/js/index.js` imports `../css/tokens.css` BEFORE `../css/styles.css`.
 *   This is the order the loader chain concatenates in. If a future
 *   contributor reorders the imports, `var(--…)` resolves to nothing on
 *   first paint and the app renders unstyled — a failure that no unit
 *   test catches today. This config's role is to document the invariant;
 *   the enforcement is a comment in index.js and (optionally) a future
 *   unit test that reads the entry's source. The change is not to enforce
 *   it here — webpack has no hook that says "this import must precede
 *   that one" — but to make the invariant visible where CSS processing
 *   is described.
 *
 * Production settings declaration:
 *   `docs/production-build.md` is the reviewable summary of the
 *   production settings: mode, output.path, output.filename,
 *   output.chunkFilename, output.publicPath, output.clean, devtool,
 *   optimization.minimize, target, templateParameters.themeColor. Every
 *   setting is either explicit here or inherited from
 *   `mode: 'production'` with a comment saying so. A change to a
 *   setting is a change to the doc in the same commit;
 *   `tests/unit/node/productionBuild.test.js` asserts the config's
 *   values against the doc.
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
const fs = require('node:fs'); // used by readTokenFromSource
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

/**
 * Absolute paths keep relative-path mistakes from silently breaking builds.
 * `tokensFile` is a path the config owns, not a path derived from the
 * current working dir: the register is read at build time, and a wrong
 * path must fail the build rather than fall back to some other file.
 */
const PATHS = {
  src: path.resolve(__dirname, 'src'),
  entry: path.resolve(__dirname, 'src/js/index.js'),
  htmlTemplate: path.resolve(__dirname, 'src/index.html'),
  tokensFile: path.resolve(__dirname, 'src/css/tokens.css'),
  assets: path.resolve(__dirname, 'src/assets'),
  output: path.resolve(__dirname, 'dist'),
};

/**
 * Read a design token's value from the register file.
 *
 * Why this is a build-time read (and not a runtime read):
 *   The one place HTML needs a design value is `<meta name="theme-color">`,
 *   which the browser reads at parse time — before JavaScript runs. A
 *   runtime read (the `readToken()` in src/js/utils/tokens.js) cannot
 *   serve this case; the meta must be in the emitted HTML. The build is
 *   the last moment at which the value is still sourced from the register
 *   without hand-editing the template.
 *
 * Why this is synchronous and regex-based:
 *   The webpack config is evaluated synchronously. Adding an async
 *   filesystem read would mean either a `module.exports = Promise` (which
 *   webpack's older config-loading path did not support, and which
 *   surprises contributors) or a `child_process` (worse). A sync
 *   `readFileSync` of a file this project owns is the right tool.
 *
 * Why the regex is narrow:
 *   The register is a hand-written CSS file with one declaration per
 *   line. A regex that matched arbitrary CSS would be fragile; a regex
 *   that matches `--<name>: <value>;` is exact for this file's shape.
 *   The narrowness is the feature: if a future change reformats the
 *   register in a way the regex cannot read, the config throws a clear
 *   error rather than silently producing a wrong value.
 *
 * @param {string} tokenName - bare name, without the leading `--`.
 * @returns {string} the token's declared value.
 * @throws {Error} if the token is not declared, or if its value is
 *   another var() (which this reader deliberately does not follow —
 *   a theme-color needs a concrete value, not a reference).
 */
function readTokenFromSource(tokenName) {
  let source;
  try {
    source = fs.readFileSync(PATHS.tokensFile, 'utf8');
  } catch (err) {
    throw new Error(
      `Build error: could not read design tokens at ${PATHS.tokensFile}. ` +
        `The HTML template needs --${tokenName} for theme-color. ` +
        `Original error: ${err.message}`
    );
  }

  // Escape the token name's regex metacharacters so --breakpoint-tablet
  // cannot accidentally match --breakpoint-tablet-wide. The character
  // class below is the standard "escape a literal for use in a regex"
  // set: . * + ? ^ $ { } ( ) | [ ] and backslash. It is written as a
  // regex literal for readability — a raw-string form cannot be used
  // here because the class itself contains `${`, which a template
  // literal would read as an interpolation.
  const escaped = tokenName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`--${escaped}\\s*:\\s*([^;]+);`);

  const match = source.match(pattern);
  if (!match) {
    throw new Error(
      `Build error: token --${tokenName} not found in ${PATHS.tokensFile}. ` +
        `The HTML template references it for theme-color; add the token ` +
        `to the register or update the template's expression.`
    );
  }

  const value = match[1].trim();
  if (value.startsWith('var(')) {
    throw new Error(
      `Build error: token --${tokenName} resolves to another var(), which ` +
        `the HTML template cannot consume (theme-color needs a literal). ` +
        `Give this token a literal value in ${PATHS.tokensFile}.`
    );
  }
  return value;
}

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
   * In CI the command runs headless, and an attempt to open a browser
   * either does nothing or fails the process on a machine with no
   * display. Gating on `process.env.CI` (set by every common CI
   * provider) keeps the local convenience without the CI breakage.
   */
  const openBrowser = !process.env.CI;

  /**
   * The CSS injector differs by mode.
   *
   * Development uses `style-loader`: CSS is injected into a `<style>`
   * element at runtime, which is what makes CSS hot-reload work — the
   * loader can swap the style content without a page reload.
   *
   * Production uses `MiniCssExtractPlugin.loader`: CSS is emitted as a
   * real `.css` file linked from the HTML, which a strict CSP
   * (`style-src 'self'`) accepts and which avoids a flash of unstyled
   * content (the `<link>` blocks rendering until the CSS arrives).
   *
   * The rest of the loader chain (`css-loader`) is identical in both
   * modes; only the injector that consumes css-loader's output changes.
   */
  const cssInjector = isProduction
    ? MiniCssExtractPlugin.loader
    : 'style-loader';

  /**
   * Read the theme-color from the register.
   *
   * Done here (not inline in the plugin list) so the error surfaces
   * with a message that names the token and the fix. Doing it inside
   * `new HtmlWebpackPlugin({...})` would produce a stack trace from
   * deep in webpack's config parsing, which is harder to read.
   *
   * The read happens unconditionally (both modes), so a missing token
   * fails `npm start` as well as `npm run build`. A dev-only failure
   * is the right behaviour: the dev build's HTML needs the same value,
   * and catching it in dev is cheaper than catching it in prod.
   */
  const themeColor = readTokenFromSource('color-bg-elevated');

  return {
    // ----------------------------------------------------------------
    // Mode — controls webpack's built-in optimizations and devtool.
    //
    // 'production' turns on minification, tree-shaking, and scope
    // hoisting; 'development' keeps the output readable and the build
    // fast. The explicit ternary means the mode is never inferred from
    // a missing flag.
    // ----------------------------------------------------------------
    mode: isProduction ? 'production' : 'development',

    // ----------------------------------------------------------------
    // Entry — single application entry point (the "app bootstrapper").
    //
    // Layer wiring (store → views → app → index) lives in source, not
    // here. The entry imports the store, the views, the event layer,
    // and the CSS in the order that source specifies; webpack only
    // needs to know where to start.
    // ----------------------------------------------------------------
    entry: PATHS.entry,

    // ----------------------------------------------------------------
    // Output — ./dist.
    //
    // Filenames include a content hash in production so long-term
    // caching works correctly when the app is deployed statically: a
    // changed file gets a new name, an unchanged file keeps its name.
    // `chunkFilename` covers split chunks (e.g. the vendor chunk that
    // `splitChunks` produces in production).
    //
    // `clean: true` removes stale files before each build, which
    // prevents orphaned assets when a filename changes.
    //
    // `publicPath: '/'` makes asset URLs absolute from the site root,
    // which is correct for a single-page app served from the root.
    // ----------------------------------------------------------------
    output: {
      path: PATHS.output,
      filename: isProduction ? 'js/[name].[contenthash:8].js' : 'js/[name].js',
      chunkFilename: isProduction
        ? 'js/[name].[contenthash:8].js'
        : 'js/[name].js',
      clean: true,
      publicPath: '/',
    },

    // ----------------------------------------------------------------
    // Devtool — source maps only in development.
    //
    // Production ships without maps to keep the bundle small and avoid
    // leaking source in the deliverable. The development map is
    // 'eval-cheap-module-source-map', which is fast to build and maps
    // back to the original module rather than the bundled output.
    // ----------------------------------------------------------------
    devtool: isProduction ? false : 'eval-cheap-module-source-map',

    // ----------------------------------------------------------------
    // Module rules — CSS and images.
    //
    // CSS: css-loader resolves `@import` and `url()` references;
    // the mode-dependent injector consumes its output.
    //
    // Images: `asset/resource` emits each imported image as a file
    // with a content hash. The Mars hero image is loaded from Unsplash
    // at runtime and never enters the bundle; local images are
    // decorative only. This rule owns every image under the source
    // tree, so no separate copy step is needed (see the plugin list).
    // ----------------------------------------------------------------
    module: {
      rules: [
        {
          test: /\.css$/i,
          use: [cssInjector, 'css-loader'],
        },
        {
          test: /\.(png|jpe?g|gif|svg|webp)$/i,
          type: 'asset/resource',
          generator: {
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
       * `templateParameters` supplies the template's `<%= themeColor %>`
       * expression with the value read from the token register. Without
       * it, the template's expression is a build error ("themeColor is
       * not defined"); with it, the meta's `content` is the token's
       * value at build time, and the tokenTraceability test keeps the
       * template expression honest.
       *
       * The template lives at `src/index.html` and contains the root
       * mount element (`<div id="app-root"></div>`). `inject: 'body'`
       * puts the bundled script at the end of `<body>`, after the mount
       * div — the only arrangement that guarantees the mount exists
       * when the script runs. The htmlEntry test asserts the contract.
       *
       * The `title` and `favicon` options are deliberately omitted:
       * the title lives in the template (one place, not two), and there
       * is no favicon asset in the project, so pointing the plugin at
       * one would fail the build.
       */
      new HtmlWebpackPlugin({
        template: PATHS.htmlTemplate,
        filename: 'index.html',
        inject: 'body',
        templateParameters: {
          // The only design value the HTML needs, sourced from the
          // register. If --color-bg-elevated changes, the meta changes
          // on the next build with no further edits.
          themeColor,
        },
      }),

      /**
       * CopyWebpackPlugin is deliberately not used.
       *
       * Why it was removed: the plugin copied src/assets/ to
       * dist/assets/, and the `asset/resource` rule emitted any image
       * the bundle imported to dist/assets/[name].[hash][ext]. A file
       * present in both cases — an image that a contributor puts in
       * src/assets/ AND imports from CSS or JS — would be emitted
       * twice under two names, bloating the bundle and confusing cache
       * analysis.
       *
       * The split of responsibilities is:
       *   - webpack owns everything under src/assets/ (the asset/resource
       *     rule emits it, with a content hash, and the bundle
       *     references it);
       *   - files that are neither imported nor referenced (a PDF a
       *     README links to, a JSON fixture for manual testing) do not
       *     belong in src/assets/ — they belong in a `public/`
       *     directory copied as-is, or outside the bundle entirely.
       *
       * Today, no file needs to be copied that webpack does not already
       * handle. The `.gitkeep` placeholder remains in src/assets/ for
       * its purpose (keeping the empty directory in version control);
       * webpack does not touch it.
       *
       * A future contributor who genuinely needs "copy these files
       * verbatim" should re-add CopyWebpackPlugin with a `public/`
       * source directory (not `src/assets/`), so the "webpack owns
       * assets" rule stays intact.
       */

      /**
       * MiniCssExtractPlugin — extracts the CSS into a separate file in
       * production.
       *
       * Added only in production: in development, CSS is injected at
       * runtime by style-loader, and carrying the extract plugin would
       * break CSS hot-reload. The spread of a conditional array keeps
       * the dev and prod plugin lists in one declaration.
       *
       * The filename carries a content hash for the same caching reason
       * as the JS bundle: an unchanged stylesheet keeps its name, a
       * changed one gets a new name.
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
    // Dev server — `npm start`.
    //
    // Serves the built output from ./dist on http://localhost:8080, the
    // address the delivery note specifies. `hot: true` enables HMR;
    // `open` opens the browser automatically except in CI (see
    // `openBrowser`). `historyApiFallback` serves index.html for any
    // 404 so a SPA refresh on a deep link does not break — defensive
    // today, because the app is single-route. The client overlay
    // surfaces errors on the page so a runtime failure is visible the
    // moment it happens; warnings are left in the terminal so they do
    // not cover the UI.
    // ----------------------------------------------------------------
    devServer: {
      static: {
        directory: PATHS.output,
      },
      port: 8080,
      host: 'localhost',
      hot: true,
      open: openBrowser,
      historyApiFallback: true,
      client: {
        overlay: {
          errors: true,
          warnings: false,
        },
      },
    },

    // ----------------------------------------------------------------
    // Optimization.
    //
    // `splitChunks` runs only in production: it pulls third-party code
    // into a separate chunk so an app change does not invalidate the
    // vendor cache. In development the default is fine and splitting
    // would only slow the build.
    //
    // `moduleIds: 'deterministic'` gives modules stable ids across
    // builds, which improves the long-term cache hit rate.
    // ----------------------------------------------------------------
    optimization: {
      splitChunks: isProduction ? { chunks: 'all' } : false,
      moduleIds: 'deterministic',
    },

    // ----------------------------------------------------------------
    // Resolve.
    //
    // `extensions` lets source import without file extensions.
    // The `@` alias points at the source root so imports do not depend
    // on a file's depth in the tree.
    // ----------------------------------------------------------------
    resolve: {
      extensions: ['.js', '.json'],
      alias: {
        '@': PATHS.src,
      },
    },

    // ----------------------------------------------------------------
    // Performance hints.
    //
    // In production, warn if an asset or the entrypoint exceeds 300 KB.
    // The thresholds are deliberately generous for a vanilla-JS SPA;
    // crossing them means something unexpected entered the bundle, and
    // the warning is the prompt to explain or remove it. In development
    // the hints are off — dev builds are unminified by design and would
    // trip the thresholds constantly.
    // ----------------------------------------------------------------
    performance: {
      hints: isProduction ? 'warning' : false,
      maxAssetSize: 300_000,
      maxEntrypointSize: 300_000,
    },

    // ----------------------------------------------------------------
    // Stats — concise terminal output so build evidence is legible.
    // ----------------------------------------------------------------
    stats: 'minimal',

    // ----------------------------------------------------------------
    // Target — modern browsers only (matches the project's browserslist).
    // `web` tells webpack the output runs in a browser, which shapes the
    // chunk-loading and runtime code it emits.
    // ----------------------------------------------------------------
    target: 'web',
  };
}

module.exports = buildConfig;