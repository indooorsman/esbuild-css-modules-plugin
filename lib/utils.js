const path = require('path');
const pluginName = require('../package.json').name.toLowerCase();
const pluginNamespace = `${pluginName}-namespace`;
const builtCssSurfix = `.${pluginName}.module.built.css`

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
const buildInjectCode = (
  injectToSelector = 'head',
  css,
  digest,
  options
) => {
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
    `
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

module.exports = {
  pluginName,
  pluginNamespace,
  getLogger,
  getRootDir,
  buildInjectCode,
  builtCssSurfix
};
