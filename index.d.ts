import type { Plugin, PluginBuild } from 'esbuild';

export interface Options {
  inject?: boolean | string | ((css: string, digest: string) => string);
  filter?: RegExp;
  bundle?: boolean;
  generateTsFile?: boolean;
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
  root?: string;
  package?: {
    name: string;
    main?: string;
    module?: string;
    version: string;
  };
  usePascalCase?: boolean;
  /** since esbuild@0.17 has removed the `watch` option, you have to set it here explicitly */
  watch?: boolean;
}

interface BuildContext {
  buildId: string;
  buildRoot: string;
  packageRoot?: string;
  packageVersion?: string;
  log: (...args: any[]) => void;
  relative: (to: string) => string;
}

declare function CssModulesPlugin(options?: Options): Plugin;

export interface Build extends PluginBuild {
  context: BuildContext;
}

export default CssModulesPlugin;
