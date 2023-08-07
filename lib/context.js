import { resolve } from 'node:path';
import { getBuildId, getLogger, getRootDir, getRelativePath, getPackageInfo } from './utils.js';

/**
 * @param {import('esbuild').PluginBuild} _build
 * @param {import('../index.js').Options} [options]
 * @returns {import('../index.js').Build}
 */
export const patchContext = (_build, options = {}) => {
  /** @type {import('../index.js').Build} */
  // @ts-ignore
  const build = _build;
  build.initialOptions.metafile = true;
  build.initialOptions.outbase ??= '.';

  const buildId = getBuildId(build);
  const { name, version } = getPackageInfo(build, options || {});
  const buildRoot = getRootDir(build);

  const log = getLogger(build);

  /** @param {string} to */
  const relative = (to) => {
    // @ts-ignore
    return getRelativePath(build, to);
  };

  const entryPoints = build.initialOptions.entryPoints ?? [];
  /** @type {string[]} */
  const normalizedEntries = [];
  if (Array.isArray(entryPoints)) {
    entryPoints?.forEach((entry) => {
      if (typeof entry === 'string') {
        normalizedEntries.push(resolve(buildRoot, entry));
      }
      if (typeof entry === 'object' && entry.in) {
        normalizedEntries.push(resolve(buildRoot, entry.in));
      }
    });
  } else {
    Object.values(entryPoints).forEach((entry) => {
      normalizedEntries.push(resolve(buildRoot, entry));
    });
  }

  build.context = {
    buildId,
    buildRoot,
    log,
    relative,
    packageName: name,
    packageVersion: version,
    options: options || {},
    normalizedEntries
  };

  return build;
};
