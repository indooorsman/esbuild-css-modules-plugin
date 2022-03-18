const pluginV1 = require('./lib/v1');
const plugin = require('./lib/plugin');
const { pluginName } = require('./lib/utils');

/**
 * @type {(options: import('.').Options) => import('esbuild').Plugin}
 */
const CssModulesPlugin = (options = {}) => {
  return {
    name: pluginName,
    setup(build) {
      const { bundle } = build.initialOptions;
      const { v2 } = options;
      const useV2 = v2 && bundle;

      if (useV2) {
        plugin.setup(build, options);
      } else {
        pluginV1.setup(build, options);
      }
    }
  };
};

module.exports = CssModulesPlugin;
