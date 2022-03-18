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

module.exports = {
  pluginName,
  pluginNamespace,
  getLogger,
  getAbsoluteUrl,
  tmpBuildDirName
};
