const path = require('path');
const { createHash } = require('crypto');
const { readFileSync } = require('fs');
const pluginName = require('../package.json').name.toLowerCase();
const pluginNamespace = `${pluginName}-namespace`;
const buildingCssSuffix = `?${pluginName}-building`;
const builtCssSuffix = `?${pluginName}-built`;
const builtCssSuffixRegExp = builtCssSuffix.replace('?', '\\?').replace(/\-/g, '\\-');
const modulesCssRegExp = /\.modules?\.css$/i;
const builtModulesCssRegExp = new RegExp(`\\.modules?\\.css${builtCssSuffixRegExp}`, 'i');

/**
 * getLogger
 * @param {import('..').Build} build
 * @returns {(...args: any[]) => void}
 */
const getLogger = (build) => {
  const { logLevel } = build.initialOptions;
  if (logLevel === 'debug' || logLevel === 'verbose') {
    return (...args) => {
      console.log(`[${pluginName}]`, ...args);
    };
  }
  return () => void 0;
};

/**
 * buidInjectCode
 * @param {string} injectToSelector
 * @param {string} css
 * @param {string} digest
 * @param {import('..').Options} options
 * @returns {string}
 */
const buildInjectCode = (injectToSelector = 'head', css, digest, options) => {
  if (typeof options.inject === 'function') {
    return `
(function(){
  const css = \`${css}\`;
  const digest = \`${digest}\`;
  const doInject = () => {
    ${options.inject(css, digest)};
    delete window.__inject_${digest}__;
  };
  window.__inject_${digest}__ = doInject;
})();    
    `;
  }
  return `
(function(){
  const css = \`${css}\`;
  const doInject = () => {
    let root = document.querySelector('${injectToSelector}');
    if (root && root.shadowRoot) {
      root = root.shadowRoot;
    }
    if (!root) {
      root = document.head;
    }
    let container = root.querySelector('#_${digest}');
    if (!container) {
      container = document.createElement('style');
      container.id = '_${digest}';
      root.appendChild(container);
    }
    const text = document.createTextNode(css);
    container.appendChild(text);
    delete window.__inject_${digest}__;
  }
  window.__inject_${digest}__ = doInject;
})();  
  `;
};

/**
 * getRootDir
 * @param {import('..').Build} build
 * @returns {string}
 */
const getRootDir = (build) => {
  const { absWorkingDir } = build.initialOptions;
  const abs = absWorkingDir ? absWorkingDir : process.cwd();
  const rootDir = path.isAbsolute(abs) ? abs : path.resolve(process.cwd(), abs);
  return rootDir;
};

/**
 * getRelativePath
 * @description get relative path from build root
 * @param {import('..').Build} build
 * @param {string} to
 * @returns {string}
 */
const getRelativePath = (build, to) => {
  if (!path.isAbsolute(to)) {
    return to.startsWith('.') ? to : `.${path.sep}${to}`;
  }
  const root = build.context?.buildRoot ?? getRootDir(build);
  return `.${path.sep}${path.relative(root, to)}`;
};

/**
 * getBuildId
 * @description buildId should be stable so that the hash of output files are stable
 * @param {import('..').Build} build
 * @returns {string}
 */
const getBuildId = (build) => {
  const { entryPoints } = build.initialOptions;
  const buildRoot = getRootDir(build);
  const entryPaths = entryPoints.map((p) => {
    return path.isAbsolute(p) ? p : path.resolve(buildRoot, p);
  });
  const entryContents = entryPaths
    .map((p) => {
      return readFileSync(p, { encoding: 'utf8' });
    })
    .join('');
  return createHash('sha256').update(entryContents).digest('hex');
};

module.exports = {
  pluginName,
  pluginNamespace,
  getLogger,
  getRootDir,
  buildInjectCode,
  builtCssSuffix,
  modulesCssRegExp,
  builtModulesCssRegExp,
  buildingCssSuffix,
  getRelativePath,
  getBuildId
};
