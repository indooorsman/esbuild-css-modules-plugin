import { setup } from './lib/plugin.js';
import { pluginName } from './lib/utils.js';

/**
 * @type {(options: import('./index.js').Options) => import('esbuild').Plugin}
 */
const CssModulesPlugin = (options = {}) => {
  return {
    name: pluginName,
    setup: async (build) => {
      await setup(build, options);
    }
  };
};

export default CssModulesPlugin;
