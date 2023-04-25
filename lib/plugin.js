import {
  basename,
  dirname,
  extname,
  sep,
  posix,
  isAbsolute,
  resolve as _resolve,
  relative as _relative
} from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, writeFile, unlink, appendFile } from 'node:fs/promises';
import {
  getLogger,
  buildInjectCode,
  pluginName,
  getRootDir,
  pluginNamespace,
  buildingCssSuffix,
  builtCssSuffix,
  getModulesCssRegExp,
  getBuiltModulesCssRegExp,
  getRelativePath,
  getBuildId,
  validateNamedExport,
  getPackageVersion,
  getNormalPath,
  emptySourceMap
} from './utils.js';
import { transform, bundle } from 'lightningcss';
import { camelCase, upperFirst, pick, uniq, sortBy } from 'lodash-es';

/**
 * buildCssModulesJs
 * @param {{fullPath: string; options: import('../index.js').Options; digest: string; build: import('../index.js').Build}} params
 * @returns {Promise<{resolveDir: string; js: string; css: string; originCss: string; exports: Record<string, import('lightningcss').CSSModuleExport>}>}
 */
const buildCssModulesJs = async ({ fullPath, options, build }) => {
  const cssFileName = basename(fullPath); // e.g. xxx.module.css?esbuild-css-modules-plugin-building
  const { buildId, relative, packageVersion, log } = build.context;
  const resolveDir = dirname(fullPath);
  const classPrefix = basename(fullPath, extname(fullPath)).replace(/[^a-zA-Z0-9]/g, '-') + '__';
  const versionString = packageVersion?.replace(/[^a-zA-Z0-9]/g, '') ?? '';
  const originCss = await readFile(fullPath);
  const cssModulesOption = pick(options, ['pattern', 'dashedIndents']);
  const genTs = !!options.generateTsFile;

  /**
   * @type {import('lightningcss').TransformOptions<any>}
   */
  const bundleConfig = {
    filename: relative(fullPath), // use relative path to keep hash stable in different machines
    code: originCss,
    minify: false,
    sourceMap: true,
    cssModules: {
      pattern: `${classPrefix}[local]_[hash]${versionString}`,
      ...cssModulesOption
    },
    analyzeDependencies: false
  };
  const { code, exports = {}, map } = transform(bundleConfig);
  let cssModulesContent = code.toString('utf-8');

  /** @type {Record<string, string>} */
  const cssModulesJSON = {};

  Object.keys(exports)
    .sort() // to keep order consistent in different builds
    .forEach((originClass) => {
      const patchedClass = exports[originClass].name;
      let name = camelCase(originClass);

      if (options.usePascalCase) {
        name = upperFirst(name);
      }

      cssModulesJSON[name] = patchedClass;
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
    cssFileName.split(sep).join(posix.sep).trim().replace(buildingCssSuffix, '') +
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

  /** @type {string[]} */
  const namedExportsTs = [];
  const namedExportStatements = Object.entries(cssModulesJSON)
    .map(([camelCaseClassName, className]) => {
      if (!validateNamedExport(camelCaseClassName)) {
        throw new Error(
          `the class name "${camelCaseClassName}" in file ${fullPath} is a reserved keyword in javascript, please change it to someother word to avoid potential errors`
        );
      }
      const line = `export const ${camelCaseClassName} = "${className}"`;
      genTs && namedExportsTs.push(`${line} as const;`);
      return `${line};`;
    })
    .join('\n');

  const js = `${importStatement}\n${exportStatement};\n${namedExportStatements}`;

  if (genTs) {
    const ts = `export default ${classNamesMapString} as const;\n${namedExportsTs.join('\n')}\n`;
    const tsPath = `${fullPath.replace(/\?.+$/, '')}.ts`;
    log(tsPath, ts);
    await writeFile(tsPath, ts, { encoding: 'utf-8' });
  }

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
 * @param {import('esbuild').PluginBuild} build
 * @param {import('../index.js').Options} options
 * @return {Promise<import('../index.js').Build>}
 */
const prepareBuild = async (build, options) => {
  const buildId = await getBuildId(build);
  const packageVersion = getPackageVersion(build);
  build.initialOptions.metafile = true;
  const packageRoot = options.root;
  const buildRoot = getRootDir(build);
  const log = getLogger(build);
  /** @param {string} to */
  const relative = (to) => {
    // @ts-ignore
    return getRelativePath(build, to);
  };

  // @ts-ignore
  build.context = {
    buildId,
    buildRoot,
    packageRoot,
    packageVersion,
    log,
    relative
  };

  log(`root of this build(#${buildId}):`, buildRoot);

  // @ts-ignore
  return build;
};

/**
 * onResolveModulesCss
 * @description mark module(s).css as sideEffects and add namespace
 * @param {import('esbuild').OnResolveArgs} args
 * @param {import('../index.js').Build} build
 * @returns {Promise<import('esbuild').OnResolveResult>}
 */
const onResolveModulesCss = async (args, build) => {
  const { resolve, initialOptions, context } = build;
  const { resolveDir, path: p, pluginData = {}, kind } = args;
  const { log, relative } = context;
  const { path: absPath } = await resolve(p, { resolveDir, kind });
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

  result.watchFiles = [absPath];

  return result;
};

/**
 * onLoadModulesCss
 * @param {import('../index.js').Build} build
 * @param {import('../index.js').Options} options
 * @param {import('esbuild').OnLoadArgs} args
 * @return {(Promise<import('esbuild').OnLoadResult | null | undefined>)}
 */
const onLoadModulesCss = async (build, options, args) => {
  const { path: maybeFullPath, pluginData = {} } = args;
  const { buildRoot, log } = build.context;
  const absPath = isAbsolute(maybeFullPath) ? maybeFullPath : _resolve(buildRoot, maybeFullPath);
  const rpath = pluginData.relativePathToBuildRoot;

  log(`loading ${rpath}${args.suffix}`);

  const hex = createHash('sha256').update(rpath).digest('hex');
  const digest = hex.slice(hex.length - 255, hex.length);

  const { js, resolveDir, css, exports } = await buildCssModulesJs({
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
    /** @type {import('esbuild').Loader} */
    loader: 'js'
  };

  return result;
};

/**
 * onResolveBuiltModulesCss
 * @param {import('esbuild').OnResolveArgs} args
 * @param {import('../index.js').Build} build
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
 * @param {import('../index.js').Build} build
 * @returns {Promise<import('esbuild').OnLoadResult>}
 */
const onLoadBuiltModulesCss = async ({ pluginData }, build) => {
  const { log, buildRoot } = build.context;
  const { css, relativePathToBuildRoot } = pluginData;
  const absPath = _resolve(buildRoot, relativePathToBuildRoot);
  const resolveDir = dirname(absPath);
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
 * @param {import('../index.js').Build} build
 * @param {import('../index.js').Options} options
 * @param {import('esbuild').BuildResult} result
 */
const onEnd = async (build, options, result) => {
  const { initialOptions, context, esbuild } = build;
  const { buildId, buildRoot } = context;
  const log = getLogger(build);

  if (options.inject) {
    const {
      charset = 'utf8',
      outdir = '.',
      sourceRoot,
      sourcemap,
      sourcesContent,
      entryPoints,
      minify,
      logLevel,
      format,
      target,
      external,
      publicPath
    } = initialOptions;
    const absOutdir = isAbsolute(outdir) ? outdir : _resolve(buildRoot, outdir);

    /** @param {string} css */
    const transformCss = async (css) => {
      const r = await esbuild.transform(css, {
        charset,
        loader: 'css',
        sourcemap: false,
        minify: true,
        logLevel,
        format,
        target
      });
      return r.code;
    };

    /**
     * buildJs
     * @param {string} entryName
     * @param {string} entryPath
     * @param {string} jsCode
     */
    const buildJs = async (entryName, entryPath, jsCode) => {
      /**
       * @param {string} p
       * @returns {string}
       */
      const r = (p) => _relative(absOutdir, p).split(sep).join(posix.sep);
      const imports = `import "./${r(entryPath)}";\nexport * from "./${r(entryPath)}";`;
      if (sourcemap === 'external') {
        await appendFile(entryPath, `\n//# sourceMappingURL=${r(entryPath)}.map`, {
          encoding: 'utf8'
        });
      } else if (publicPath && sourcemap) {
        const fixedPublicPath = publicPath.endsWith('/') ? publicPath : publicPath + '/';
        const entryContent = await readFile(entryPath, { encoding: 'utf8' });
        await writeFile(
          entryPath,
          entryContent.replace(`sourceMappingURL=${fixedPublicPath}`, 'sourceMappingURL='),
          { encoding: 'utf8' }
        );
      }
      const tmpJsCode = `${imports}\n${jsCode}`;
      const tmpJsPath = _resolve(absOutdir, '.build.inject.js');
      await writeFile(tmpJsPath, tmpJsCode, { encoding: 'utf8' });
      await esbuild.build({
        charset,
        absWorkingDir: absOutdir,
        write: true,
        allowOverwrite: true,
        treeShaking: false,
        logLevel,
        format,
        target,
        minify,
        sourceRoot,
        publicPath,
        sourcemap,
        sourcesContent,
        entryPoints: {
          [entryName]: tmpJsPath
        },
        outdir: absOutdir,
        bundle: true,
        external
      });
      await unlink(tmpJsPath);
    };

    /** @type {string[]} */
    const cssContents = [];
    /** @type {string[]} */
    let entriesArray = [];
    if (Array.isArray(entryPoints)) {
      // @ts-ignore
      entriesArray = [...entryPoints];
    } else {
      // @ts-ignore
      Object.keys(entryPoints)
        .sort()
        .forEach((k) => {
          // @ts-ignore
          entriesArray.push(entryPoints[k]);
        });
    }
    const entries = entriesArray.map((p) => (isAbsolute(p) ? p : _resolve(buildRoot, p)));

    log('entries:', entries);

    /** @type {string|null} */
    let entryToInject = null;
    const outputs = Object.keys(result.metafile?.outputs ?? []);

    await Promise.all(
      outputs.map(async (f) => {
        if (
          !entryToInject &&
          result.metafile?.outputs[f].entryPoint &&
          entries.includes(_resolve(buildRoot, result.metafile?.outputs[f]?.entryPoint ?? '')) &&
          ['.js', '.mjs', '.cjs'].includes(extname(f))
        ) {
          entryToInject = _resolve(buildRoot, f);
        }
        if (extname(f) === '.css') {
          const fullpath = _resolve(buildRoot, f);
          const css = await readFile(fullpath, { encoding: 'utf8' });
          const transformed = await transformCss(css);
          cssContents.push(`${transformed}`);
        }
      })
    );

    if (entryToInject && cssContents.length) {
      log('inject css to', _relative(buildRoot, entryToInject));
      const entryName = basename(entryToInject, extname(entryToInject));
      const allCss = cssContents.join('\n');
      const container = typeof options.inject === 'string' ? options.inject : 'head';
      const injectedCode = buildInjectCode(container, allCss, buildId, options);
      await buildJs(entryName, entryToInject, injectedCode);
    }
  }

  log('finished');
};

/**
 * setup
 * @param {import('esbuild').PluginBuild} build
 * @param {import('../index.js').Options} options
 * @returns {Promise<void>}
 */
const setup = async (build, options) => {
  const patchedBuild = await prepareBuild(build, options);
  const modulesCssRegExp = getModulesCssRegExp(options);
  const builtModulesCssRegExp = getBuiltModulesCssRegExp(options);

  const { log, relative, buildRoot, packageVersion } = patchedBuild.context;

  /** @type {Map<string, import('lightningcss').TransformResult & {resolveDir: string}>} */
  const resultMap = new Map();

  patchedBuild.onLoad({ filter: /.*/, namespace: pluginNamespace }, async ({ path }) => {
    const result = resultMap.get(path);
    if (!result) {
      return;
    }
    const { code, map, resolveDir } = result;
    const codeWithSourcemap =
      (code ? code.toString('utf8') : '') +
      (map
        ? `\n/*# sourceMappingURL=data:application/json;base64,${map.toString('base64')} */`
        : '');
    log(path, '==>\n', codeWithSourcemap);
    return {
      contents: codeWithSourcemap,
      loader: patchedBuild.initialOptions.loader?.['.css'] ?? 'css',
      resolveDir
    };
  });

  patchedBuild.onResolve({ filter: new RegExp(`^${pluginNamespace}:`) }, async ({ path }) => {
    return {
      path: getNormalPath(path),
      namespace: pluginNamespace
    };
  });

  patchedBuild.onLoad({ filter: modulesCssRegExp }, async ({ path }) => {
    const filename = relative(path);
    const classPrefix =
      basename(path, extname(path))
        .replace(/[^a-zA-Z0-9]/g, '-')
        .replace(/^\-*/, '') + '__';
    const versionString = packageVersion?.replace(/[^a-zA-Z0-9]/g, '') ?? '';

    const shouldBundle = !!options.bundle;

    const buildFn = shouldBundle ? bundle : transform;

    const result = buildFn({
      filename: shouldBundle ? path : filename,
      // @ts-ignore
      code: shouldBundle ? undefined : await readFile(path),
      cssModules: {
        dashedIdents: options?.dashedIndents,
        pattern: options?.pattern ?? `${classPrefix}[local]_[hash]${versionString}`
      },
      drafts: {
        customMedia: true,
        nesting: true
      },
      errorRecovery: true,
      minify: false,
      sourceMap: !!patchedBuild.initialOptions.sourcemap,
      projectRoot: buildRoot,
      targets: {
        chrome: 112 << 16
      }
    });

    resultMap.set(filename, { ...result, resolveDir: dirname(path) });

    /** @type {string[]} */
    const jsLines = [`import "${pluginNamespace}:${filename}";`];
    const { localsConvention = 'camelCaseOnly' } = options;
    const keepOrigin = !localsConvention?.endsWith('Only');
    const useCamel = localsConvention?.startsWith('camelCase');
    const usePascal = localsConvention?.startsWith('pascal');
    /** @type {[string, string][]} */
    const jsNames = [];
    /** @type {[string, string][]} */
    const originNames = [];
    sortBy(Object.entries(result.exports ?? {}), '0').forEach(([origin, local]) => {
      const jsName = useCamel
        ? camelCase(origin)
        : usePascal
        ? upperFirst(camelCase(origin))
        : camelCase(origin);
      const composesNames = local.composes?.map?.((item) => item.name ?? '')?.join(' ');
      const localName = `${composesNames ? composesNames + ' ' : ''}${local.name}`;
      jsLines.push(`export const ${jsName} = "${localName}";`);
      jsNames.push([jsName, jsName]);
      if (keepOrigin && origin !== jsName) {
        originNames.push([`"${origin}"`, jsName]);
      }
    });
    jsLines.push(`export default {
${uniq([...jsNames, ...originNames])
  .map(([o, l]) => `  ${o}: ${l}`)
  .join(',\n')}
};`);

    // https://github.com/evanw/esbuild/issues/1227
    jsLines.push(`\n//${emptySourceMap}`);

    const jsContents = jsLines.join('\n');
    log(jsContents);

    return {
      contents: jsContents,
      loader: 'js',
      resolveDir: dirname(path),
      watchFiles: [path],
      pluginName: pluginName,
      pluginData: {
        hehe: 'hehe'
      }
    };
  });

  return;

  // resolve xxx.module.css to xxx.module.css?esbuild-css-modules-plugin-building
  patchedBuild.onResolve({ filter: modulesCssRegExp, namespace: 'file' }, (args) => {
    return onResolveModulesCss(args, patchedBuild);
  });

  // load xxx.module.css?esbuild-css-modules-plugin-building
  patchedBuild.onLoad({ filter: modulesCssRegExp, namespace: pluginNamespace }, (args) => {
    return onLoadModulesCss(patchedBuild, options, args);
  });

  // resolve virtual path xxx.module.css?esbuild-css-modules-plugin-built
  patchedBuild.onResolve(
    {
      filter: builtModulesCssRegExp,
      namespace: pluginNamespace
    },
    (args) => {
      return onResolveBuiltModulesCss(args, patchedBuild);
    }
  );

  // load virtual path xxx.module.css?esbuild-css-modules-plugin-built
  patchedBuild.onLoad(
    {
      filter: builtModulesCssRegExp,
      namespace: pluginNamespace
    },
    (args) => {
      return onLoadBuiltModulesCss(args, patchedBuild);
    }
  );

  patchedBuild.onEnd(async (result) => {
    onEnd(patchedBuild, options, result);
  });
};

export { setup };
