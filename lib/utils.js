const path = require('path');
const pluginName = require('../package.json').name;
const pluginNamespace = `${pluginName}-namespace`;
const tmpBuildDirName = `.esbuild_plugin_css_modules`;

/**
 * getLogger
 * @param {import('esbuild').PluginBuild} build
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
 * getAbsoluteUrl
 * @param {string} resolveDir
 * @param {string} url
 * @returns {string}
 */
const getAbsoluteUrl = (resolveDir, url) => {
  const pureUrl = url.replace(/\"/g, '').replace(/\'/g, '');
  if (path.isAbsolute(pureUrl) || pureUrl.startsWith('http')) {
    return pureUrl;
  }
  return path.resolve(resolveDir, pureUrl);
};

/**
 * buidInjectCode
 * @param {string} injectToSelector
 * @param {string} css
 * @param {string} digest
 * @returns {string}
 */
const buildInjectCode = (injectToSelector = 'head', css, digest, { urlFullPathMap }) => {
  const patchedPlaceholders = [];
  const imports = Object.keys(urlFullPathMap)
    .map((placeholder) => {
      // placeholder can start with number
      patchedPlaceholders.push('__' + placeholder);
      return `import __${placeholder} from '${urlFullPathMap[placeholder]}';`;
    })
    .join('\n');
  return `${imports}
(function(){
  let css = \`${css}\`;
  ${
    patchedPlaceholders.length
      ? `
  const placeholders = \`${patchedPlaceholders.join(',')}\`.split(',');
  const urls = [${patchedPlaceholders.join(',')}];
  placeholders.forEach(function(p, index) {
    const originPlaceholder = p.replace(/^__/, '');
    css = css.replace(new RegExp(\`"\${originPlaceholder}"\`, 'g'), urls[index]);
  });
  `
      : ''
  }
  
  const __inject = function() {
    let root = document.querySelector('${injectToSelector}');
    if (root && root.shadowRoot) {
      root = root.shadowRoot;
    }
    if (!root) {
      root = document.head;
      console.warn('[esbuild-css-modules-plugin]', 'can not find element \`${injectToSelector}\`, append style to', root);
    }
    if (!root.querySelector('#${digest}')) {
      const el = document.createElement('style');
      el.id = '${digest}';
      el.textContent = css;
      root.appendChild(el);
    }
  }
  if (document.readyState !== 'interactive' && document.readyState !== 'complete') {
    window.addEventListener('DOMContentLoaded', function() {
      __inject();
    });
  } else {
    __inject();
  }
})();  
  `;
};

module.exports = {
  pluginName,
  pluginNamespace,
  getLogger,
  getAbsoluteUrl,
  tmpBuildDirName,
  buildInjectCode
};
