const path = require('path');
const { createHash } = require('crypto');
const fse = require('fs-extra');
const fs = require('fs');
const postcss = require('postcss');
const cssModules = require('postcss-modules');
const util = require('util');
const tmp = require('tmp');
const hash = createHash('sha256');
const readFile = util.promisify(fse.readFile);
const writeFile = util.promisify(fse.writeFile);
const ensureDir = util.promisify(fse.ensureDir);
const pluginNamespace = 'esbuild-css-modules-plugin-namespace';
const cssHandler = require('@parcel/css');
const camelCase = require('lodash/camelCase');

const getAbsoluteUrl = (resolveDir, url) => {
  const pureUrl = url.replace(/\"/g, '').replace(/\'/g, '');
  if (path.isAbsolute(pureUrl) || pureUrl.startsWith('http')) {
    return pureUrl;
  }
  return path.resolve(resolveDir, pureUrl);
};

const buildCssModulesJS2 = async (cssFullPath) => {
  const resolveDir = path.dirname(cssFullPath);
  const classPrefix = path.basename(cssFullPath, path.extname(cssFullPath)).replace(/\./g, '-') + '__';

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
      new RegExp(patchedClass, 'g'),
      classPrefix + patchedClass
    )
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

const buildCssModulesJS = async (cssFullPath, options) => {
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

const CssModulesPlugin = (options = {}) => {
  return {
    name: 'esbuild-css-modules-plugin',
    setup(build) {
      const { outdir, bundle, logLevel, watch, target } = build.initialOptions;
      const { v2 } = options;
      const rootDir = process.cwd();
      const tmpDirPath = tmp.dirSync().name;
      const tmpRoot = path.resolve(process.cwd(), outdir, '.esbuild_plugin_css_modules');

      const outputLogs = logLevel === 'debug' || logLevel === 'verbose';

      const useV2 = v2 && bundle;

      if (useV2) {
        build.onLoad({ filter: /\.modules?\.css$/ }, async (args) => {
          const fullPath = args.path;
          const hex = createHash('sha256').update(fullPath).digest('hex');
          const tmpDir = path.resolve(tmpRoot, hex.slice(hex.length - 255, hex.length));

          const tmpCssFile = path.join(
            tmpDir,
            fullPath.replace(rootDir, '').replace(/\.modules?\.css$/, '.modules_built.css')
          );

          fse.ensureDirSync(path.dirname(tmpCssFile));

          const { jsContent, cssContent } = await buildCssModulesJS2(fullPath);
          fs.writeFileSync(tmpCssFile, `${cssContent}`, { encoding: 'utf-8' });
          outputLogs &&
            console.log(`[css-modules-plugin] build css file`, tmpCssFile.replace(tmpDir, ''));

          const jsFileContent = `import "${tmpCssFile
            // fix path issue on Windows: https://github.com/indooorsman/esbuild-css-modules-plugin/issues/12
            .split(path.sep)
            .join(path.posix.sep)}";\n${jsContent}`;

          return {
            contents: jsFileContent,
            loader: 'js'
          };
        });

        build.onEnd(() => {
          if (watch) {
            return;
          }
          outputLogs && console.log('[css-modules-plugin] clean temp files...');
          try {
            fse.removeSync(tmpRoot);
          } catch (error) {}
        });
      } else {
        build.onResolve({ filter: /\.modules?\.css$/, namespace: 'file' }, async (args) => {
          const sourceFullPath = path.resolve(args.resolveDir, args.path);
          const sourceExt = path.extname(sourceFullPath);
          const sourceBaseName = path.basename(sourceFullPath, sourceExt);
          const sourceDir = path.dirname(sourceFullPath);
          const sourceRelDir = path.relative(path.dirname(rootDir), sourceDir);
          const tmpDir = path.resolve(tmpDirPath, sourceRelDir);
          await ensureDir(tmpDir);
          const tmpFilePath = path.resolve(tmpDir, `${sourceBaseName}.css`);

          const { jsContent } = await buildCssModulesJS(sourceFullPath, options);

          await writeFile(`${tmpFilePath}.js`, jsContent, { encoding: 'utf-8' });

          if (outdir && !bundle) {
            const isOutdirAbsolute = path.isAbsolute(outdir);
            const absoluteOutdir = isOutdirAbsolute
              ? outdir
              : path.resolve(args.resolveDir, outdir);
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
            outputLogs &&
              console.log(
                '[css-modules-plugin]',
                path.relative(rootDir, sourceFullPath),
                '=>',
                path.relative(rootDir, target)
              );
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
        });

        build.onLoad({ filter: /\.modules?\.css\.js$/, namespace: pluginNamespace }, (args) => {
          const { path: resolvePath, importer, fullPath } = args.pluginData.resolveArgs;
          const importerName = path.basename(importer);
          outputLogs &&
            console.log(
              '[css-modules-plugin]',
              `${resolvePath} => ${resolvePath}.js => ${importerName}`
            );
          return { contents: args.pluginData.content, loader: 'js', watchFiles: [fullPath] };
        });
      }
    }
  };
};

module.exports = CssModulesPlugin;
