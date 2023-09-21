import { basename, dirname, extname, normalize, relative, resolve, sep } from 'node:path';
import { CSSTransformer, CSSInjector } from './lib/css.helper.js';
import {
  contentPlaceholder,
  digestPlaceholder,
  ensureFile,
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
import { readFile, rename, writeFile } from 'node:fs/promises';
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
  const emitDts = options.emitDeclarationFile;

  patchedBuild.onLoad({ filter: /.+/, namespace: pluginCssNamespace }, (args) => {
    const { path } = args;
    log(`[${pluginCssNamespace}] on load:`, args);
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

      log(`[${ns}] on resolve :`, args);

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
    if (!emitDts && !bundle && !forceBuild) {
      return undefined;
    }

    log('[file] on load:', args);
    const { path } = args;
    const rpath = relative(buildRoot, path);
    const prefix = basename(rpath, extname(path))
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/^\-*/, '');
    const suffix = patchedBuild.context.packageVersion?.replace(/[^a-zA-Z0-9]/g, '') ?? '';

    const buildResult = CSSTransformer.getInstance(patchedBuild).bundle(path, {
      prefix,
      suffix,
      forceInlineImages,
      emitDeclarationFile: !!emitDts
    });

    if (emitDts) {
      if (rpath.startsWith('..')) {
        log(`skip emit dts for file outside of build root:`, rpath);
      } else {
        /** @type {('.d.css.ts'|'.css.d.ts')[]} */
        const dtsExts = [];
        /** @type {import('./index.js').EmitDts} */
        let outdirs = {};
        if (emitDts === '.d.css.ts' || emitDts === '.css.d.ts') {
          dtsExts.push(emitDts);
        } else if (emitDts === true) {
          dtsExts.push('.d.css.ts', '.css.d.ts');
        } else if (typeof emitDts === 'object') {
          outdirs = { ...emitDts };
          if (emitDts['*']) {
            dtsExts.push('.d.css.ts', '.css.d.ts');
          } else {
            emitDts['.css.d.ts'] && dtsExts.push('.css.d.ts');
            emitDts['.d.css.ts'] && dtsExts.push('.d.css.ts');
          }
        }
        const outdir = resolve(buildRoot, patchedBuild.initialOptions.outdir ?? '');
        const outbase = patchedBuild.initialOptions.outbase;
        dtsExts.forEach(async (dtsExt) => {
          let outDtsfile = resolve(outdir, rpath).replace(/\.css$/i, dtsExt);
          const dtsOutdir = outdirs[dtsExt] || outdirs['*'];
          if (dtsOutdir) {
            outDtsfile = resolve(buildRoot, dtsOutdir, rpath).replace(/\.css$/i, dtsExt);
          }
          if (outbase) {
            let normalized = normalize(outbase);
            if (normalized.endsWith(sep)) {
              normalized = compact(normalized.split(sep)).join(sep);
            }
            if (normalized !== '.') {
              outDtsfile = resolve(outDtsfile.replace(normalized, ''));
            }
          }
          log(`emit dts:`, patchedBuild.context.relative(outDtsfile));
          await ensureFile(outDtsfile, buildResult?.dts ?? '');
        });
      }
    }

    if (!bundle && forceBuild) {
      log('force build modules css:', rpath);
      if (injectCss) {
        const anotherBuildOptions = { ...patchedBuild.initialOptions };
        delete anotherBuildOptions.entryPoints;
        delete anotherBuildOptions.plugins;
        const { outputFiles } = await patchedBuild.esbuild.build({
          ...anotherBuildOptions,
          absWorkingDir: buildRoot,
          stdin: {
            contents: buildResult?.css ?? '',
            resolveDir: dirname(path),
            sourcefile: rpath,
            loader: 'css'
          },
          bundle: true,
          minify: true,
          sourcemap: false,
          write: false,
          outExtension: { '.css': '.css' }
        });
        return {
          contents: buildResult?.js
            ?.replace(
              contentPlaceholder,
              JSON.stringify(outputFiles.find((f) => basename(f.path) === 'stdin.css')?.text ?? '')
            )
            .replace(digestPlaceholder, JSON.stringify(genDigest(rpath, buildId))),
          loader: jsLoader,
          watchFiles: [path, ...(buildResult?.composedFiles ?? [])],
          resolveDir: dirname(path),
          pluginData: {
            originCssPath: path
          }
        };
      } else {
        const anotherBuildOptions = { ...patchedBuild.initialOptions };
        delete anotherBuildOptions.entryPoints;
        delete anotherBuildOptions.plugins;
        delete anotherBuildOptions.outdir;
        await patchedBuild.esbuild.build({
          ...anotherBuildOptions,
          absWorkingDir: buildRoot,
          stdin: {
            contents: buildResult?.css ?? '',
            resolveDir: dirname(path),
            sourcefile: rpath,
            loader: 'css'
          },
          bundle: true,
          sourcemap: false,
          outfile: resolve(
            buildRoot,
            patchedBuild.initialOptions.outdir ?? '.',
            relative(
              patchedBuild.initialOptions.outbase ?? '.',
              rpath.replace(/\.css$/i, '.built.css')
            )
          )
        });
        return {
          contents: `import './${basename(path).replace(/\.css$/i, '.built.css')}';\n${
            buildResult?.js
          }`,
          loader: jsLoader,
          watchFiles: [path, ...(buildResult?.composedFiles ?? [])],
          resolveDir: dirname(path),
          pluginData: {
            originCssPath: path
          }
        };
      }
    } else if (bundle) {
      return {
        contents: buildResult?.js,
        loader: jsLoader,
        watchFiles: [path, ...(buildResult?.composedFiles ?? [])],
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
      /** @type {[string, string][]} */
      const moduleJsFiles = [];

      Object.entries(r.metafile?.outputs ?? {}).forEach(([js, meta]) => {
        if (meta.entryPoint && modulesCssRegExp.test(meta.entryPoint)) {
          moduleJsFiles.push([meta.entryPoint, js]);
        }

        if (meta.entryPoint && !modulesCssRegExp.test(meta.entryPoint)) {
          let shouldPush = false;
          /** @type {Record<string, string>} */
          const defines = {};
          meta.imports?.forEach((imp) => {
            if (modulesCssRegExp.test(imp.path)) {
              shouldPush = true;
              defines[imp.path] = imp.path + outJsExt;
            }
          });
          if (shouldPush) {
            jsFiles.push([js, defines]);
          }
        }
      });

      await Promise.all([
        ...moduleJsFiles.map(([src, dist]) => {
          const fp = resolve(buildRoot, dist);
          const filename = basename(src) + outJsExt;
          const finalPath = resolve(dirname(fp), filename);
          log(`rename ${dist} to ${filename}`);
          return rename(fp, finalPath);
        }),
        ...jsFiles.map(([js, places]) => {
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
      ]);

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
              .replace(
                contentPlaceholder,
                JSON.stringify(simpleMinifyCss(css, patchedBuild.esbuild))
              )
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
