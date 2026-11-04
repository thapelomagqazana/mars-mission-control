/**
 * CSS processing contract tests.
 *
 * Purpose:
 *   The CSS chain is a two-mode contract:
 *     - development uses `style-loader` (runtime <style> injection)
 *     - production  uses `MiniCssExtractPlugin.loader` (linked .css file)
 *
 *   The tests assert the chain differs by mode, `style-loader` is not
 *   in the production chain (the acceptance criterion's defect), the
 *   `MiniCssExtractPlugin` is added only in production, and the CSS
 *   import lives in the entry (not in a view, not in the HTML
 *   template).
 *
 * Why a separate file from the render tests:
 *   The render contract tests assert the view layer against a
 *   simulated DOM. This file asserts the *build configuration* and
 *   the *import location* — concerns that do not need a DOM and that
 *   should fail in `node`, fast, before any browser test runs. A
 *   broken CSS chain is a build-time defect; the sooner the test
 *   suite catches it, the cheaper the diagnosis.
 *
 * Why `loadModule` and not `require`:
 *   The file is ESM (`.js` with `import` statements), and it needs to
 *   load a CommonJS module (`webpack.config.js`). The standard
 *   pattern is `createRequire(import.meta.url)`, which returns a
 *   `require`-shaped function bound to the file's location. Naming
 *   the return value `require` is tempting, but the Babel transform
 *   that compiles the ESM `import` statements to CommonJS `require`
 *   calls reserves the name `require` in module scope — a top-level
 *   `const require = ...` shadows the transform's `require` and
 *   fails to parse. The name `loadModule` is the same function with
 *   a name the transform does not reserve.
 *
 * Why `createRequire(__filename)` and not `createRequire(import.meta.url)`:
 *   `import.meta` is ESM-only syntax; Babel's parser rejects it
 *   when the transform is configured for CommonJS (which this
 *   project's `babel.config.js` is). The file is never run as ESM;
 *   it is transformed to CommonJS by Jest, and the transformed
 *   output has `__filename` as a CommonJS global. `createRequire(
 *   __filename)` is the CommonJS-compatible equivalent of
 *   `createRequire(import.meta.url)`.
 *
 * Why the sequence test uses line-anchored regexes:
 *   The entry's docstring explains the startup sequence and names
 *   `styles.css` and `startApp` in the explanation. A plain
 *   `entry.search(/startApp\s*\(/)` would find the docstring's
 *   mention (the docstring is at the top of the file) and compare
 *   the two docstring mentions, not the two code positions. The
 *   line-anchored regex (`/^import .../m`, `/^startApp\(/m`) finds
 *   the code's lines, because the code's lines start at column 0
 *   and the docstring's lines are prefixed with ` *`.
 *
 * Environment:
 *   Runs in `node`. Loads `webpack.config.js` in both modes (it is a
 *   CommonJS module that exports a `(env, argv) => config` function)
 *   and reads `src/js/index.js` and the view files as text.
 *
 * Runner: Jest.
 * Run:    npm test
 *
 * @module tests/unit/node/cssProcessing
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';

const loadModule = createRequire(__filename);

const PROJECT_ROOT = resolve(__dirname, '../../..');
const WEBPACK_PATH = resolve(PROJECT_ROOT, 'webpack.config.js');
const ENTRY_PATH = resolve(PROJECT_ROOT, 'src/js/index.js');
const VIEWS_DIR = resolve(PROJECT_ROOT, 'src/js/views');
const CSS_PATH = resolve(PROJECT_ROOT, 'src/css/styles.css');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load the webpack config for a given mode.
 *
 * The module cache is cleared before each load so the function is
 * re-evaluated with the requested mode. The config is a function; it
 * is called with the mode as the second argument (the first is the
 * webpack `env` object, which the config does not use).
 */
function loadWebpackConfig(mode) {
  delete loadModule.cache[loadModule.resolve(WEBPACK_PATH)];
  const config = loadModule(WEBPACK_PATH);
  return typeof config === 'function' ? config({}, { mode }) : config;
}

/**
 * Find the `.css` rule in the config's `module.rules`.
 *
 * The rule's `test` is a RegExp; the check calls it with a sample
 * `.css` path, which is what webpack does. A rule whose `test` does
 * not match `style.css` is not the CSS rule.
 */
function findCssRule(config) {
  return config.module.rules.find(
    (rule) => rule.test instanceof RegExp && rule.test.test('style.css')
  );
}

/**
 * Normalise a rule's `use` property to an array of loader names.
 *
 * `use` can be a string (`'style-loader'`), an array (`['style-loader',
 * 'css-loader']`), or an array of objects (`[{ loader: 'style-loader',
 * options: {...} }]`). The tests compare the loader names, so the
 * helper returns an array of loader names regardless of the shape.
 */
function loaderNames(use) {
  if (!use) return [];
  const entries = Array.isArray(use) ? use : [use];
  return entries.map((entry) =>
    typeof entry === 'string'
      ? entry
      : entry && entry.loader
        ? entry.loader
        : String(entry)
  );
}

/**
 * Read every `.js` file under `src/js/views/` (recursively).
 */
function readViewFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (entry.endsWith('.js')) files.push(full);
    }
  };
  walk(VIEWS_DIR);
  return files;
}

/**
 * Find the index of a line-anchored code call in the entry.
 *
 * The regex `^<needle>` with the `m` flag matches the start of a
 * line. The code's call is at the start of a line; the docstring's
 * mention is inside a ` *`-prefixed comment, which `^<needle>` does
 * not match. Returns -1 if the call is not found.
 *
 * The function is used by the "CSS import before startApp" test,
 * which needs the code's positions, not the docstring's.
 */
function codeLineIndex(source, pattern) {
  const match = source.match(new RegExp(pattern, 'm'));
  return match ? match.index : -1;
}

// ---------------------------------------------------------------------------
// The .css rule exists in both modes
// ---------------------------------------------------------------------------

describe('the .css rule', () => {
  it('exists in development', () => {
    expect(findCssRule(loadWebpackConfig('development'))).toBeDefined();
  });

  it('exists in production', () => {
    expect(findCssRule(loadWebpackConfig('production'))).toBeDefined();
  });

  it('includes css-loader in both modes', () => {
    const dev = loaderNames(findCssRule(loadWebpackConfig('development')).use);
    const prod = loaderNames(findCssRule(loadWebpackConfig('production')).use);
    expect(dev).toContain('css-loader');
    expect(prod).toContain('css-loader');
  });
});

// ---------------------------------------------------------------------------
// The injector differs by mode
// ---------------------------------------------------------------------------

describe('the CSS injector', () => {
  it('development uses style-loader', () => {
    const use = loaderNames(findCssRule(loadWebpackConfig('development')).use);
    expect(use).toContain('style-loader');
  });

  it('production does NOT use style-loader', () => {
    // The acceptance criterion: style-loader in production is a
    // defect (breaks CSP, causes FOUC). The assertion is the
    // enforcement.
    const use = loaderNames(findCssRule(loadWebpackConfig('production')).use);
    expect(use).not.toContain('style-loader');
  });

  it('production uses MiniCssExtractPlugin.loader', () => {
    const use = loaderNames(findCssRule(loadWebpackConfig('production')).use);
    const hasExtract = use.some(
      (name) => typeof name === 'string' && name.includes('mini-css-extract-plugin')
    );
    expect(hasExtract).toBe(true);
  });

  it('the chain has exactly one injector and one interpreter', () => {
    // The chain shape is `[<injector>, 'css-loader']` in both
    // modes. `css-loader` is the interpreter; the other is the
    // injector. Two of each would double-process the CSS; zero of
    // either would not process it at all.
    const dev = loaderNames(findCssRule(loadWebpackConfig('development')).use);
    const prod = loaderNames(findCssRule(loadWebpackConfig('production')).use);
    expect(dev).toHaveLength(2);
    expect(prod).toHaveLength(2);
    expect(dev.filter((name) => name === 'css-loader')).toHaveLength(1);
    expect(prod.filter((name) => name === 'css-loader')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// MiniCssExtractPlugin is in production plugins only
// ---------------------------------------------------------------------------

describe('MiniCssExtractPlugin', () => {
  it('is in the production plugins', () => {
    const config = loadWebpackConfig('production');
    const hasPlugin = config.plugins.some(
      (p) => p && p.constructor && p.constructor.name === 'MiniCssExtractPlugin'
    );
    expect(hasPlugin).toBe(true);
  });

  it('is NOT in the development plugins', () => {
    // The plugin is only useful in production. Adding it in
    // development would produce an unused `.css` file — a confusing
    // artefact with no purpose, and a deviation from the "dev uses
    // style-loader" contract.
    const config = loadWebpackConfig('development');
    const hasPlugin = config.plugins.some(
      (p) => p && p.constructor && p.constructor.name === 'MiniCssExtractPlugin'
    );
    expect(hasPlugin).toBe(false);
  });

  it('extracts to css/[name].[contenthash:8].css', () => {
    const config = loadWebpackConfig('production');
    const plugin = config.plugins.find(
      (p) => p && p.constructor && p.constructor.name === 'MiniCssExtractPlugin'
    );
    expect(plugin).toBeDefined();
    expect(plugin.options.filename).toBe('css/[name].[contenthash:8].css');
  });
});

// ---------------------------------------------------------------------------
// The CSS import is in the entry, not in the views
// ---------------------------------------------------------------------------

describe('the CSS import', () => {
  it('the entry imports the stylesheet', () => {
    // The import is a code line; a plain `toMatch` on the source
    // is fine here because the test only asserts the import exists
    // somewhere. (The sequence test below is the one that needs
    // the line anchor.)
    const entry = readFileSync(ENTRY_PATH, 'utf8');
    expect(entry).toMatch(/import\s+['"][^'"]*styles\.css['"]/);
  });

  it('the entry imports the stylesheet before startApp', () => {
    // The CSS import must come before `startApp` for the first
    // paint to have the styles. A line-anchored regex finds the
    // code's lines (which start at column 0); a plain `search`
    // would find the docstring's mentions (which are inside a
    // ` * `-prefixed comment block). The `m` flag makes `^` match
    // the start of any line.
    const entry = readFileSync(ENTRY_PATH, 'utf8');

    const importIndex = codeLineIndex(
      entry,
      String.raw`^import\s+['"][^'"]*styles\.css['"]`
    );
    const startAppIndex = codeLineIndex(entry, String.raw`^startApp\s*\(`);

    expect(importIndex).toBeGreaterThan(-1);
    expect(startAppIndex).toBeGreaterThan(-1);
    expect(importIndex).toBeLessThan(startAppIndex);
  });

  it('no view imports a stylesheet', () => {
    // The views render; they do not load styles. A CSS import in a
    // view would be a side effect inside a module whose job is
    // rendering. The entry is the composition root; the CSS import
    // belongs there.
    for (const viewFile of readViewFiles()) {
      const content = readFileSync(viewFile, 'utf8');
      expect(content).not.toMatch(/import\s+['"][^'"]*\.css['"]/);
    }
  });

  it('the stylesheet file exists', () => {
    expect(() => readFileSync(CSS_PATH, 'utf8')).not.toThrow();
  });
});