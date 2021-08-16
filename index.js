const path = require('path');
const fse = require('fs-extra');
const fs = require('fs');
const postcss = require('postcss');
const cssModules = require('postcss-modules');
const util = require('util');
const tmp = require('tmp');
const crypto = require('crypto');
const hash = crypto.createHash('sha256');
const readFile = util.promisify(fse.readFile);
const writeFile = util.promisify(fse.writeFile);
const ensureDir = util.promisify(fse.ensureDir);
const pluginNamespace = 'esbuild-css-modules-plugin-namespace';

const buildCssModulesJS = async (cssFullPath, options) => {
  const {
    localsConvention = 'camelCaseOnly',
    inject = true,
    generateScopedName,
    v2,
    bundle
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
      }
    })
  ]).process(css, {
    from: undefined,
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
    injectedCode = inject(css, digest);
  }

  let jsContent = `
const digest = '${digest}';
const css = \`${result.css}\`;
${injectedCode}
export default ${classNames};
export { css, digest };
  `;

  if (bundle && v2) {
    jsContent = `
export default ${classNames};    
    `;
  }

  return {
    jsContent,
    cssContent: result.css
  };
};

const CssModulesPlugin = (options = {}) => {
  return {
    name: 'esbuild-css-modules-plugin',
    setup(build) {
      const tmpFiles = new Set();
      const rootDir = process.cwd();
      const tmpDirPath = tmp.dirSync().name;
      const { outdir, bundle, logLevel } = build.initialOptions;
      const { v2 } = options;

      const outputLogs = logLevel === 'debug' || logLevel === 'verbose';

      const useV2 = v2 && bundle;

      if (useV2) {
        build.onResolve({ filter: /\.modules?\.css$/, namespace: 'file' }, (args) => {
          const fullPath = path.resolve(args.resolveDir, args.path);
          const tmpCssFile = fullPath.replace(/\.modules?\.css$/, '.modules_tmp_.css');
          fs.writeFileSync(tmpCssFile, '/* placeholder */', { encoding: 'utf-8' });
          outputLogs && console.log('[css-modules-puglin] create a placeholder file on resolve:', tmpCssFile);
          return {
            path: fullPath,
            watchFiles: [fullPath]
          };
        });
        build.onLoad({ filter: /\.modules?\.css$/, namespace: 'file' }, async (args) => {
          const { path: fullPath } = args;
          const tmpCssFile = fullPath.replace(/\.modules?\.css$/, '.modules_tmp_.css');
          const { jsContent, cssContent } = await buildCssModulesJS(fullPath, {
            ...options,
            bundle
          });
          fs.writeFileSync(tmpCssFile, cssContent, { encoding: 'utf-8' });
  
          const jsFileContent = `import "${tmpCssFile}";\n${jsContent}`;
          tmpFiles.add(tmpCssFile);
  
          return {
            contents: jsFileContent,
            loader: 'js',
            watchFiles: [fullPath]
          };
        });
  
        build.onEnd(() => {
          outputLogs && console.log('[css-modules-plugin] Clean temp files...');
          tmpFiles.forEach((f) => {
            try {
              fs.unlinkSync(f);
            } catch (error) {}
          });
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
  
          const {jsContent} = await buildCssModulesJS(sourceFullPath, options);
  
          await writeFile(`${tmpFilePath}.js`, jsContent, {encoding: 'utf-8'});
  
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
            outputLogs && console.log(
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
          outputLogs && console.log(
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
