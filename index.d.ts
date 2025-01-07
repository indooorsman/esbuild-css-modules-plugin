import type { Plugin, PluginBuild } from 'esbuild';
import type {
  BundleOptions,
  CustomAtRules,
  TransformOptions,
} from 'lightningcss';

declare type EmitDtsConfig = Partial<
  Record<'.d.css.ts' | '.css.d.ts' | '*', string>
>;

declare interface BuildOptions
  extends Partial<
    Pick<
      BundleOptions<CustomAtRules>,
      | 'targets'
      | 'drafts'
      | 'nonStandard'
      | 'pseudoClasses'
      | 'errorRecovery'
      | 'visitor'
      | 'customAtRules'
    >
  > {
  /**
   * force to build css modules files even if `bundle` is disabled in esbuild
   * @default false
   */
  force?: boolean;
  /**
   * inline images imported in css as data url even if `bundle` is false
   * @default false
   */
  forceInlineImages?: boolean;
  /**
   * emit typescript declaration file for css modules class names
   * - `.css.d.ts` : emit `xxx.css.d.ts`
   * - `.d.css.ts` : emit `xxx.d.css.ts` (from typescript@5, see https://www.typescriptlang.org/tsconfig#allowArbitraryExtensions)
   * - `true` : emit both `xxx.css.d.ts` and `xxx.d.css.ts`
   * by default the dts files would be generated in `outdir` of esbuild config, if you want to custom outdir of these dts files:
   * ```js
   * {
   *   emitDeclarationFile: {
   *     '*': 'custom/path/for/all',
   *     '.css.d.ts': 'custom/path/for/*.css.d.ts',
   *     '.d.css.ts': 'custom/path/for/*.d.css.ts'
   *   }
   * }
   * ```
   * @default false
   */
  emitDeclarationFile?: boolean | '.d.css.ts' | '.css.d.ts' | EmitDtsConfig;
  /**
   * set to false to not inject generated css into page;
   * @description
   * if set to `true`, the generated css will be injected into `head`;
   * could be a string of css selector of the element to inject into,
   * e.g.
   *
   * ``` js
   * {
   *   inject: '#some-element-id'
   * }
   *
   * ```
   * the plugin will try to get `shadowRoot` of the found element, and append css to the
   * `shadowRoot`, if no shadowRoot then append to the found element, if no element found then append to `document.head`.
   *
   * could be a function with params content & digest (return a string of js code to inject css into page),
   * e.g.
   *
   * ```js
   * {
   *   inject: (content, digest) => `console.log(${content}, ${digest})`
   * }
   * ```
   * @default false
   */
  inject?: boolean | string | ((css: string, digest: string) => string);
  /**
   * Regex to filter certain CSS files.
   * @default /\.modules?\.css$/i
   */
  filter?: RegExp;
  /**
   * @see https://lightningcss.dev/css-modules.html#local-css-variables
   */
  dashedIndents?: boolean;
  /**
   * The currently supported segments are:
   * [name] - the base name of the CSS file, without the extension
   * [hash] - a hash of the full file path
   * [local] - the original class name
   * @see https://lightningcss.dev/css-modules.html#custom-naming-patterns
   */
  pattern?: string;
  /**
   * localsConvention
   * - **cameCase** : `.some-class-name` ==> `someClassName`, the original class name will not to be removed from the locals
   * - **camelCaseOnly**: `.some-class-name` ==> `someClassName`, the original class name will be removed from the locals
   * - **pascalCase** : `.some-class-name` ==> `SomeClassName`, the original class name will not to be removed from the locals
   * - **pascalCaseOnly**: `.some-class-name` ==> `SomeClassName`, the original class name will be removed from the locals
   * @default "camelCaseOnly"
   */
  localsConvention?:
    | 'camelCase'
    | 'pascalCase'
    | 'camelCaseOnly'
    | 'pascalCaseOnly';
  /**
   * Features that should always be compiled, even when supported by targets.
   * @see https://lightningcss.dev/transpilation.html#feature-flags
   */
  featuresInclude?: BundleOptions<CustomAtRules>['include'];
  /**
   * Features that should never be compiled, even when unsupported by targets.
   * @see https://lightningcss.dev/transpilation.html#feature-flags
   */
  featuresExclude?: BundleOptions<CustomAtRules>['exclude'];
  /**
   * namedExports
   * e.g.:
   * ```
   * export const someClassName = '.some-class-name__hauajsk';
   * ```
   * @default false
   * Notes:
   * - `someClassName` can not be a js key word like `const`, `var` & etc.
   * - cannot be used with `inject`
   */
  namedExports?: boolean;
  /**
   * optional package detail
   */
  package?: {
    name: string;
    main?: string;
    module?: string;
    version: string;
  };
}

declare function CssModulesPlugin(options?: BuildOptions): Plugin;

declare namespace CssModulesPlugin {
  export type EmitDts = EmitDtsConfig;

  export interface Options extends BuildOptions {}

  export interface BuildContext {
    options: Options;
    buildId: string;
    buildRoot: string;
    packageName: string;
    packageVersion: string;
    log: (...args: any[]) => void;
    relative: (to: string) => string;
    normalizedEntries: string[];
  }

  export declare const setup: (build: PluginBuild, options: Options) => void;

  export interface Build extends PluginBuild {
    context: BuildContext;
  }

  export default CssModulesPlugin;
}

export = CssModulesPlugin;
