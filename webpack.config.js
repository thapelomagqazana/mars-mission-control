/**
 * Mars Mission Control — webpack configuration
 *
 * Scope (per assessment brief):
 *   - Vanilla JavaScript SPA — no framework, no transpiler required.
 *   - Single HTML entry point, injected by HtmlWebpackPlugin.
 *   - CSS handled by css-loader + style-loader (runtime injection).
 *   - Static assets (Mars imagery is remote; local assets are decorative only).
 *
 * Two modes:
 *   - development: webpack-dev-server on http://localhost:8080 with live reload.
 *   - production:  minified bundle in ./dist, ready for static serving.
 *
 * Run:
 *   npm start        → development server
 *   npm run build    → production bundle
 */

const path = require('node:path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

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

  return {
    // ----------------------------------------------------------------
    // Mode — controls webpack's built-in optimizations and devtool.
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
      path: PATHS.output,
      filename: isProduction ? 'js/[name].[contenthash:8].js' : 'js/[name].js',
      // Clean stale files before each build (prevents orphaned assets
      // when a filename changes — WBS 8.4 "required assets are present").
      clean: true,
      // Emit assets even when the compiler reports them as "unused",
      // which would otherwise strip the CSS module output in some setups.
      publicPath: '/',
    },

    // ----------------------------------------------------------------
    // Devtool — source maps only in development.
    // Production ships without maps to keep the bundle small and avoid
    // leaking source in the deliverable. WBS 8.3: no stray warnings.
    // ----------------------------------------------------------------
    devtool: isProduction ? false : 'eval-cheap-module-source-map',

    // ----------------------------------------------------------------
    // Module rules — CSS only. JavaScript is native ES2020+, so no Babel
    // loader is configured: adding one without a transpilation need would
    // violate the "avoid over-engineering" guidance in the WBS.
    // ----------------------------------------------------------------
    module: {
      rules: [
        {
          test: /\.css$/i,
          // style-loader injects <style> at runtime; acceptable for a SPA
          // of this size. If CSS-in-separate-file becomes a requirement,
          // swap for MiniCssExtractPlugin here.
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.(png|jpe?g|gif|svg|webp)$/i,
          type: 'asset/resource',
          generator: {
            // Local images only. The Mars hero image is loaded from Unsplash
            // at runtime (WBS 6.5), so no bundler entry is needed for it.
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
       * This is what makes "mount at the expected root element" work in
       * both dev and production (WBS 4.1).
       */
      new HtmlWebpackPlugin({
        template: PATHS.htmlTemplate,
        filename: 'index.html',
        inject: 'body',
        // Keep the documented page title in the emitted HTML.
        title: 'Mars Mission Control',
        // Favicon: an empty string here tells the plugin not to look for
        // one. If a favicon asset is added later, point this at it and
        // webpack will copy + link it automatically.
        favicon: undefined,
      }),

      /**
       * CopyWebpackPlugin — copies anything under src/assets/ that webpack
       * hasn't already processed (e.g. future PDFs, JSON data) into dist.
       * The .gitkeep placeholder is deliberately ignored.
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
    ],

    // ----------------------------------------------------------------
    // Dev server — `npm start`. WBS 3.5 requires the app to open at the
    // configured localhost address. Port 8080 matches the delivery note.
    // ----------------------------------------------------------------
    devServer: {
      static: {
        directory: PATHS.output,
      },
      port: 8080,
      host: 'localhost',
      hot: true,
      // Let the terminal open the browser automatically on `npm start`.
      open: true,
      // Serve index.html for any 404 so a SPA refresh on a deep link
      // doesn't break (defensive; the app is single-route today).
      historyApiFallback: true,
      // Surface overlay errors so WBS 8.7 "no unhandled application error"
      // is caught the moment it happens.
      client: {
        overlay: {
          errors: true,
          warnings: false,
        },
      },
    },

    // ----------------------------------------------------------------
    // Optimization — sensible production split. In development, webpack's
    // default is fine; in production, keep one vendor chunk out of app code
    // so caching behaves predictably if a third-party lib is ever added.
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
    // Performance hints — fail loudly in production if a bundle grows
    // unexpectedly large (WBS 8.3: warnings are resolved or explained).
    // ----------------------------------------------------------------
    performance: {
      hints: isProduction ? 'warning' : false,
      maxAssetSize: 300_000,
      maxEntrypointSize: 300_000,
    },

    // ----------------------------------------------------------------
    // Stats — concise output so build evidence (WBS 10.4) is legible.
    // ----------------------------------------------------------------
    stats: 'minimal',

    // ----------------------------------------------------------------
    // Target — modern browsers only (matches browserslist in package.json).
    // Cypress 13 runs Chromium/Firefox/Edge, all of which support this.
    // ----------------------------------------------------------------
    target: 'web',
  };
}

module.exports = buildConfig;