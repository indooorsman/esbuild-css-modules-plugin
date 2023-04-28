import { isAbsolute, resolve, sep, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { accessSync, constants, readFileSync } from 'node:fs';

const pluginName = `esbuild-css-modules-plugin`;

const pluginNamespace = `${pluginName}-namespace`;

const nsPathRegexp = new RegExp(`^${pluginNamespace}:`, 'i');

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
  return () => void 0;
};


/**
 * getRootDir
 * @param {import('esbuild').PluginBuild} build
 * @returns {string}
 */
const getRootDir = (build) => {
  const { absWorkingDir } = build.initialOptions;
  const abs = absWorkingDir ? absWorkingDir : process.cwd();
  const rootDir = isAbsolute(abs) ? abs : resolve(process.cwd(), abs);
  return rootDir;
};

/**
 * getPackageInfo
 * @param {import('esbuild').PluginBuild} build
 * @returns {{name: string; version: string;}}
 */
const getPackageInfo = (build) => {
  const rootDir = getRootDir(build);
  const packageJsonFile = resolve(rootDir, './package.json');
  try {
    accessSync(packageJsonFile, constants.R_OK);
    return JSON.parse(readFileSync(packageJsonFile, { encoding: 'utf8' }));
  } catch (error) {
    return { name: '', version: '' };
  }
};

/**
 * getPackageVersion
 * @param {import('esbuild').PluginBuild} build
 * @returns {string}
 */
const getPackageVersion = (build) => {
  return getPackageInfo(build).version;
};

/**
 * getRelativePath
 * @description get relative path from build root
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
 * @returns {Promise<string>}
 */
const getBuildId = async (build) => {
  const { entryPoints } = build.initialOptions;
  const buildRoot = getRootDir(build);
  const { version: packageVersion, name: packageName } = getPackageInfo(build);
  /** @type {string[]} */
  let entries = [];
  if (Array.isArray(entryPoints)) {
    // @ts-ignore
    entries = [...entryPoints];
  } else {
    Object.keys(entryPoints ?? {})
      .sort()
      .forEach((k) => {
        // @ts-ignore
        entries.push(entryPoints[k]);
      });
  }
  const entryContents =
    `// ${packageName}@${packageVersion}\n` +
    (
      await Promise.all(
        entries.map((p) => {
          if (!p) {
            return Promise.resolve('');
          }
          const absPath = isAbsolute(p) ? p : resolve(buildRoot, p);
          return readFile(absPath, { encoding: 'utf8' }).catch(() => '');
        })
      )
    ).join('\n');
  return createHash('sha256').update(entryContents).digest('hex');
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

/**
 * getNormalPath
 * @param {string} pathWithNamespace
 * @returns string
 */
const getNormalPath = (pathWithNamespace) => {
  return pathWithNamespace.replace(nsPathRegexp, '');
};

const emptySourceMap =
  '# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIiJdLCJtYXBwaW5ncyI6IkEifQ==';

const contentsPlaceholder = '__contents_placeholder__';
const digestPlaceholder = '__digest_placeholder__';

export {
  pluginName,
  pluginNamespace,
  nsPathRegexp,
  getLogger,
  getRootDir,
  getModulesCssRegExp,
  getRelativePath,
  getBuildId,
  validateNamedExport,
  getPackageInfo,
  getPackageVersion,
  getNormalPath,
  emptySourceMap,
  contentsPlaceholder,
  digestPlaceholder
};
