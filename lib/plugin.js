const path = require('path');
const { createHash } = require('crypto');
const fse = require('fs-extra');
const { getAbsoluteUrl, getLogger, tmpBuildDirName } = require('./utils.js');
const cssHandler = require('@parcel/css');
const camelCase = require('lodash/camelCase');

const buildCssModulesJs = async (cssFullPath) => {
  const resolveDir = path.dirname(cssFullPath);
  const classPrefix =
    path.basename(cssFullPath, path.extname(cssFullPath)).replace(/\./g, '-') + '__';

  /**
   * @type {import('@parcel/css').BundleOptions}
   */
  const bundleConfig = {
    filename: cssFullPath,
    minify: false,
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
  urls.forEach(({ url, placeholder }) => {
    finalCssContent = finalCssContent.replace(
      new RegExp(`${placeholder}`, 'g'),
      getAbsoluteUrl(resolveDir, url)
    );
  });

  const jsContent = `export default ${classNames};`;

  if (map) {
    finalCssContent += `\n/*# sourceMappingURL=data:application/json;base64,${map.toString(
      'base64'
    )} */`;
  }
  return {
    jsContent,
    cssContent: finalCssContent
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
  const tmpRoot = path.resolve(process.cwd(), outdir, tmpBuildDirName);
  const tmpDir = path.resolve(tmpRoot, hex.slice(hex.length - 255, hex.length));

  const tmpCssFile = path.join(
    tmpDir,
    fullPath.replace(rootDir, '').replace(/\.modules?\.css$/, '.modules_built.css')
  );

  fse.ensureDirSync(path.dirname(tmpCssFile));

  const { jsContent, cssContent } = await buildCssModulesJs(fullPath);
  fse.writeFileSync(tmpCssFile, `${cssContent}`, { encoding: 'utf-8' });
  log(`build css file`, tmpCssFile.replace(tmpDir, ''));

  // fix path issue on Windows: https://github.com/indooorsman/esbuild-css-modules-plugin/issues/12
  const jsFileContent = `import "${tmpCssFile
    .split(path.sep)
    .join(path.posix.sep)}";\n${jsContent}`;

  return {
    contents: jsFileContent,
    loader: 'js'
  };
};

/**
 * onEnd
 * @param {import('esbuild').PluginBuild} build
 */
const onEnd = (build) => {
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

  build.onEnd(() => {
    onEnd(build);
  });
};

module.exports = {
  setup
};
