import { bundle as bundleModulesCss } from 'lightningcss';
import { relative } from 'node:path';
import {
  contentPlaceholder,
  digestPlaceholder,
  emptySourceMap,
  pluginCssNamespace,
  validateNamedExport
} from './utils.js';
import { camelCase, sortBy, uniq, uniqBy, upperFirst } from 'lodash-es';
import { injectorVirtualPath, pluginJsNamespace } from './utils.js';

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

  async dispose() {
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
    /** @type {Map<string, {css: string; js: string;}>} */
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
   * @returns {string}
   */
  genModulesJs(exports, fullpath) {
    const { options, buildRoot } = this.build.context;

    const relativePath = relative(buildRoot, fullpath);
    const supportNamedExports = options.namedExports ?? false;
    const isEsbuildBundleMode = this.build.initialOptions.bundle ?? false;

    /** @type {string[]} */
    const jsLines = isEsbuildBundleMode ? [`import "${pluginCssNamespace}:${relativePath}";`] : [];

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
      const injectorCode = CSSInjector.getInstance(this.build)?.genImportCode(relativePath) ?? '';

      jsLines.push(`
${injectorCode}
export default new Proxy({
${uniqBy([...jsNames, ...originNames], '0')
  .map(([o, l]) => `  "${o}": ${l}`)
  .join(',\n')}
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
${uniqBy([...jsNames, ...originNames], '0')
  .map(([o, l]) => `  "${o}": ${l}`)
  .join(',\n')}
};
      `);
    }

    // https://github.com/evanw/esbuild/issues/1227
    jsLines.push(`//${emptySourceMap}`);

    const jsContents = jsLines.join('\n');

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
    } = bundleModulesCss({
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
    });

    const originCss = code ? code.toString('utf8') : '';
    const css =
      originCss +
      (sourcemap
        ? `\n/*# sourceMappingURL=data:application/json;base64,${sourcemap.toString('base64')} */`
        : '');
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
    CSSTransformer.__instances__.delete(this.build);
  }
}
