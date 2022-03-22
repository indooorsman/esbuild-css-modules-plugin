const path = require('path');
const { createHash } = require('crypto');
const { readFileSync } = require('fs');
const { readFile, appendFile } = require('fs/promises');
const {
  getLogger,
  buildInjectCode,
  pluginName,
  getRootDir,
  pluginNamespace,
  builtCssSurfix
} = require('./utils.js');
const cssHandler = require('@parcel/css');
const camelCase = require('lodash/camelCase');
const { v4 } = require('uuid');
const cache = require('./cache.js');

/**
 * buildCssModulesJs
 * @param {{fullPath: string; options: import('..').Options; digest: string; build: import('..').Build}} params
 * @returns {Promise<{resolveDir: string; js: string; css: string; exports: Record<string, string>}>}
 */
const buildCssModulesJs = async ({ fullPath, options, build }) => {
  const { buildId } = build.context;
  const resolveDir = path.dirname(fullPath);
  const classPrefix = path.basename(fullPath, path.extname(fullPath)).replace(/\./g, '-') + '__';
  const originCss = await readFile(fullPath);

  /**
   * @type {import('@parcel/css').BundleOptions}
   */
  const bundleConfig = {
    filename: fullPath,
    code: originCss,
    minify: true,
    sourceMap: !options.inject,
    cssModules: true,
    analyzeDependencies: false
  };
  const { code, exports = {}, map } = cssHandler.transform(bundleConfig);
  let cssModulesContent = code.toString('utf-8');

  const cssModulesJSON = {};
  Object.keys(exports).forEach((originClass) => {
    const patchedClass = exports[originClass].name;
    cssModulesJSON[camelCase(originClass)] = classPrefix + patchedClass;
    cssModulesContent = cssModulesContent.replace(
      new RegExp(`\\.${patchedClass}`, 'g'),
      '.' + classPrefix + patchedClass
    );
  });
  const classNamesMapString = JSON.stringify(cssModulesJSON);

  const cssFileName = path.basename(fullPath);
  const builtCssFileName = cssFileName.replace(/\.modules?\.css$/i, builtCssSurfix);

  let cssWithSourceMap = cssModulesContent;
  if (map) {
    cssWithSourceMap += `\n/*# sourceMappingURL=data:application/json;base64,${map.toString(
      'base64'
    )} */`;
  }

  // fix path issue on Windows: https://github.com/indooorsman/esbuild-css-modules-plugin/issues/12
  const cssImportPath = './' + builtCssFileName.split(path.sep).join(path.posix.sep).trim();
  const injectCode = `import "${cssImportPath}";`;

  const exportDefault = `
export default new Proxy(${classNamesMapString}, {
  get: function(source, key) {
    setTimeout(() => {
      window.__inject_${buildId}__ && window.__inject_${buildId}__();
    }, 0);
    return source[key];
  }
});
  `;

  const js = `${injectCode}\n${exportDefault};`;

  return {
    js,
    css: cssWithSourceMap,
    exports,
    resolveDir
  };
};

/**
 * onLoad
 * @param {import('..').Build} build
 * @param {import('..').Options} options
 * @param {import('esbuild').OnLoadArgs} args
 * @return {(import('esbuild').OnLoadResult | null | undefined | Promise<import('esbuild').OnLoadResult | null | undefined>)}
 */
const onLoad = async (build, options, args) => {
  const log = getLogger(build);
  const { path: fullPath } = args;
  const { buildRoot } = build.context;

  const cached = cache.get(fullPath);
  if (cached) {
    log('return cache for', fullPath);
    return cached;
  }

  const rpath = path.relative(buildRoot, fullPath);
  const hex = createHash('sha256').update(rpath).digest('hex');
  const digest = hex.slice(hex.length - 255, hex.length);

  const { js, resolveDir, css, exports } = await buildCssModulesJs({
    fullPath,
    options,
    digest,
    build
  });

  const result = {
    pluginName,
    resolveDir,
    pluginData: {
      css,
      exports,
      digest
    },
    contents: js,
    loader: 'js'
  };
  cache.set(fullPath, result);

  return result;
};

/**
 * onEnd
 * @param {import('..').Build} build
 * @param {import('..').Options} options
 * @param {import('esbuild').BuildResult} result
 */
const onEnd = async (build, options, result) => {
  if (build.initialOptions.watch) {
    return;
  }
  const { buildId, buildRoot } = build.context;
  const log = getLogger(build);

  if (options.inject === true || typeof options.inject === 'string') {
    const cssContents = [];
    const entries = build.initialOptions.entryPoints.map((entry) => path.resolve(buildRoot, entry));
    log('entries:', entries);
    let injectTo = null;
    Object.keys(result.metafile?.outputs ?? []).forEach((f) => {
      if (
        result.metafile.outputs[f].entryPoint &&
        entries.includes(path.resolve(buildRoot, result.metafile.outputs[f].entryPoint)) &&
        path.extname(f) === '.js'
      ) {
        injectTo = path.resolve(buildRoot, f);
      }
      if (path.extname(f) === '.css') {
        const fullpath = path.resolve(buildRoot, f);
        const css = readFileSync(fullpath);
        cssContents.push(`\n/* ${f} */\n${css}\n`);
      }
    });
    log('inject css to', injectTo);
    if (injectTo && cssContents.length) {
      const allCss = cssContents.join('');
      const container = typeof options.inject === 'string' ? options.inject : 'head';
      const injectedCode = buildInjectCode(container, allCss, buildId, options);

      await appendFile(injectTo, injectedCode, { encoding: 'utf-8' });
    }
  }
};

/**
 * prepareBuild
 * @param {import('..').Build} build
 * @param {import('..').Options} options
 * @return {Promise<void>}
 */
const prepareBuild = async (build, options) => {
  const buildId = v4().replace(/[^0-9a-zA-Z]/g, '');
  build.initialOptions.metafile = true;
  const packageRoot = options.root;
  const buildRoot = getRootDir(build);

  build.context = {
    buildId,
    buildRoot,
    packageRoot
  };
};

/**
 * onLoadBuiltCss
 * @param {import('esbuild').OnLoadArgs} args
 * @returns {import('esbuild').OnLoadResult}
 */
const onLoadBuiltCss = async ({ pluginData }) => {
  const { css, resolveDir } = pluginData;

  /**
   * @type {import('esbuild').OnLoadResult}
   */
  const result = {
    contents: css,
    loader: 'css',
    pluginName,
    resolveDir,
    pluginData
  };

  return result;
};

/**
 * onResolveBuiltCss
 * @param {import('esbuild').OnResolveArgs} args
 * @returns {import('esbuild').OnResolveResult}
 */
const onResolveBuiltCss = async (args) => {
  const { resolveDir, path: p, pluginData } = args;

  /**
   * @type {import('esbuild').OnResolveResult}
   */
  const result = {
    namespace: pluginNamespace,
    path: p,
    external: false,
    pluginData: {
      ...pluginData,
      resolveDir,
      path: p
    },
    sideEffects: true,
    pluginName
  };

  return result;
};

/**
 * setup
 * @param {import('..').Build} build
 * @param {import('..').Options} options
 * @returns {Promise<void>}
 */
const setup = async (build, options) => {
  await prepareBuild(build, options);

  const log = getLogger(build);

  build.onLoad({ filter: /\.modules?\.css$/i }, async (args) => {
    log('loading', args.path);
    return await onLoad(build, options, args);
  });

  build.onResolve({ filter: new RegExp(builtCssSurfix, 'i') }, onResolveBuiltCss);

  build.onLoad(
    {
      filter: new RegExp(builtCssSurfix, 'i'),
      namespace: pluginNamespace
    },
    async (args) => {
      log('loading built css', args.path);
      return await onLoadBuiltCss(args);
    }
  );

  build.onEnd(async (result) => {
    await onEnd(build, options, result);
  });
};

module.exports = {
  setup
};
