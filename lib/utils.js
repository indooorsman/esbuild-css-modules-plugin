import { isAbsolute, resolve, sep, relative, basename, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { accessSync, constants } from 'node:fs';
import { createRequire } from 'node:module';
import { omit } from 'lodash-es';
import { appendFile, mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);

const pluginName = `esbuild-css-modules-plugin`;

const pluginJsNamespace = `${pluginName}-ns-js`;
const pluginCssNamespace = `${pluginName}-ns-css`;
const pluginInjectMethodName = `__${pluginName.replaceAll('-', '_')}_inject__`;

const nsPathRegexp = new RegExp(`^${pluginJsNamespace}:`, 'i');

/**
 * getModulesCssRegExp
 * @param {import('../index.js').Options} options
 * @returns {RegExp}
 */
const getModulesCssRegExp = (options) => {
  return options.filter ?? /\.modules?\.css$/i;
};

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
  return () => undefined;
};

/**
 * getRootDir
 * @param {import('esbuild').PluginBuild} build
 * @returns {string}
 */
const getRootDir = (build) => {
  const { absWorkingDir } = build.initialOptions;
  const abs = absWorkingDir ? absWorkingDir : process.cwd();
  const rootDir = isAbsolute(abs) ? resolve(abs) : resolve(process.cwd(), abs);
  return rootDir;
};

/**
 * getPackageInfo
 * @param {import('esbuild').PluginBuild} build
 * @param {import('../index.js').Options} [options]
 * @returns {{name: string; version: string;}}
 */
const getPackageInfo = (build, options) => {
  const rootDir = getRootDir(build);
  if (options?.package?.name) {
    return {
      name: options.package.name,
      version: options.package.version
    };
  }
  const packageJsonFile = resolve(rootDir, './package.json');
  try {
    accessSync(packageJsonFile, constants.R_OK);
    return require(packageJsonFile);
  } catch (error) {
    return { name: '', version: '' };
  }
};

/**
 * getRelativePath
 * @description get relative path (starts with `.`) from build root
 * @param {import('../index.js').Build} build
 * @param {string} to
 * @returns {string}
 */
const getRelativePath = (build, to) => {
  if (!isAbsolute(to)) {
    return to.startsWith('.') ? to : `.${sep}${to}`;
  }
  const root = build.context?.buildRoot ?? getRootDir(build);
  return `.${sep}${relative(root, to)}`;
};

/**
 * getBuildId
 * @description buildId should be stable so that the hash of output files are stable
 * @param {import('esbuild').PluginBuild} build
 * @returns {string}
 */
const getBuildId = (build) => {
  const { entryPoints, stdin } = build.initialOptions;
  const buildRoot = getRootDir(build);
  const { version: packageVersion, name: packageName } = getPackageInfo(build);
  const identity = JSON.stringify({
    ...omit(build.initialOptions, ['outdir', 'outfile', 'nodePaths', 'absWorkingDir', 'plugins']),
    base: basename(buildRoot),
    entryPoints: entryPoints ?? '',
    stdin: stdin ?? '',
    packageName,
    packageVersion
  });

  return createHash('md5').update(identity).digest('hex');
};

const jsKeywords = [
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'super',
  'switch',
  'static',
  'this',
  'throw',
  'try',
  'true',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield'
];

/**
 * @param {string} name
 * @returns {boolean}
 */
const validateNamedExport = (name) => {
  return !jsKeywords.includes(name);
};

const emptySourceMap =
  '# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIiJdLCJtYXBwaW5ncyI6IkEifQ==';

const contentPlaceholder = '__content_placeholder__';
const digestPlaceholder = '__digest_placeholder__';

/**
 * @param {string} to
 * @returns string
 */
const relativeToCwd = (to) => relative(process.cwd(), to);

const genDigest = (/** @type {string} */ str, /** @type {string} */ buildId) =>
  createHash('md5').update(`${pluginName}:${buildId}:${str}`).digest('hex');

const validateOptions = (/** @type {import('../index.js').Options} */ options) => {
  if (options.inject && options.namedExports) {
    throw new Error(`[${pluginName}]: \`inject\` & \`namedExports\` can not be used at same time`);
  }
  if (options.forceInlineImages) {
    if (options.force === false) {
      // yellow: enabled ? formatter("\x1b[33m", "\x1b[39m") : String,
      console.log(
        `\x1b[33m[${pluginName}] Warning: \`force\` will always be \`true\` when \`forceInlineImages\` is \`true\`\x1b[39m`
      );
    }
    options.force = true;
  }
};

const injectorVirtualPath = 'injector.js';

const simpleMinifyCss = (
  /** @type {string} */ css,
  /** @type {import('esbuild').PluginBuild['esbuild']} */ esbuild
) =>
  esbuild
    ? esbuild.transformSync(css, { loader: 'css', minify: true, sourcemap: false }).code
    : css.replaceAll(/(\\n|\n|\/\*.+?\*\/)/g, '').replaceAll(/\s+/g, ' ');

/**
 * ensureFile
 * @param {string} filepath
 * @param {string} data
 */
const ensureFile = async (filepath, data) => {
  if (!data) {
    return;
  }
  const dir = dirname(filepath);
  await mkdir(dir, { recursive: true });
  await appendFile(filepath, data.trim(), { encoding: 'utf8' });
};

export {
  pluginName,
  pluginJsNamespace,
  pluginCssNamespace,
  nsPathRegexp,
  getLogger,
  getRootDir,
  getModulesCssRegExp,
  getRelativePath,
  getBuildId,
  validateNamedExport,
  getPackageInfo,
  emptySourceMap,
  contentPlaceholder,
  digestPlaceholder,
  relativeToCwd,
  genDigest,
  validateOptions,
  injectorVirtualPath,
  pluginInjectMethodName,
  simpleMinifyCss,
  ensureFile
};
