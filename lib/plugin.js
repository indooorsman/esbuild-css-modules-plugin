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
  pluginJsNamespace,
  getModulesCssRegExp,
  getRelativePath,
  getBuildId,
  validateNamedExport,
  getPackageVersion,
  emptySourceMap,
  contentsPlaceholder,
  digestPlaceholder,
  pluginCssNamespace
} from './utils.js';
import { transform, bundle } from 'lightningcss';
import { camelCase, upperFirst, uniq, sortBy } from 'lodash-es';
import { createRequire } from 'node:module';

const virtualJsExt = '__virtual__.js';

/**
 * prepareBuild
 * @param {import('esbuild').PluginBuild} build
 * @param {import('../index.js').Options} options
 * @return {Promise<import('../index.js').Build>}
 */
const prepareBuild = async (build, options) => {
  if (options.inject && options.namedExports) {
    throw new Error(`[${pluginName}]: \`inject\` & \`namedExports\` can not be used at same time`);
  }

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
    const isEsbuildBundleMode = build.initialOptions.bundle ?? false;

    const injectorCode =
      typeof options.inject === 'function'
        ? `const inject = () => {
const digest = ${digestPlaceholder};
const contents = ${contentsPlaceholder};
if (globalThis[\`__\${digest}_injected\`]) { return; }
setTimeout(() => {
  ${options.inject('contents', 'digest')}
}, 0);
globalThis["__${digestPlaceholder}_injected"] = true;
};
${isEsbuildBundleMode ? 'export { inject };' : ''}`
        : `const contents = ${contentsPlaceholder};
const digest = ${digestPlaceholder};
const inject = () => {
  if (globalThis[\`__\${digest}_injected\`]) { return; }  
  setTimeout(() => {
    if (!globalThis.document) {
      return;
    }
    let root = globalThis.document.querySelector("${containerSelector}");
    if (root && root.shadowRoot) {
      root = root.shadowRoot;
    }
    if (!root) {
      root = globalThis.document.head;
    }
    let container = root.querySelector("#_" + digest);
    if (!container) {
      container = globalThis.document.createElement("style");
      container.id = "_" + digest;
      const text = globalThis.document.createTextNode(contents);
      container.appendChild(text);
      root.appendChild(container);
    }
  }, 0);
  globalThis[\`__\${digest}_injected\`] = true;
};    
${isEsbuildBundleMode ? 'export { inject };' : ''}`;
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
  const supportNamedExports = options.namedExports ?? false;
  const isEsbuildBundleMode = build.initialOptions.bundle ?? false;

  patchedBuild.onLoad({ filter: /.*/, namespace: pluginCssNamespace }, ({ pluginData }) => {
    const result = pluginData.builtCssResult;
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
      loader: patchedBuild.initialOptions.loader?.['.css'] || 'css',
      resolveDir: pluginData.resolveDir
    };
  });

  patchedBuild.onResolve(
    { filter: modulesCssRegExp, namespace: pluginJsNamespace },
    ({ path, pluginData, resolveDir }) => {
      return {
        path,
        namespace: pluginCssNamespace,
        pluginData: {
          ...pluginData,
          resolveDir
        }
      };
    }
  );

  patchedBuild.onLoad(
    { filter: new RegExp(`\\.${virtualJsExt}$`), namespace: pluginJsNamespace },
    async ({ pluginData }) => {
      const { resolveDir, originPath } = pluginData;
      const fullpath = _resolve(resolveDir, originPath);
      const relativeFilePath = relative(fullpath);

      const classPrefix = basename(originPath, extname(originPath))
        .replace(/[^a-zA-Z0-9]/g, '-')
        .replace(/^\-*/, '');
      const versionString = packageVersion?.replace(/[^a-zA-Z0-9]/g, '') ?? '';

      // const shouldBundle = !!options.bundle;
      // TODO: to support composes
      const shouldBundle = true;

      const buildFn = shouldBundle ? bundle : transform;

      const result = buildFn({
        filename: relativeFilePath,
        // @ts-ignore
        code: shouldBundle ? undefined : await readFile(fullpath),
        cssModules: {
          dashedIdents: options?.dashedIndents,
          pattern: options?.pattern ?? `${classPrefix}__[local]_[hash]__${versionString}`
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

      /** @type {string[]} */
      // const jsLines = isEsbuildBundleMode ? [`import "${pluginNamespace}:${relativeFilePath}";`] : [];
      const jsLines = isEsbuildBundleMode ? [`import "${originPath}";`] : [];

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

        if (supportNamedExports) {
          const isNameValid = validateNamedExport(jsName);
          if (!isNameValid) {
            throw new Error(
              `class name cannot be a js keyword: \`${jsName}\` in ${relativeFilePath}`
            );
          }
          jsLines.push(`export const ${jsName} = "${localName}";`);
        }

        jsNames.push([jsName, supportNamedExports ? jsName : `"${localName}"`]);
        if (keepOrigin && origin !== jsName) {
          originNames.push([origin, supportNamedExports ? jsName : `"${localName}"`]);
        }
      });

      const injectorCode = isEsbuildBundleMode
        ? `import { inject } from ".${sep}${_relative(
            pluginData.resolveDir,
            patchedBuild.context.injectorPath ?? ''
          )}";`
        : options?.inject && patchedBuild.context.injectorPath
        ? await readFile(patchedBuild.context.injectorPath, { encoding: 'utf8' })
        : '';

      options?.inject
        ? jsLines.push(`${injectorCode}
export default new Proxy({
${uniq([...jsNames, ...originNames])
  .map(([o, l]) => `  "${o}": ${l}`)
  .join(',\n')}
}, {
  get: function(source, key) {
    inject();
    return source[key];
  }
});`)
        : jsLines.push(`export default {
  ${uniq([...jsNames, ...originNames])
    .map(([o, l]) => `  "${o}": ${l}`)
    .join(',\n')}
};`);

      // https://github.com/evanw/esbuild/issues/1227
      jsLines.push(`//${emptySourceMap}`);

      const jsContents = jsLines.join('\n');

      const codeWithSourcemap =
        (result.code ? result.code.toString('utf8') : '') +
        (result.map
          ? `\n/*# sourceMappingURL=data:application/json;base64,${result.map.toString(
              'base64'
            )} */`
          : '');

      if (isEsbuildBundleMode) {
        return {
          contents: jsContents,
          loader: 'js',
          resolveDir: pluginData.resolveDir,
          watchFiles: [relativeFilePath],
          pluginName,
          pluginData: {
            builtCssResult: result
          }
        };
      }

      /** @type {import('esbuild').BuildOptions} */
      const buildOption = {
        absWorkingDir: buildRoot,
        bundle: false,
        stdin: {
          contents: jsContents,
          loader: 'js',
          resolveDir: pluginData.resolveDir,
          sourcefile: pluginData.originPath
        },
        format: patchedBuild.initialOptions.format,
        target: patchedBuild.initialOptions.target,
        minify: false,
        sourcemap: patchedBuild.initialOptions.sourcemap,
        sourceRoot: patchedBuild.initialOptions.sourceRoot,
        sourcesContent: patchedBuild.initialOptions.sourcesContent,
        write: true,
        entryNames: patchedBuild.initialOptions.entryNames,
        outfile:
          _resolve(patchedBuild.initialOptions.outdir ?? '', pluginData.originPath) +
          (patchedBuild.initialOptions.outExtension?.['.js'] ?? '.js'),
        logLevel: patchedBuild.initialOptions.logLevel,
        define: {
          [digestPlaceholder]: JSON.stringify(
            createHash('md5').update(relativeFilePath).digest('hex')
          ),
          [contentsPlaceholder]: JSON.stringify(result.code.toString('utf8').replaceAll('\n', ''))
        }
      };
      patchedBuild.esbuild.build(buildOption);

      return {
        contents: codeWithSourcemap,
        resolveDir: pluginData.resolveDir,
        pluginName,
        loader: patchedBuild.initialOptions.loader?.['.css'] || 'css'
      };
    }
  );

  patchedBuild.onResolve(
    { filter: modulesCssRegExp, namespace: 'file' },
    ({ path, resolveDir }) => {
      return {
        path: `${path}.${virtualJsExt}`,
        namespace: pluginJsNamespace,
        pluginName,
        pluginData: {
          resolveDir,
          originPath: path
        }
      };
    }
  );

  // if (!isEsbuildBundleMode) {
  //   patchedBuild.onResolve({ filter: modulesCssRegExp }, ({ path, resolveDir }) => {
  //     return {
  //       path,
  //       resolveDir,
  //       namespace: pluginNamespace
  //     };
  //   });
  // }

  patchedBuild.onEnd(async (result) => {
    log('metafile:', JSON.stringify(result.metafile, null, 2));
    if (isEsbuildBundleMode) {
      /** @type {string[]} */
      const builtCssFiles = [];
      /** @type {string[]} */
      const builtJsFiles = [];
      Object.keys(result.metafile?.outputs ?? {}).forEach((name) => {
        name.endsWith('.css') && builtCssFiles.push(name);
        /\.(js|cjs|mjs)$/i.test(name) && builtJsFiles.push(name);
      });
      /** @type {string[]} */
      const baseNames = [];
      const cssContents = (
        await Promise.all(
          builtCssFiles.map((p) => {
            const name = basename(p, '.css');
            baseNames.push(name);
            return readFile(_resolve(buildRoot, p)).then((css) => {
              return transform({
                code: css,
                minify: true,
                filename: name,
                cssModules: false,
                analyzeDependencies: false,
                sourceMap: false
              })
                .code.toString('utf8')
                .trim();
            });
          })
        )
      ).join('');
      const digest = createHash('md5')
        .update(baseNames.join('') + pluginJsNamespace)
        .digest('hex');
      await Promise.all(
        builtJsFiles.map((js) => {
          const jsFullPath = _resolve(buildRoot, js);
          return readFile(jsFullPath, { encoding: 'utf8' }).then((content) => {
            if (content.includes(contentsPlaceholder)) {
              const newContent = content
                .replaceAll(contentsPlaceholder, `"${cssContents}"`)
                .replaceAll(digestPlaceholder, `"${digest}"`);
              return writeFile(jsFullPath, newContent, { encoding: 'utf8' });
            }
          });
        })
      );
    } else {
      /** @type {string[]} */
      const builtJsFiles = [];
      Object.keys(result.metafile?.outputs ?? {}).forEach((name) => {
        /\.(js|cjs|mjs)$/i.test(name) && builtJsFiles.push(name);
      });
      await Promise.all(
        builtJsFiles.map((js) => {
          const jsFullPath = _resolve(buildRoot, js);
          return readFile(jsFullPath, { encoding: 'utf8' }).then((content) => {
            if (content.includes('.css"')) {
              const newContent = content.replaceAll('.css"', `.css.js"`);
              return writeFile(jsFullPath, newContent, { encoding: 'utf8' });
            }
          });
        })
      );
    }
  });
};

export { setup };
