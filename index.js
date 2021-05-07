const path = require('path');
const fs = require('fs-extra');
const postcss = require('postcss');
const cssModules = require('postcss-modules');
const util = require('util');
const tmp = require('tmp');
const crypto = require('crypto');
const hash = crypto.createHash('sha256');
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const ensureDir = util.promisify(fs.ensureDir);
const pluginNamespace = 'esbuild-css-modules-plugin-namespace'

const buildCssModulesJS = async (cssFullPath, options) => {
  const {
    localsConvention = 'camelCaseOnly',
    generateScopedName
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

  const jsonStr = JSON.stringify(cssModulesJSON);
  hash.update(cssFullPath);
  const styleId = hash.copy().digest('hex');
  return `(function(){if (!document.getElementById('${styleId}')) {var ele = document.createElement('style');ele.id = '${styleId}';ele.textContent = \`${result.css}\`;document.head.appendChild(ele);}})();export default ${jsonStr};`;
};

const CssModulesPlugin = (options = {}) => {
  return {
    name: 'esbuild-css-modules-plugin',
    setup(build) {
      const rootDir = process.cwd();
      const tmpDirPath = tmp.dirSync().name;
      const { outdir, bundle } = build.initialOptions;

      build.onResolve(
        { filter: /\.modules?\.css$/, namespace: 'file' },
        async (args) => {
          const sourceFullPath = path.resolve(args.resolveDir, args.path);

          const sourceExt = path.extname(sourceFullPath);
          const sourceBaseName = path.basename(sourceFullPath, sourceExt);
          const sourceDir = path.dirname(sourceFullPath);
          const sourceRelDir = path.relative(path.dirname(rootDir), sourceDir);

          const tmpDir = path.resolve(tmpDirPath, sourceRelDir);
          await ensureDir(tmpDir);
          const tmpFilePath = path.resolve(tmpDir, `${sourceBaseName}.css`);

          const jsContent = await buildCssModulesJS(sourceFullPath, options);

          await writeFile(`${tmpFilePath}.js`, jsContent);

          if (outdir && !bundle) {
            fs.ensureDirSync(outdir);
            const target = path.resolve(outdir, `${path.relative(rootDir, sourceFullPath)}.js`);
            fs.ensureDirSync(path.dirname(target));
            fs.copyFileSync(`${tmpFilePath}.js`, target);

            console.log('[esbuild-css-modules-plugin]', path.relative(rootDir, sourceFullPath), '=>', path.relative(rootDir, target))
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
                importer: args.importer,
                namespace: args.namespace,
                resolveDir: args.resolveDir,
                kind: args.kind
              }
            }
          };
        }
      );

      build.onLoad({ filter: /\.modules?\.css\.js$/, namespace: pluginNamespace }, (args) => {
        const {path: resolvePath, importer} = args.pluginData.resolveArgs;
        const importerName = path.basename(importer);
        console.log('[esbuild-css-modules-plugin]', `${resolvePath} => ${resolvePath}.js => ${importerName}`);
        return { contents: args.pluginData.content, loader: 'js' };
      });
    }
  };
};

module.exports = CssModulesPlugin;
