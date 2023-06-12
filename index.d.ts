import type { Plugin, PluginBuild } from 'esbuild';

declare interface BuildOptions {
  /** force to build modules-css files even if `bundle` is disabled in esbuild, default is `false` */
  force?: boolean;
  /** inline images imported in css as data url even if `bundle` is false */
  forceInlineImages?: boolean;
  emitDeclarationFile?: boolean;
  inject?: boolean | string | ((css: string, digest: string) => string);
  filter?: RegExp;
  /**
   * refer to: https://github.com/parcel-bundler/parcel-css/releases/tag/v1.9.0
   */
  dashedIndents?: boolean;
  /**
   * The currently supported segments are:
   * [name] - the base name of the CSS file, without the extension
   * [hash] - a hash of the full file path
   * [local] - the original class name
   */
  pattern?: string;
  /**
   * localsConvention
   * default is `camelCaseOnly`
   * **cameCase** : `.some-class-name` ==> `someClassName`, the original class name will not to be removed from the locals
   * **camelCaseOnly**: `.some-class-name` ==> `someClassName`, the original class name will be removed from the locals
   * **pascalCase** : `.some-class-name` ==> `SomeClassName`, the original class name will not to be removed from the locals
   * **pascalCaseOnly**: `.some-class-name` ==> `SomeClassName`, the original class name will be removed from the locals
   */
  localsConvention?: 'camelCase' | 'pascalCase' | 'camelCaseOnly' | 'pascalCaseOnly';
  /**
   * namedExports
   * @default false
   * @description
   * e.g.:
   * ```
   * export const someClassName = '.some-class-name__hauajsk';
   * ```
   * Notes:
   * - `someClassName` can not be a js key word like `const`, `var` & etc.
   * - cannot be used with `inject`
   */
  namedExports?: boolean;
  package?: {
    name: string;
    main?: string;
    module?: string;
    version: string;
  };
}

declare function CssModulesPlugin(options?: BuildOptions): Plugin;

declare namespace CssModulesPlugin {
  export interface Options extends BuildOptions {};
  
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

  export type setup = (build: PluginBuild, options: Options) => void;

  export interface Build extends PluginBuild {
    context: BuildContext;
  }
}

export = CssModulesPlugin;
