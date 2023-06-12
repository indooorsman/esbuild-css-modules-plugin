/**
 * CssModulesPlugin
 * @param {import('.').Options} options 
 * @returns {import('esbuild').Plugin}
 */
module.exports = (options) => {
  return {
    name: `esbuild-css-modules-plugin`,
    setup: async (build) => {
      const { setup } = await import('./index.js');
      setup(build, options);
    }
  };
};
