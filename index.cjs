"use strict";
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;

var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};

// index.js

var import_node_path4 = require("node:path");

// lib/css.helper.js
var import_lightningcss = require("lightningcss");
var import_node_path2 = require("node:path");

// lib/utils.js
var import_node_path = require("node:path");
var import_node_crypto = require("node:crypto");
var import_node_fs = require("node:fs");
var import_lodash_es = require("lodash");
var pluginName = `esbuild-css-modules-plugin`;
var pluginJsNamespace = `${pluginName}-ns-js`;
var pluginCssNamespace = `${pluginName}-ns-css`;
var pluginInjectMethodName = `__${pluginName.replaceAll("-", "_")}_inject__`;
var nsPathRegexp = new RegExp(`^${pluginJsNamespace}:`, "i");
var getModulesCssRegExp = (options) => {
  return options.filter ?? /\.modules?\.css$/i;
};
var getLogger = (build) => {
  const { logLevel } = build.initialOptions;
  if (logLevel === "debug" || logLevel === "verbose") {
    return (...args) => {
      console.log(`[${pluginName}]`, ...args);
    };
  }
  return () => void 0;
};
var getRootDir = (build) => {
  const { absWorkingDir } = build.initialOptions;
  const abs = absWorkingDir ? absWorkingDir : process.cwd();
  const rootDir = (0, import_node_path.isAbsolute)(abs) ? (0, import_node_path.resolve)(abs) : (0, import_node_path.resolve)(process.cwd(), abs);
  return rootDir;
};
var getPackageInfo = (build, options) => {
  const rootDir = getRootDir(build);
  if (options?.package?.name) {
    return {
      name: options.package.name,
      version: options.package.version
    };
  }
  const packageJsonFile = (0, import_node_path.resolve)(rootDir, "./package.json");
  try {
    (0, import_node_fs.accessSync)(packageJsonFile, import_node_fs.constants.R_OK);
    return require(packageJsonFile);
  } catch (error) {
    return { name: "", version: "" };
  }
};
var getRelativePath = (build, to) => {
  if (!(0, import_node_path.isAbsolute)(to)) {
    return to.startsWith(".") ? to : `.${import_node_path.sep}${to}`;
  }
  const root = build.context?.buildRoot ?? getRootDir(build);
  return `.${import_node_path.sep}${(0, import_node_path.relative)(root, to)}`;
};
var getBuildId = (build) => {
  const { entryPoints, stdin } = build.initialOptions;
  const buildRoot = getRootDir(build);
  const { version: packageVersion, name: packageName } = getPackageInfo(build);
  const identity = JSON.stringify({
    ...(0, import_lodash_es.omit)(build.initialOptions, ["outdir", "outfile", "nodePaths", "absWorkingDir", "plugins"]),
    base: (0, import_node_path.basename)(buildRoot),
    entryPoints: entryPoints ?? "",
    stdin: stdin ?? "",
    packageName,
    packageVersion
  });
  return (0, import_node_crypto.createHash)("md5").update(identity).digest("hex");
};
var jsKeywords = [
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "super",
  "switch",
  "static",
  "this",
  "throw",
  "try",
  "true",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield"
];
var validateNamedExport = (name) => {
  return !jsKeywords.includes(name);
};
var emptySourceMap = "# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIiJdLCJtYXBwaW5ncyI6IkEifQ==";
var contentPlaceholder = "__content_placeholder__";
var digestPlaceholder = "__digest_placeholder__";
var genDigest = (str, buildId) => (0, import_node_crypto.createHash)("md5").update(`${pluginName}:${buildId}:${str}`).digest("hex");
var validateOptions = (options) => {
  if (options.inject && options.namedExports) {
    throw new Error(`[${pluginName}]: \`inject\` & \`namedExports\` can not be used at same time`);
  }
};
var injectorVirtualPath = "injector.js";
var simpleMinifyCss = (css) => css.replaceAll(/(\\n|\n|\/\*.+?\*\/)/g, "");

// lib/css.helper.js
var import_lodash_es2 = require("lodash");
var _CSSInjector = class {
  /** @type {string} */
  libCode;
  /** @type {import('../index.js').Build} */
  build;
  /** @type {import('../index.js').Options['inject']} */
  inject;
  /**
   * @param {import('../index.js').Build} build
   */
  constructor(build) {
    this.build = build;
    this.inject = build.context.options?.inject;
    this.libCode = this.genLibCode();
  }
  /**
   * @param {import('../index.js').Build} build
   * @returns {CSSInjector|null}
   */
  static getInstance(build) {
    if (!build.context.options?.inject) {
      return null;
    }
    let instance = _CSSInjector.__instances__.get(build);
    if (!instance) {
      instance = new _CSSInjector(build);
      _CSSInjector.__instances__.set(build, instance);
    }
    return instance;
  }
  genCustomInject() {
    if (typeof this.inject !== "function") {
      return "";
    }
    const isEsbuildBundleMode = this.build.initialOptions.bundle ?? false;
    return `
const content = ${contentPlaceholder};
const digest = ${digestPlaceholder};
const inject = () => {
  setTimeout(() => {
    ${this.inject("content", "digest")}
  }, 0);
};
    
${isEsbuildBundleMode ? "export { inject };" : ""}
    `;
  }
  genDefaultInject() {
    const containerSelector = typeof this.inject === "string" ? this.inject : "head";
    const isEsbuildBundleMode = this.build.initialOptions.bundle ?? false;
    return `
const content = ${contentPlaceholder};
const digest = ${digestPlaceholder};  
const inject = () => {
  setTimeout(() => {
    if (!globalThis.document) {
      return;
    }
    let root = globalThis.document.querySelector(${JSON.stringify(containerSelector)});
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
      const text = globalThis.document.createTextNode(content);
      container.appendChild(text);
      root.appendChild(container);
    }
  }, 0);
};

${isEsbuildBundleMode ? "export { inject };" : ""}
    `;
  }
  genLibCode() {
    return typeof this.inject === "function" ? this.genCustomInject() : this.genDefaultInject();
  }
  genImportCode(cssPath = "") {
    const isEsbuildBundleMode = this.build.initialOptions.bundle ?? false;
    return isEsbuildBundleMode ? `import { inject } from "${pluginJsNamespace}:${cssPath}:${injectorVirtualPath}";` : this.libCode;
  }
  dispose() {
    _CSSInjector.__instances__.delete(this.build);
  }
};
var CSSInjector = _CSSInjector;
/** @type {Map<import('../index.js').Build, CSSInjector>} */
__publicField(CSSInjector, "__instances__", /* @__PURE__ */ new Map());
var _CSSTransformer = class {
  /**
   * @param {import('../index.js').Build} build
   */
  constructor(build) {
    this.build = build;
    this.__result_cache__ = /* @__PURE__ */ new Map();
  }
  /**
   * @param {import("../index.js").Build} build
   */
  static getInstance(build) {
    let instance = _CSSTransformer.__instances__.get(build);
    if (!instance) {
      instance = new _CSSTransformer(build);
      _CSSTransformer.__instances__.set(build, instance);
    }
    return instance;
  }
  /**
   * @param {import('lightningcss').CSSModuleExports | void} exports
   * @param {string} fullpath
   * @returns {string}
   */
  genModulesJs(exports, fullpath) {
    const { options, buildRoot } = this.build.context;
    const relativePath = (0, import_node_path2.relative)(buildRoot, fullpath);
    const supportNamedExports = options.namedExports ?? false;
    const isEsbuildBundleMode = this.build.initialOptions.bundle ?? false;
    const jsLines = isEsbuildBundleMode ? [`import "${pluginCssNamespace}:${relativePath}";`] : [];
    const { localsConvention = "camelCaseOnly" } = options;
    const keepOrigin = !localsConvention?.endsWith("Only");
    const useCamel = localsConvention?.startsWith("camelCase");
    const usePascal = localsConvention?.startsWith("pascalCase");
    const nameSet = /* @__PURE__ */ new Set();
    const jsNames = [];
    const originNames = [];
    (0, import_lodash_es2.sortBy)(Object.entries(exports ?? {}), "0").forEach(([origin, local]) => {
      const jsName = useCamel ? (0, import_lodash_es2.camelCase)(origin) : usePascal ? (0, import_lodash_es2.upperFirst)((0, import_lodash_es2.camelCase)(origin)) : (0, import_lodash_es2.camelCase)(origin);
      const composesNames = local.composes?.map?.((item) => item.name ?? "")?.join(" ");
      const localName = `${composesNames ? composesNames + " " : ""}${local.name}`;
      if (supportNamedExports) {
        const isNameValid = validateNamedExport(jsName);
        if (!isNameValid) {
          throw new Error(`class name cannot be a js keyword: \`${jsName}\` in ${relativePath}`);
        }
        if (!nameSet.has(jsName)) {
          jsLines.push(`export const ${jsName} = "${localName}";`);
        }
      }
      jsNames.push([jsName, supportNamedExports ? jsName : `"${localName}"`]);
      if (keepOrigin && origin !== jsName) {
        originNames.push([origin, supportNamedExports ? jsName : `"${localName}"`]);
        nameSet.add(origin);
      }
      nameSet.add(jsName);
    });
    if (options.inject) {
      const injectorCode = CSSInjector.getInstance(this.build)?.genImportCode(relativePath) ?? "";
      jsLines.push(`
${injectorCode}
export default new Proxy({
${(0, import_lodash_es2.uniqBy)([...jsNames, ...originNames], "0").map(([o, l]) => `  "${o}": ${l}`).join(",\n")}
}, {
  get: function(source, key) {
    inject();
    return source[key];
  }
});
      `);
    } else {
      jsLines.push(`
export default {
${(0, import_lodash_es2.uniqBy)([...jsNames, ...originNames], "0").map(([o, l]) => `  "${o}": ${l}`).join(",\n")}
};
      `);
    }
    jsLines.push(`//${emptySourceMap}`);
    const jsContents = jsLines.join("\n");
    return jsContents;
  }
  /**
   * @param {string} fullpath
   */
  getCachedResult(fullpath) {
    return this.__result_cache__.get(fullpath);
  }
  /**
   * @param {string} fullpath the absolute path of css file
   * @param {{prefix?: string; suffix?: string;}} [opt]
   */
  bundle(fullpath, opt) {
    this.__result_cache__.delete(fullpath);
    const { options } = this.build.context;
    const {
      code,
      map: sourcemap,
      exports
    } = (0, import_lightningcss.bundle)({
      filename: fullpath,
      cssModules: {
        dashedIdents: options?.dashedIndents,
        pattern: options?.pattern ?? `${opt?.prefix ?? ""}__[local]_[hash]__${opt?.suffix ?? ""}`
      },
      drafts: {
        customMedia: true,
        nesting: true
      },
      errorRecovery: true,
      minify: false,
      sourceMap: !!this.build.initialOptions.sourcemap,
      projectRoot: this.build.context.buildRoot,
      targets: {
        chrome: 112 << 16
      }
    });
    const originCss = code ? code.toString("utf8") : "";
    const css = originCss + (sourcemap ? `
/*# sourceMappingURL=data:application/json;base64,${sourcemap.toString("base64")} */` : "");
    const js = this.genModulesJs(exports, fullpath);
    const result = {
      css,
      js
    };
    this.__result_cache__.set(fullpath, result);
    return result;
  }
  dispose() {
    this.__result_cache__.clear();
    _CSSTransformer.__instances__.delete(this.build);
  }
};
var CSSTransformer = _CSSTransformer;
/** @type {Map<import('../index.js').Build, CSSTransformer>} */
__publicField(CSSTransformer, "__instances__", /* @__PURE__ */ new Map());

// index.js
var import_lodash_es3 = require("lodash");
var import_promises = require("node:fs/promises");

// lib/context.js
var import_node_path3 = require("node:path");
var patchContext = (_build, options = {}) => {
  const build = _build;
  build.initialOptions.metafile = true;
  const buildId = getBuildId(build);
  const { name, version } = getPackageInfo(build, options || {});
  const buildRoot = getRootDir(build);
  const log = getLogger(build);
  const relative4 = (to) => {
    return getRelativePath(build, to);
  };
  const entryPoints = build.initialOptions.entryPoints ?? [];
  const normalizedEntries = [];
  if (Array.isArray(entryPoints)) {
    entryPoints?.forEach((entry) => {
      if (typeof entry === "string") {
        normalizedEntries.push((0, import_node_path3.resolve)(buildRoot, entry));
      }
      if (typeof entry === "object" && entry.in) {
        normalizedEntries.push((0, import_node_path3.resolve)(buildRoot, entry.in));
      }
    });
  } else {
    Object.values(entryPoints).forEach((entry) => {
      normalizedEntries.push((0, import_node_path3.resolve)(buildRoot, entry));
    });
  }
  build.context = {
    buildId,
    buildRoot,
    log,
    relative: relative4,
    packageName: name,
    packageVersion: version,
    options: options || {},
    normalizedEntries
  };
  return build;
};

// index.js
var CssModulesPlugin = (_options) => {
  return {
    name: pluginName,
    setup: (build) => {
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
      const cssLoader = patchedBuild.initialOptions.loader?.[".css"] ?? "css";
      const jsLoader = patchedBuild.initialOptions.loader?.[".js"] ?? "js";
      const outJsExt = patchedBuild.initialOptions.outExtension?.[".js"] ?? ".js";
      patchedBuild.onLoad({ filter: /.+/, namespace: pluginCssNamespace }, (args) => {
        const { path } = args;
        const realPath = (0, import_node_path4.resolve)(buildRoot, path.replace(`${pluginCssNamespace}:`, ""));
        return {
          contents: CSSTransformer.getInstance(patchedBuild)?.getCachedResult(realPath)?.css,
          loader: cssLoader,
          resolveDir: (0, import_node_path4.dirname)(realPath)
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
        { filter: new RegExp(`^(${pluginCssNamespace}|${pluginJsNamespace}):`), namespace: "file" },
        (args) => {
          const { path } = args;
          const [, ns, originPath] = path.match(new RegExp(`^(${pluginCssNamespace}|${pluginJsNamespace}):(.+)$`)) ?? [];
          log(`on resolve ${ns}:`, args);
          const r = { namespace: ns, path: originPath, pluginData: { ...args.pluginData ?? {} } };
          if (originPath.endsWith(`:${injectorVirtualPath}`)) {
            r.path = `:${injectorVirtualPath}`;
          }
          log("resolved:", r);
          return r;
        }
      );
      patchedBuild.onLoad({ filter: modulesCssRegExp, namespace: "file" }, async (args) => {
        log("[file] on load:", args);
        const { path } = args;
        const rpath = (0, import_node_path4.relative)(buildRoot, path);
        const prefix = (0, import_node_path4.basename)(rpath, (0, import_node_path4.extname)(path)).replace(/[^a-zA-Z0-9]/g, "-").replace(/^\-*/, "");
        const suffix = patchedBuild.context.packageVersion?.replace(/[^a-zA-Z0-9]/g, "") ?? "";
        CSSTransformer.getInstance(patchedBuild).bundle(path, { prefix, suffix });
        if (!bundle && !forceBuild) {
          return void 0;
        } else if (!bundle && forceBuild) {
          const buildResult = CSSTransformer.getInstance(patchedBuild).getCachedResult(path);
          const outdir = (0, import_node_path4.resolve)(buildRoot, patchedBuild.initialOptions.outdir ?? "");
          const outbase = patchedBuild.initialOptions.outbase;
          let outfile = (0, import_node_path4.resolve)(outdir, rpath) + outJsExt;
          if (outbase) {
            let normalized = (0, import_node_path4.normalize)(outbase);
            if (normalized.endsWith(import_node_path4.sep)) {
              normalized = (0, import_lodash_es3.compact)(normalized.split(import_node_path4.sep)).join(import_node_path4.sep);
            }
            outfile = (0, import_node_path4.resolve)(outfile.replace(normalized, ""));
          }
          if (injectCss) {
            return {
              contents: buildResult?.js?.replace(contentPlaceholder, simpleMinifyCss(JSON.stringify(buildResult?.css))).replace(digestPlaceholder, JSON.stringify(genDigest(rpath, buildId))),
              loader: jsLoader,
              watchFiles: [path],
              resolveDir: (0, import_node_path4.dirname)(path),
              pluginData: {
                originCssPath: path
              }
            };
          } else {
            return {
              contents: buildResult?.css,
              loader: cssLoader,
              watchFiles: [path],
              resolveDir: (0, import_node_path4.dirname)(path),
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
            resolveDir: (0, import_node_path4.dirname)(path),
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
          const jsFiles = [];
          Object.entries(r.metafile?.outputs ?? {}).forEach(([js, meta]) => {
            if (meta.entryPoint && !modulesCssRegExp.test(meta.entryPoint)) {
              let shouldPush = false;
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
              const fulljs = (0, import_node_path4.resolve)(buildRoot, js);
              return (0, import_promises.readFile)(fulljs, { encoding: "utf8" }).then((content) => {
                let newContent = content;
                Object.entries(places).forEach(([f, t]) => {
                  log(`fix import path in ${js}: ${f} ===> ${t}`);
                  newContent = newContent.replaceAll(f, t);
                });
                return newContent;
              }).then((nc) => {
                return (0, import_promises.writeFile)(fulljs, nc, { encoding: "utf8" });
              });
            })
          );
          return dispose();
        }
        if (!injectCss || !bundle) {
          return dispose();
        }
        const filesToBuild = [];
        Object.entries(r.metafile?.outputs ?? {}).forEach(([outfile, meta]) => {
          if (meta.cssBundle) {
            filesToBuild.push([outfile, meta.cssBundle]);
          }
        });
        log("build inject js code for", filesToBuild);
        await Promise.all(
          filesToBuild.map(([f, c]) => {
            const fullJsPath = (0, import_node_path4.resolve)(buildRoot, f);
            const fullCssPath = (0, import_node_path4.resolve)(buildRoot, c);
            return Promise.all([
              (0, import_promises.readFile)(fullCssPath, { encoding: "utf8" }),
              (0, import_promises.readFile)(fullJsPath, { encoding: "utf8" })
            ]).then(([css, js]) => {
              const newJs = js.replace(contentPlaceholder, simpleMinifyCss(JSON.stringify(css))).replace(digestPlaceholder, JSON.stringify(genDigest(c, buildId)));
              return newJs;
            }).then((newJs) => (0, import_promises.writeFile)(fullJsPath, newJs, { encoding: "utf8" }));
          })
        );
        dispose();
      });
    }
  };
};
module.exports = CssModulesPlugin;
