const path = require('path');
const { createHash } = require('crypto');
const fse = require('fs-extra');
const { getAbsoluteUrl, getLogger, tmpBuildDirName, buildInjectCode } = require('./utils.js');
const cssHandler = require('@parcel/css');
const camelCase = require('lodash/camelCase');

/**
 * buildCssModulesJs
 * @param {{fullPath: string; outDir: string; options: import('..').Options; digest: string; build: import('esbuild').PluginBuild}} params
 * @returns {Promise<{builtCssFullPath: string; jsContent: string;}>}
 */
const buildCssModulesJs = async ({ fullPath, outDir, options, digest, build }) => {
  const { assetNames, publicPath } = build.initialOptions;
  const inject = options && options.inject;
  const resolveDir = path.dirname(fullPath);
  const classPrefix = path.basename(fullPath, path.extname(fullPath)).replace(/\./g, '-') + '__';

  /**
   * @type {import('@parcel/css').BundleOptions}
   */
  const bundleConfig = {
    filename: fullPath,
    minify: !!inject,
    sourceMap: true,
    cssModules: true,
    analyzeDependencies: true
  };
  const { code, exports = {}, map, dependencies = [] } = cssHandler.bundle(bundleConfig);

  let finalCssContent = code.toString('utf-8');

  const cssModulesJSON = {};
  Object.keys(exports).forEach((originClass) => {
    const patchedClass = exports[originClass].name;
    cssModulesJSON[camelCase(originClass)] = classPrefix + patchedClass;
    finalCssContent = finalCssContent.replace(
      new RegExp(`\\.${patchedClass}`, 'g'),
      '.' + classPrefix + patchedClass
    );
  });
  const classNames = JSON.stringify(cssModulesJSON, null, 2);

  const urls = dependencies.filter((d) => d.type === 'url');
  const urlFullPathMap = {};
  urls.forEach(({ url, placeholder }) => {
    const assetAbsolutePath = getAbsoluteUrl(resolveDir, url);
    if (inject) {
      urlFullPathMap[placeholder] = assetAbsolutePath;
    } else {
      finalCssContent = finalCssContent.replace(
        new RegExp(`${placeholder}`, 'g'),
        assetAbsolutePath
      );
    }
  });

  let injectCode = '';
  let builtCssFullPath = null;

  if (inject) {
    const typeofInject = typeof inject;
    if (typeofInject === 'boolean') {
      injectCode = buildInjectCode('head', finalCssContent, digest, { urlFullPathMap });
    } else if (typeofInject === 'string') {
      injectCode = buildInjectCode(inject, finalCssContent, digest, { urlFullPathMap });
    } else if (typeofInject === 'function') {
      injectCode = inject(finalCssContent, digest, { urlFullPathMap });
    } else {
      throw new Error('type of `inject` must be boolean or string or function');
    }
  } else {
    const cssFileName = path.basename(fullPath);
    const builtCssFileName = cssFileName.replace(/\.modules?\.css$/i, '.module.built.css');
    builtCssFullPath = path.resolve(outDir, builtCssFileName);
    fse.ensureDirSync(outDir);
    if (map) {
      finalCssContent += `\n/*# sourceMappingURL=data:application/json;base64,${map.toString(
        'base64'
      )} */`;
    }
    fse.writeFileSync(builtCssFullPath, finalCssContent, { encoding: 'utf-8' });

    // fix path issue on Windows: https://github.com/indooorsman/esbuild-css-modules-plugin/issues/12
    injectCode = `import "${builtCssFullPath.split(path.sep).join(path.posix.sep)}";`;
  }

  const jsContent = `${injectCode}\nexport default ${classNames};`;

  return {
    jsContent,
    builtCssFullPath
  };
};

/**
 * onLoad
 * @param {import('esbuild').PluginBuild} build
 * @param {import('..').Options} options
 * @param {import('esbuild').OnLoadArgs} args
 * @return {(import('esbuild').OnLoadResult | null | undefined | Promise<import('esbuild').OnLoadResult | null | undefined>)}
 */
const onLoad = async (build, options, args) => {
  const { outdir } = build.initialOptions;
  const rootDir = process.cwd();
  const log = getLogger(build);
  const fullPath = args.path;
  const hex = createHash('sha256').update(fullPath).digest('hex');
  const digest = hex.slice(hex.length - 255, hex.length);
  const tmpRoot = path.resolve(process.cwd(), outdir, tmpBuildDirName);
  const tmpDir = path.resolve(tmpRoot, digest);

  const tmpCssFile = path.join(tmpDir, fullPath.replace(rootDir, ''));
  const tmpCssDir = path.dirname(tmpCssFile);

  fse.ensureDirSync(path.dirname(tmpCssFile));

  const { jsContent, builtCssFullPath } = await buildCssModulesJs({
    fullPath,
    options,
    digest,
    outDir: tmpCssDir,
    build
  });

  builtCssFullPath && log('built css:', builtCssFullPath.replace(tmpDir, ''));

  return {
    contents: jsContent,
    loader: 'js'
  };
};

/**
 * onEnd
 * @param {import('esbuild').PluginBuild} build
 * @param {import('..').Options} options
 * @param {import('esbuild').BuildResult} result
 */
const onEnd = (build, options, result) => {
  if (build.initialOptions.watch) {
    return;
  }
  getLogger(build)('clean temp files...');
  try {
    const { outdir } = build.initialOptions;
    const tmpRoot = path.resolve(process.cwd(), outdir, tmpBuildDirName);

    fse.removeSync(tmpRoot);
  } catch (error) {}
};

/**
 * setup
 * @param {import('esbuild').PluginBuild} build
 * @param {import('..').Options} options
 * @return {void}
 */
const setup = (build, options) => {
  build.onLoad({ filter: /\.modules?\.css$/ }, async (args) => {
    return await onLoad(build, options, args);
  });

  build.onEnd((result) => {
    onEnd(build, options, result);
  });
};

module.exports = {
  setup
};
