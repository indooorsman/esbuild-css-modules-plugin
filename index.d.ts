import type { Plugin } from 'esbuild';

declare type GenerateScopedNameFunction = (name: string, filename: string, css: string) => string;

declare type LocalsConventionFunction = (
  originalClassName: string,
  generatedClassName: string,
  inputFile: string
) => string;

declare class Loader {
  constructor(root: string, plugins: Plugin[]);

  fetch(file: string, relativeTo: string, depTrace: string): Promise<{ [key: string]: string }>;

  finalSource?: string | undefined;
}

declare interface CssModulesOptions {
  getJSON?(cssFilename: string, json: { [name: string]: string }, outputFilename?: string): void;

  localsConvention?:
    | 'camelCase'
    | 'camelCaseOnly'
    | 'dashes'
    | 'dashesOnly'
    | LocalsConventionFunction;

  scopeBehaviour?: 'global' | 'local';
  globalModulePaths?: RegExp[];

  generateScopedName?: string | GenerateScopedNameFunction;

  hashPrefix?: string;
  exportGlobals?: boolean;
  root?: string;

  Loader?: typeof Loader;

  resolve?: (file: string) => string | Promise<string>;
}

declare interface PluginOptions {
  inject?: boolean | string | ((css: string, digest: string) => string);
  injectEvent?: string;
  localsConvention?: CssModulesOptions['localsConvention'];
  generateScopedName?: CssModulesOptions['generateScopedName'];
  cssModulesOption?: CssModulesOptions;
  v2?: boolean;
}

declare function CssModulesPlugin(options?: PluginOptions): Plugin;

declare namespace CssModulesPlugin {
  export type Options = PluginOptions;
}

export = CssModulesPlugin;
