const path = require('path');
const { createHash } = require('crypto');
const { readFile, appendFile } = require('fs/promises');
const {
  getLogger,
  buildInjectCode,
  pluginName,
  getRootDir,
  pluginNamespace,
  buildingCssSuffix,
  builtCssSuffix,
  modulesCssRegExp,
  builtModulesCssRegExp,
  getRelativePath,
  getBuildId
} = require('./utils.js');
const cssHandler = require('@parcel/css');
const camelCase = require('lodash/camelCase');
const BuildCache = require('./cache.js');

/**
 * buildCssModulesJs
 * @param {{fullPath: string; options: import('..').Options; digest: string; build: import('..').Build}} params
 * @returns {Promise<{resolveDir: string; js: string; css: string; originCss: string; exports: Record<string, string>}>}
 */
const buildCssModulesJs = async ({ fullPath, options, build }) => {
  const cssFileName = path.basename(fullPath); // e.g. xxx.module.css?esbuild-css-modules-plugin-building
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

  Object.keys(exports)
    .sort() // to keep order consistent in different builds
    .forEach((originClass) => {
      const patchedClass = exports[originClass].name;
      cssModulesJSON[camelCase(originClass)] = classPrefix + patchedClass;
      cssModulesContent = cssModulesContent.replace(
        new RegExp(`\\.${patchedClass}`, 'g'),
        '.' + classPrefix + patchedClass
      );
    });
  const classNamesMapString = JSON.stringify(cssModulesJSON);

  let cssWithSourceMap = cssModulesContent;
  if (map) {
    cssWithSourceMap += `\n/*# sourceMappingURL=data:application/json;base64,${map.toString(
      'base64'
    )} */`;
  }

  // fix path issue on Windows: https://github.com/indooorsman/esbuild-css-modules-plugin/issues/12
  const cssImportPath =
    './' +
    cssFileName.split(path.sep).join(path.posix.sep).trim().replace(buildingCssSuffix, '') +
    builtCssSuffix;
  // => ./xxx.module.css?esbuild-css-modules-plugin-built
  const importStatement = `import "${cssImportPath}";`;

  const exportStatement = options.inject
    ? `
export default new Proxy(${classNamesMapString}, {
  get: function(source, key) {
    setTimeout(() => {
      window.__inject_${buildId}__ && window.__inject_${buildId}__();
    }, 0);
    return source[key];
  }
});
  `
    : `export default ${classNamesMapString};`;

  const js = `${importStatement}\n${exportStatement};`;

  return {
    js,
    css: cssWithSourceMap,
    originCss: originCss.toString('utf8'),
    exports,
    resolveDir
  };
};

/**
 * prepareBuild
 * @param {import('..').Build} build
 * @param {import('..').Options} options
 * @return {Promise<void>}
 */
const prepareBuild = async (build, options) => {
  const buildId = await getBuildId(build);
  build.initialOptions.metafile = true;
  const packageRoot = options.root;
  const buildRoot = getRootDir(build);
  const log = getLogger(build);
  const relative = (to) => getRelativePath(build, to);

  build.context = {
    buildId,
    buildRoot,
    packageRoot,
    log,
    relative
  };
  build.context.cache = new BuildCache(build);

  log(`root of this build(#${buildId}):`, buildRoot);
};

/**
 * onResolveModulesCss
 * @description mark module(s).css as sideEffects and add namespace
 * @param {import('esbuild').OnResolveArgs} args
 * @param {import('..').Build} build
 * @returns {Promise<import('esbuild').OnResolveResult>}
 */
const onResolveModulesCss = async (args, build) => {
  const { resolve, initialOptions, context } = build;
  const { resolveDir, path: p, pluginData = {} } = args;
  const { log, relative } = context;
  const { path: absPath } = await resolve(p, { resolveDir });
  const rpath = relative(absPath);
  log('resolve', p, 'to', rpath, 'from build root');

  /**
   * @type {import('esbuild').OnResolveResult}
   */
  const result = {
    namespace: pluginNamespace,
    suffix: buildingCssSuffix,
    path: rpath,
    external: false,
    pluginData: {
      ...pluginData,
      relativePathToBuildRoot: rpath
    },
    sideEffects: true,
    pluginName
  };

  if (initialOptions.watch) {
    log('watching', rpath);
    result.watchFiles = [absPath];
  }

  return result;
};

/**
 * onLoadModulesCss
 * @param {import('..').Build} build
 * @param {import('..').Options} options
 * @param {import('esbuild').OnLoadArgs} args
 * @return {(import('esbuild').OnLoadResult | null | undefined | Promise<import('esbuild').OnLoadResult | null | undefined>)}
 */
const onLoadModulesCss = async (build, options, args) => {
  const { path: maybeFullPath, pluginData = {} } = args;
  const { buildRoot, log, cache } = build.context;
  const absPath = path.isAbsolute(maybeFullPath)
    ? maybeFullPath
    : path.resolve(buildRoot, maybeFullPath);
  const rpath = pluginData.relativePathToBuildRoot;

  log(`loading ${rpath}${args.suffix}`);

  log(`checking cache for`, rpath);
  const cached = await cache.get(absPath);
  if (cached) {
    log('return build cache for', rpath);
    return cached;
  }

  const hex = createHash('sha256').update(rpath).digest('hex');
  const digest = hex.slice(hex.length - 255, hex.length);

  const { js, resolveDir, css, exports, originCss } = await buildCssModulesJs({
    fullPath: absPath,
    options,
    digest,
    build
  });

  const result = {
    pluginName,
    resolveDir,
    pluginData: {
      ...pluginData,
      css,
      exports,
      digest
    },
    contents: js,
    loader: 'js'
  };
  await cache.set(absPath, result, originCss);
  log(`add build result to cache for ${rpath}`);

  return result;
};

/**
 * onResolveBuiltModulesCss
 * @param {import('esbuild').OnResolveArgs} args
 * @param {import('..').Build} build
 * @returns {Promise<import('esbuild').OnResolveResult>}
 */
const onResolveBuiltModulesCss = async (args, build) => {
  const { path: p, pluginData = {} } = args;
  const { relativePathToBuildRoot } = pluginData;

  build.context?.log(`resolve virtual path ${p} to ${relativePathToBuildRoot}${builtCssSuffix}`);

  /**
   * @type {import('esbuild').OnResolveResult}
   */
  const result = {
    namespace: pluginNamespace,
    path: relativePathToBuildRoot + builtCssSuffix,
    external: false,
    pluginData,
    sideEffects: true,
    pluginName
  };

  return result;
};

/**
 * onLoadBuiltModulesCss
 * @param {import('esbuild').OnLoadArgs} args
 * @param {import('..').Build} build
 * @returns {Promise<import('esbuild').OnLoadResult>}
 */
const onLoadBuiltModulesCss = async ({ pluginData }, build) => {
  const { log, buildRoot } = build.context;
  const { css, relativePathToBuildRoot } = pluginData;
  const absPath = path.resolve(buildRoot, relativePathToBuildRoot);
  const resolveDir = path.dirname(absPath);
  log('loading built css for', relativePathToBuildRoot);

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
 * onEnd
 * @param {import('..').Build} build
 * @param {import('..').Options} options
 * @param {import('esbuild').BuildResult} result
 */
const onEnd = async (build, options, result) => {
  const { buildId, buildRoot, cache } = build.context;
  const log = getLogger(build);

  if (options.inject === true || typeof options.inject === 'string') {
    const cssContents = [];

    const { entryPoints } = build.initialOptions;
    let entriesArray = [];
    if (Array.isArray(entryPoints)) {
      entriesArray = [...entryPoints];
    } else {
      Object.keys(entryPoints)
        .sort()
        .forEach((k) => {
          entriesArray.push(entryPoints[k]);
        });
    }
    const entries = entriesArray.map((p) => (path.isAbsolute(p) ? p : path.resolve(buildRoot, p)));

    log('entries:', entries);

    let injectTo = null;
    const outputs = Object.keys(result.metafile?.outputs ?? []);

    await Promise.all(
      outputs.map(async (f) => {
        if (
          !injectTo &&
          result.metafile.outputs[f].entryPoint &&
          entries.includes(path.resolve(buildRoot, result.metafile.outputs[f].entryPoint)) &&
          path.extname(f) === '.js'
        ) {
          injectTo = path.resolve(buildRoot, f);
        }
        if (path.extname(f) === '.css') {
          const fullpath = path.resolve(buildRoot, f);
          const css = await readFile(fullpath, { encoding: 'utf8' });
          cssContents.push(`${css}`);
        }
      })
    );

    log('inject css to', path.relative(buildRoot, injectTo));

    if (injectTo && cssContents.length) {
      const allCss = cssContents.join('');
      const container = typeof options.inject === 'string' ? options.inject : 'head';
      const injectedCode = buildInjectCode(container, allCss, buildId, options);

      await appendFile(injectTo, injectedCode, { encoding: 'utf-8' });
    }
  }

  log('finished');
};

/**
 * setup
 * @param {import('..').Build} build
 * @param {import('..').Options} options
 * @returns {Promise<void>}
 */
const setup = async (build, options) => {
  await prepareBuild(build, options);

  // resolve xxx.module.css to xxx.module.css?esbuild-css-modules-plugin-building
  build.onResolve({ filter: modulesCssRegExp, namespace: 'file' }, async (args) => {
    return await onResolveModulesCss(args, build);
  });

  // load xxx.module.css?esbuild-css-modules-plugin-building
  build.onLoad({ filter: modulesCssRegExp, namespace: pluginNamespace }, async (args) => {
    return await onLoadModulesCss(build, options, args);
  });

  // resolve virtual path xxx.module.css?esbuild-css-modules-plugin-built
  build.onResolve(
    {
      filter: builtModulesCssRegExp,
      namespace: pluginNamespace
    },
    async (args) => {
      return await onResolveBuiltModulesCss(args, build);
    }
  );

  // load virtual path xxx.module.css?esbuild-css-modules-plugin-built
  build.onLoad(
    {
      filter: builtModulesCssRegExp,
      namespace: pluginNamespace
    },
    async (args) => {
      return await onLoadBuiltModulesCss(args, build);
    }
  );

  build.onEnd(async (result) => {
    await onEnd(build, options, result);
  });
};

module.exports = {
  setup
};
