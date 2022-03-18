const path = require('path');
const { createHash } = require('crypto');
const fse = require('fs-extra');
const postcss = require('postcss');
const cssModules = require('postcss-modules');
const util = require('util');
const tmp = require('tmp');
const hash = createHash('sha256');
const readFile = util.promisify(fse.readFile);
const writeFile = util.promisify(fse.writeFile);
const ensureDir = util.promisify(fse.ensureDir);
const { pluginNamespace, getLogger } = require('./utils.js');

/**
 * @callback OnLoadCallback
 * @param {import('esbuild').OnLoadArgs} args
 * @return {(import('esbuild').OnLoadResult | null | undefined | Promise<import('esbuild').OnLoadResult | null | undefined>)}
 */
/**
 * @callback OnResolveCallback
 * @param {import('esbuild').OnResolveArgs} args
 * @return {(import('esbuild').OnResolveResult | null | undefined | Promise<import('esbuild').OnResolveResult | null | undefined>)}
 */

const buildCssModulesJs = async (cssFullPath, options) => {
  const {
    localsConvention = 'camelCaseOnly',
    inject = true,
    generateScopedName,
    cssModulesOption = {}
  } = options;

  const css = await readFile(cssFullPath);

  let cssModulesJSON = {};
  const result = await postcss([
    cssModules({
      localsConvention,
      generateScopedName,
      getJSON(cssSourceFile, json) {
        cssModulesJSON = { ...json };
        return cssModulesJSON;
      },
      ...cssModulesOption
    })
  ]).process(css, {
    from: cssFullPath,
    map: false
  });

  const classNames = JSON.stringify(cssModulesJSON);
  hash.update(cssFullPath);
  const digest = hash.copy().digest('hex');

  let injectedCode = '';
  if (inject === true) {
    injectedCode = `
(function() {
  if (!document.getElementById(digest)) {
    var el = document.createElement('style');
    el.id = digest;
    el.textContent = css;
    document.head.appendChild(el);
  }
})();
    `;
  } else if (typeof inject === 'function') {
    injectedCode = inject(result.css, digest);
  }

  let jsContent = `
const digest = '${digest}';
const css = \`${result.css}\`;
${injectedCode}
export default ${classNames};
export { css, digest };
  `;

  return {
    jsContent,
    cssContent: result.css
  };
};

/**
 * @type {(build: import('esbuild').PluginBuild, options: import('..').Options) => OnResolveCallback}
 */
const onResolveFactory = (build, options) => async (args) => {
  const log = getLogger(build);
  const { outdir, bundle } = build.initialOptions;
  const rootDir = process.cwd();
  const tmpDirPath = tmp.dirSync().name;
  const sourceFullPath = path.resolve(args.resolveDir, args.path);
  const sourceExt = path.extname(sourceFullPath);
  const sourceBaseName = path.basename(sourceFullPath, sourceExt);
  const sourceDir = path.dirname(sourceFullPath);
  const sourceRelDir = path.relative(path.dirname(rootDir), sourceDir);
  const tmpDir = path.resolve(tmpDirPath, sourceRelDir);
  await ensureDir(tmpDir);
  const tmpFilePath = path.resolve(tmpDir, `${sourceBaseName}.css`);

  const { jsContent } = await buildCssModulesJs(sourceFullPath, options);

  await writeFile(`${tmpFilePath}.js`, jsContent, { encoding: 'utf-8' });

  if (outdir && !bundle) {
    const isOutdirAbsolute = path.isAbsolute(outdir);
    const absoluteOutdir = isOutdirAbsolute ? outdir : path.resolve(args.resolveDir, outdir);
    const isEntryAbsolute = path.isAbsolute(args.path);
    const entryRelDir = isEntryAbsolute
      ? path.dirname(path.relative(args.resolveDir, args.path))
      : path.dirname(args.path);
    const targetSubpath =
      absoluteOutdir.indexOf(entryRelDir) === -1
        ? path.join(entryRelDir, `${sourceBaseName}.css.js`)
        : `${sourceBaseName}.css.js`;
    const target = path.resolve(absoluteOutdir, targetSubpath);
    await ensureDir(path.dirname(target));
    fse.copyFileSync(`${tmpFilePath}.js`, target);
    log(path.relative(rootDir, sourceFullPath), '=>', path.relative(rootDir, target));
  }
  if (!bundle) {
    return { path: sourceFullPath, namespace: 'file' };
  }
  return {
    path: `${tmpFilePath}.js`,
    namespace: pluginNamespace,
    pluginData: {
      content: jsContent,
      resolveArgs: {
        path: args.path,
        fullPath: sourceFullPath,
        importer: args.importer,
        namespace: args.namespace,
        resolveDir: args.resolveDir,
        kind: args.kind
      }
    }
  };
};

/**
 * @type {(build: import('esbuild').PluginBuild, options?: import('..').Options) => OnLoadCallback}
 */
const onLoadFactory = (build) => (args) => {
  const { path: resolvePath, importer, fullPath } = args.pluginData.resolveArgs;
  const importerName = path.basename(importer);
  getLogger(build)(`${resolvePath} => ${resolvePath}.js => ${importerName}`);
  return { contents: args.pluginData.content, loader: 'js', watchFiles: [fullPath] };
};

/**
 * setup for v1
 * @param {import('esbuild').PluginBuild} build 
 * @param {import('..').Options} options 
 */
const setup = (build, options) => {
  build.onResolve(
    { filter: /\.modules?\.css$/, namespace: 'file' },
    onResolveFactory(build, options)
  );

  build.onLoad(
    { filter: /\.modules?\.css\.js$/, namespace: pluginNamespace },
    onLoadFactory(build, options)
  );
}

module.exports = {
  setup
};
