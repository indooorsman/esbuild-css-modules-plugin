import { basename, dirname, extname, normalize, relative, resolve, sep } from 'node:path';
import { CSSTransformer, CSSInjector } from './lib/css.helper.js';
import {
  contentPlaceholder,
  digestPlaceholder,
  genDigest,
  getModulesCssRegExp,
  injectorVirtualPath,
  pluginCssNamespace,
  pluginJsNamespace,
  pluginName,
  simpleMinifyCss,
  validateOptions
} from './lib/utils.js';
import { compact } from 'lodash-es';
import { readFile, writeFile } from 'node:fs/promises';
import { patchContext } from './lib/context.js';

/**
 * @param {import('esbuild').PluginBuild} build
 * @param {import('./index.js').Options} _options
 */
export const setup = (build, _options) => {
  build.initialOptions.metafile = true;
  const options = _options || {};
  validateOptions(options);

  const patchedBuild = patchContext(build, options);
  const { log, buildId, buildRoot } = patchedBuild.context;
  log(`initialize build context with options:`, options);
  log(`root of this build(#${buildId}):`, buildRoot);

  const modulesCssRegExp = getModulesCssRegExp(options);
  const bundle = patchedBuild.initialOptions.bundle ?? false;
  const forceBuild = options.force ?? false;
  const injectCss = options.inject ?? false;
  const cssLoader = patchedBuild.initialOptions.loader?.['.css'] ?? 'css';
  const jsLoader = patchedBuild.initialOptions.loader?.['.js'] ?? 'js';
  const outJsExt = patchedBuild.initialOptions.outExtension?.['.js'] ?? '.js';
  const forceInlineImages = !!options.forceInlineImages;

  patchedBuild.onLoad({ filter: /.+/, namespace: pluginCssNamespace }, (args) => {
    const { path } = args;
    const realPath = resolve(buildRoot, path.replace(`${pluginCssNamespace}:`, ''));
    return {
      contents: CSSTransformer.getInstance(patchedBuild)?.getCachedResult(realPath)?.css,
      loader: cssLoader,
      resolveDir: dirname(realPath)
    };
  });

  patchedBuild.onLoad(
    { filter: new RegExp(`:${injectorVirtualPath}$`), namespace: pluginJsNamespace },
    (args) => {
      log(`[${pluginJsNamespace}] on load injector:`, args);

      return {
        contents: CSSInjector.getInstance(patchedBuild)?.libCode,
        loader: jsLoader
      };
    }
  );

  patchedBuild.onResolve(
    { filter: new RegExp(`^(${pluginCssNamespace}|${pluginJsNamespace}):`), namespace: 'file' },
    (args) => {
      const { path } = args;
      const [, ns, originPath] =
        path.match(new RegExp(`^(${pluginCssNamespace}|${pluginJsNamespace}):(.+)$`)) ?? [];

      log(`on resolve ${ns}:`, args);

      /** @type {import('esbuild').OnResolveResult} */
      const r = { namespace: ns, path: originPath, pluginData: { ...(args.pluginData ?? {}) } };
      if (originPath.endsWith(`:${injectorVirtualPath}`)) {
        r.path = `:${injectorVirtualPath}`;
      }
      log('resolved:', r);

      return r;
    }
  );

  patchedBuild.onLoad({ filter: modulesCssRegExp, namespace: 'file' }, async (args) => {
    log('[file] on load:', args);
    const { path } = args;
    const rpath = relative(buildRoot, path);

    const prefix = basename(rpath, extname(path))
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/^\-*/, '');
    const suffix = patchedBuild.context.packageVersion?.replace(/[^a-zA-Z0-9]/g, '') ?? '';
    CSSTransformer.getInstance(patchedBuild).bundle(path, { prefix, suffix, forceInlineImages });

    if (!bundle && !forceBuild) {
      return undefined;
    } else if (!bundle && forceBuild) {
      const buildResult = CSSTransformer.getInstance(patchedBuild).getCachedResult(path);

      const outdir = resolve(buildRoot, patchedBuild.initialOptions.outdir ?? '');
      const outbase = patchedBuild.initialOptions.outbase;
      let outfile = resolve(outdir, rpath) + outJsExt;
      if (outbase) {
        let normalized = normalize(outbase);
        if (normalized.endsWith(sep)) {
          normalized = compact(normalized.split(sep)).join(sep);
        }
        outfile = resolve(outfile.replace(normalized, ''));
      }

      if (injectCss) {
        return {
          contents: buildResult?.js
            ?.replace(contentPlaceholder, simpleMinifyCss(JSON.stringify(buildResult?.css)))
            .replace(digestPlaceholder, JSON.stringify(genDigest(rpath, buildId))),
          loader: jsLoader,
          watchFiles: [path],
          resolveDir: dirname(path),
          pluginData: {
            originCssPath: path
          }
        };
      } else {
        return {
          contents: buildResult?.css,
          loader: cssLoader,
          watchFiles: [path],
          resolveDir: dirname(path),
          pluginData: {
            originCssPath: path
          }
        };
      }
    } else if (bundle) {
      return {
        contents: CSSTransformer.getInstance(patchedBuild).getCachedResult(path)?.js,
        loader: jsLoader,
        watchFiles: [path],
        resolveDir: dirname(path),
        pluginData: {
          originCssPath: path
        }
      };
    }
  });

  const dispose = () => {
    CSSInjector.getInstance(patchedBuild)?.dispose();
    CSSTransformer.getInstance(patchedBuild)?.dispose();
  };

  patchedBuild.onEnd(async (r) => {
    if (!bundle && forceBuild) {
      /** @type {[string, Record<string, string>][]} */
      const jsFiles = [];
      /** @type {Record<string, string>} */
      Object.entries(r.metafile?.outputs ?? {}).forEach(([js, meta]) => {
        if (meta.entryPoint && !modulesCssRegExp.test(meta.entryPoint)) {
          let shouldPush = false;
          /** @type {Record<string, string>} */
          const defines = {};
          meta.imports?.forEach((imp) => {
            if (modulesCssRegExp.test(imp.path)) {
              shouldPush = true;
              defines[imp.path] = imp.path.replace(/\.css$/i, outJsExt);
            }
          });
          if (shouldPush) {
            jsFiles.push([js, defines]);
          }
        }
      });

      await Promise.all(
        jsFiles.map(([js, places]) => {
          const fulljs = resolve(buildRoot, js);
          return readFile(fulljs, { encoding: 'utf8' })
            .then((content) => {
              let newContent = content;
              Object.entries(places).forEach(([f, t]) => {
                log(`fix import path in ${js}: ${f} ===> ${t}`);
                newContent = newContent.replaceAll(f, t);
              });
              return newContent;
            })
            .then((nc) => {
              return writeFile(fulljs, nc, { encoding: 'utf8' });
            });
        })
      );

      return dispose();
    }

    if (!injectCss || !bundle) {
      return dispose();
    }

    /** @type {[string, string][]} */
    const filesToBuild = [];
    Object.entries(r.metafile?.outputs ?? {}).forEach(([outfile, meta]) => {
      if (meta.cssBundle) {
        filesToBuild.push([outfile, meta.cssBundle]);
      }
    });

    log('build inject js code for', filesToBuild);
    await Promise.all(
      filesToBuild.map(([f, c]) => {
        const fullJsPath = resolve(buildRoot, f);
        const fullCssPath = resolve(buildRoot, c);
        return Promise.all([
          readFile(fullCssPath, { encoding: 'utf8' }),
          readFile(fullJsPath, { encoding: 'utf8' })
        ])
          .then(([css, js]) => {
            const newJs = js
              .replace(contentPlaceholder, simpleMinifyCss(JSON.stringify(css)))
              .replace(digestPlaceholder, JSON.stringify(genDigest(c, buildId)));
            return newJs;
          })
          .then((newJs) => writeFile(fullJsPath, newJs, { encoding: 'utf8' }));
      })
    );

    dispose();
  });
};

/**
 * @type {(options: import('./index.js').Options) => import('esbuild').Plugin}
 */
const CssModulesPlugin = (options) => {
  return {
    name: pluginName,
    setup: (build) => setup(build, options)
  };
};

export default CssModulesPlugin;
