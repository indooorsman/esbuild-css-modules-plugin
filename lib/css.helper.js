import { bundle as bundleModulesCss, transform } from 'lightningcss';
import { dirname, relative, resolve } from 'node:path';
import {
  contentPlaceholder,
  digestPlaceholder,
  emptySourceMap,
  pluginCssNamespace,
  validateNamedExport
} from './utils.js';
import { camelCase, sortBy, uniq, uniqBy, upperFirst } from 'lodash-es';
import { injectorVirtualPath, pluginJsNamespace } from './utils.js';
import { readFileSync } from 'node:fs';

export class CSSInjector {
  /** @type {Map<import('../index.js').Build, CSSInjector>} */
  static __instances__ = new Map();

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
    let instance = CSSInjector.__instances__.get(build);
    if (!instance) {
      instance = new CSSInjector(build);
      CSSInjector.__instances__.set(build, instance);
    }
    return instance;
  }

  genCustomInject() {
    if (typeof this.inject !== 'function') {
      return '';
    }
    const isEsbuildBundleMode = this.build.initialOptions.bundle ?? false;
    return `
const content = ${contentPlaceholder};
const digest = ${digestPlaceholder};
const inject = () => {
  setTimeout(() => {
    ${this.inject('content', 'digest')}
  }, 0);
};
    
${isEsbuildBundleMode ? 'export { inject };' : ''}
    `;
  }

  genDefaultInject() {
    const containerSelector = typeof this.inject === 'string' ? this.inject : 'head';
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

${isEsbuildBundleMode ? 'export { inject };' : ''}
    `;
  }

  genLibCode() {
    return typeof this.inject === 'function' ? this.genCustomInject() : this.genDefaultInject();
  }

  genImportCode(cssPath = '') {
    const isEsbuildBundleMode = this.build.initialOptions.bundle ?? false;
    return isEsbuildBundleMode
      ? `import { inject } from "${pluginJsNamespace}:${cssPath}:${injectorVirtualPath}";`
      : this.libCode;
  }

  dispose() {
    CSSInjector.__instances__.delete(this.build);
  }
}

export class CSSTransformer {
  /** @type {Map<import('../index.js').Build, CSSTransformer>} */
  static __instances__ = new Map();

  /**
   * @param {import('../index.js').Build} build
   */
  constructor(build) {
    this.build = build;
    /** @type {Map<string, {css: string; js: string; dts?: string; composedFiles: string[]}>} */
    this.__result_cache__ = new Map();
  }

  /**
   * @param {import("../index.js").Build} build
   */
  static getInstance(build) {
    let instance = CSSTransformer.__instances__.get(build);
    if (!instance) {
      instance = new CSSTransformer(build);
      CSSTransformer.__instances__.set(build, instance);
    }
    return instance;
  }

  /**
   * @param {import('lightningcss').CSSModuleExports | void} exports
   * @param {string} fullpath
   * @param {boolean} emitDts
   * @returns {{js: string, dts?: string}}
   */
  genModulesJs(exports, fullpath, emitDts) {
    const { options, buildRoot } = this.build.context;

    const relativePath = relative(buildRoot, fullpath);
    const supportNamedExports = options.namedExports ?? false;
    const isEsbuildBundleMode = this.build.initialOptions.bundle ?? false;

    /** @type {string[]} */
    const jsLines = isEsbuildBundleMode ? [`import "${pluginCssNamespace}:${relativePath}";`] : [];

    /** @type {string[]} */
    const dtsLines = [];

    const { localsConvention = 'camelCaseOnly' } = options;
    const keepOrigin = !localsConvention?.endsWith('Only');
    const useCamel = localsConvention?.startsWith('camelCase');
    const usePascal = localsConvention?.startsWith('pascalCase');

    /** @type {Set<string>} */
    const nameSet = new Set();

    /** @type {[string, string][]} */
    const jsNames = [];
    /** @type {[string, string][]} */
    const originNames = [];

    sortBy(Object.entries(exports ?? {}), '0').forEach(([origin, local]) => {
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
          throw new Error(`class name cannot be a js keyword: \`${jsName}\` in ${relativePath}`);
        }
        if (!nameSet.has(jsName)) {
          jsLines.push(`export const ${jsName} = "${localName}";`);
          emitDts && dtsLines.push(`export declare const ${jsName}: string;`);
        }
      }

      jsNames.push([jsName, supportNamedExports ? jsName : `"${localName}"`]);

      if (keepOrigin && origin !== jsName) {
        originNames.push([origin, supportNamedExports ? jsName : `"${localName}"`]);
        nameSet.add(origin);
      }

      nameSet.add(jsName);
    });

    const uniqNames = uniqBy([...jsNames, ...originNames], '0');

    emitDts &&
      dtsLines.push(`
declare const ClassNames: {
${uniqNames.map(([o]) => `  "${o}": string;`).join('\n')}
};
export default ClassNames;
      `);

    if (options.inject) {
      const injectorCode = CSSInjector.getInstance(this.build)?.genImportCode(relativePath) ?? '';

      jsLines.push(`
${injectorCode}
export default new Proxy({
${uniqNames.map(([o, l]) => `  "${o}": ${l}`).join(',\n')}
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
${uniqNames.map(([o, l]) => `  "${o}": ${l}`).join(',\n')}
};
      `);
    }

    // https://github.com/evanw/esbuild/issues/1227
    jsLines.push(`//${emptySourceMap}`);

    const jsContents = jsLines.join('\n');

    return { js: jsContents, dts: emitDts ? dtsLines.join('\n') : undefined };
  }

  /**
   * @param {string} fullpath
   */
  getCachedResult(fullpath) {
    return this.__result_cache__.get(fullpath);
  }
  /**
   * @param {string} fullpath the absolute path of css file
   * @param {{prefix?: string; suffix?: string; forceInlineImages?: boolean; emitDeclarationFile?: boolean;}} [opt]
   */
  bundle(fullpath, opt) {
    this.__result_cache__.delete(fullpath);
    const { options } = this.build.context;
    const bundleCssConfig = {
      filename: fullpath,
      cssModules: {
        dashedIdents: options?.dashedIndents,
        pattern: options?.pattern ?? `${opt?.prefix ?? ''}__[local]_[hash]__${opt?.suffix ?? ''}`
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
    };
    const r = bundleModulesCss(bundleCssConfig);

    const t = transform({ ...bundleCssConfig, code: readFileSync(fullpath) });
    /** @type {string[]} */
    const composedFiles = [];
    Object.values(t.exports ?? {}).forEach((exp) => {
      exp.composes?.forEach((c) => {
        // @ts-ignore
        if (c.specifier) {
          // @ts-ignore
          composedFiles.push(resolve(dirname(fullpath), c.specifier));
        }
      });
    });

    const { code, map: sourcemap, exports } = r;

    let originCss = code ? code.toString('utf8') : '';

    if (opt?.forceInlineImages) {
      const { outputFiles } = this.build.esbuild.buildSync({
        stdin: {
          contents: originCss,
          resolveDir: dirname(fullpath),
          loader: 'css'
        },
        format: 'esm',
        sourcemap: false,
        minify: false,
        target: 'esnext',
        write: false,
        bundle: true,
        loader: {
          '.png': 'dataurl',
          '.jpg': 'dataurl',
          '.jpeg': 'dataurl',
          '.webp': 'dataurl',
          '.bmp': 'dataurl',
          '.gif': 'dataurl',
          '.apng': 'dataurl',
          '.avif': 'dataurl',
          '.svg': 'dataurl',
          '.ico': 'dataurl',
          '.cur': 'dataurl',
          '.tif': 'dataurl',
          '.tiff': 'dataurl'
        }
      });
      originCss = outputFiles[0].text;
    }

    const css =
      originCss +
      (sourcemap
        ? `\n/*# sourceMappingURL=data:application/json;base64,${sourcemap.toString('base64')} */`
        : '');
    const { js, dts } = this.genModulesJs(exports, fullpath, !!opt?.emitDeclarationFile);
    /** @type {{css: string; js: string; dts?: string; composedFiles: string[]}} */
    const result = {
      css,
      composedFiles,
      js,
      dts
    };
    this.__result_cache__.set(fullpath, result);
    return result;
  }

  dispose() {
    this.__result_cache__.clear();
    CSSTransformer.__instances__.delete(this.build);
  }
}
