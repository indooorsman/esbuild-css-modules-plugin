import {
  basename,
  dirname,
  extname,
  sep,
  resolve as _resolve,
  relative as _relative
} from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, writeFile, unlink, appendFile, mkdir } from 'node:fs/promises';
import {
  getLogger,
  pluginName,
  getRootDir,
  pluginNamespace,
  getModulesCssRegExp,
  getRelativePath,
  getBuildId,
  validateNamedExport,
  getPackageVersion,
  getNormalPath,
  emptySourceMap,
  nsPathRegexp,
  contentsPlaceholder,
  digestPlaceholder
} from './utils.js';
import { transform, bundle } from 'lightningcss';
import { camelCase, upperFirst, uniq, sortBy } from 'lodash-es';
import { createRequire } from 'node:module';
import { transform as esbuildTransfrom } from 'esbuild';

/**
 * prepareBuild
 * @param {import('esbuild').PluginBuild} build
 * @param {import('../index.js').Options} options
 * @return {Promise<import('../index.js').Build>}
 */
const prepareBuild = async (build, options) => {
  build.initialOptions.metafile = true;

  const buildId = await getBuildId(build);
  const packageVersion = getPackageVersion(build);
  const packageRoot = options.root;
  const buildRoot = getRootDir(build);

  const log = getLogger(build);

  /** @param {string} to */
  const relative = (to) => {
    // @ts-ignore
    return getRelativePath(build, to);
  };

  let injectorPath = undefined;
  if (options.inject) {
    const require = createRequire(import.meta.url);
    const nodeModulesPath = require.resolve('esbuild').split('node_modules')['0'] + 'node_modules';
    const tmpFold = _resolve(nodeModulesPath, '.tmp', pluginName, buildId);
    await mkdir(tmpFold, { recursive: true });
    const containerSelector = typeof options.inject === 'string' ? options.inject : 'head';

    // TODO: inject cuold be a function

    const injectorCode = `const contents = "${contentsPlaceholder}";
const digest = "${digestPlaceholder}";
const inject = () => {
  setTimeout(() => {
    if (!window || !window.document) {
      return;
    }
    let root = window.document.querySelector("${containerSelector}");
    if (root && root.shadowRoot) {
      root = root.shadowRoot;
    }
    if (!root) {
      root = window.document.head;
    }
    let container = root.querySelector("#_" + digest);
    if (!container) {
      container = window.document.createElement("style");
      container.id = "_" + digest;
      const text = window.document.createTextNode(contents);
      container.appendChild(text);
      root.appendChild(container);
    }
  }, 0);
};    
export { inject };`;
    injectorPath = _resolve(tmpFold, 'injector.js');
    await writeFile(injectorPath, injectorCode, { encoding: 'utf8' });
  }

  // @ts-ignore
  build.context = {
    buildId,
    buildRoot,
    packageRoot,
    packageVersion,
    injectorPath,
    log,
    relative
  };

  log(`root of this build(#${buildId}):`, buildRoot);

  // @ts-ignore
  return build;
};

/**
 * setup
 * @param {import('esbuild').PluginBuild} build
 * @param {import('../index.js').Options} options
 * @returns {Promise<void>}
 */
const setup = async (build, options) => {
  const patchedBuild = await prepareBuild(build, options);
  const modulesCssRegExp = getModulesCssRegExp(options);

  const { log, relative, buildRoot, packageVersion } = patchedBuild.context;

  /** @type {Map<string, import('lightningcss').TransformResult>} */
  const resultMap = new Map();

  patchedBuild.onLoad({ filter: /.*/, namespace: pluginNamespace }, ({ path }) => {
    const result = resultMap.get(path);
    if (!result) {
      return;
    }
    const { code, map } = result;
    const codeWithSourcemap =
      (code ? code.toString('utf8') : '') +
      (map
        ? `\n/*# sourceMappingURL=data:application/json;base64,${map.toString('base64')} */`
        : '');

    return {
      contents: codeWithSourcemap,
      loader: patchedBuild.initialOptions.loader?.['.css'] ?? 'css',
      resolveDir: dirname(path)
    };
  });

  patchedBuild.onResolve({ filter: nsPathRegexp }, ({ path }) => {
    return {
      path: getNormalPath(path),
      namespace: pluginNamespace
    };
  });

  patchedBuild.onLoad({ filter: modulesCssRegExp }, async ({ path }) => {
    const relativeFilePath = relative(path);

    const classPrefix =
      basename(path, extname(path))
        .replace(/[^a-zA-Z0-9]/g, '-')
        .replace(/^\-*/, '') + '__';
    const versionString = packageVersion?.replace(/[^a-zA-Z0-9]/g, '') ?? '';

    // const shouldBundle = !!options.bundle;
    // TODO: to support composes
    const shouldBundle = true;

    const buildFn = shouldBundle ? bundle : transform;

    const result = buildFn({
      filename: relativeFilePath,
      // @ts-ignore
      code: shouldBundle ? undefined : await readFile(path),
      cssModules: {
        dashedIdents: options?.dashedIndents,
        pattern: options?.pattern ?? `${classPrefix}[local]_[hash]${versionString}`
      },
      drafts: {
        customMedia: true,
        nesting: true
      },
      errorRecovery: true,
      minify: false,
      sourceMap: !!patchedBuild.initialOptions.sourcemap,
      projectRoot: buildRoot,
      targets: {
        chrome: 112 << 16
      }
    });

    resultMap.set(relativeFilePath, result);

    /** @type {string[]} */
    const jsLines = [`import "${pluginNamespace}:${relativeFilePath}";`];

    const { localsConvention = 'camelCaseOnly' } = options;
    const keepOrigin = !localsConvention?.endsWith('Only');
    const useCamel = localsConvention?.startsWith('camelCase');
    const usePascal = localsConvention?.startsWith('pascalCase');

    /** @type {[string, string][]} */
    const jsNames = [];

    /** @type {[string, string][]} */
    const originNames = [];

    sortBy(Object.entries(result.exports ?? {}), '0').forEach(([origin, local]) => {
      const jsName = useCamel
        ? camelCase(origin)
        : usePascal
        ? upperFirst(camelCase(origin))
        : camelCase(origin);
      const composesNames = local.composes?.map?.((item) => item.name ?? '')?.join(' ');
      const localName = `${composesNames ? composesNames + ' ' : ''}${local.name}`;
      jsLines.push(`const ${jsName} = "${localName}";`);
      jsNames.push([jsName, jsName]);
      if (keepOrigin && origin !== jsName) {
        originNames.push([`"${origin}"`, jsName]);
      }
    });

    options?.inject
      ? jsLines.push(`import { inject } from ".${sep}${_relative(
          dirname(path),
          patchedBuild.context.injectorPath ?? ''
        )}";
export default new Proxy({
${uniq([...jsNames, ...originNames])
  .map(([o, l]) => `  ${o}: ${l}`)
  .join(',\n')}
}, {
  get: function(source, key) {
    inject();
    return source[key];
  }
});`)
      : jsLines.push(`export default {
  ${uniq([...jsNames, ...originNames])
    .map(([o, l]) => `  ${o}: ${l}`)
    .join(',\n')}
  };`);

    // https://github.com/evanw/esbuild/issues/1227
    jsLines.push(`//${emptySourceMap}`);

    const jsContents = jsLines.join('\n');

    return {
      contents: jsContents,
      loader: 'js',
      resolveDir: dirname(path),
      watchFiles: [path],
      pluginName
    };
  });

  patchedBuild.onEnd(async (result) => {
    /** @type {string[]} */
    const builtCssFiles = [];
    /** @type {string[]} */
    const builtJsFiles = [];
    Object.keys(result.metafile?.outputs ?? {}).forEach((name) => {
      name.endsWith('.css') && builtCssFiles.push(name);
      name.endsWith('js') && builtJsFiles.push(name);
    });
    /** @type {string[]} */
    const baseNames = [];
    const cssContents = (
      await Promise.all(
        builtCssFiles.map((p) => {
          baseNames.push(basename(p, '.css'));
          return readFile(_resolve(buildRoot, p), { encoding: 'utf8' }).then((css) => {
            return esbuildTransfrom(css, {
              minify: true,
              sourcemap: false,
              target: 'esnext',
              loader: 'css'
            }).then((r) => {
              return r.code.trim();
            });
          });
        })
      )
    ).join('');
    const digest = createHash('md5').update(baseNames.join('')).digest('hex');
    await Promise.all(
      builtJsFiles.map((js) => {
        const jsFullPath = _resolve(buildRoot, js);
        return readFile(jsFullPath, { encoding: 'utf8' }).then((content) => {
          if (content.includes(contentsPlaceholder)) {
            const newContent = content
              .replace(contentsPlaceholder, cssContents)
              .replace(digestPlaceholder, digest);
            return writeFile(jsFullPath, newContent, { encoding: 'utf8' });
          }
        });
      })
    );
  });
};

export { setup };
