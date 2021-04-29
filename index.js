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
  return `
    (function() {
      if (!document.getElementById('${styleId}')) {
        var ele = document.createElement('style');
        ele.id = '${styleId}';
        ele.textContent = \`${result.css}\`;
        document.head.appendChild(ele);
      }
    })();
    export default ${jsonStr};
  `;
};

const CssModulesPlugin = (options = {}) => {
  return {
    name: 'esbuild-css-modules-plugin',
    setup(build) {
      const rootDir = process.cwd();
      const tmpDirPath = tmp.dirSync().name;

      build.onResolve(
        { filter: /\.modules?\.(css)$/ },
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

          return {
            path: `${tmpFilePath}.js`,
          };
        }
      );
    }
  };
};

module.exports = CssModulesPlugin;
