# esbuild-css-modules-plugin

[![npm version](https://img.shields.io/npm/v/esbuild-css-modules-plugin/v3-dev)](https://www.npmjs.com/package/esbuild-css-modules-plugin/v/v3-dev)
[![Test](https://github.com/indooorsman/esbuild-css-modules-plugin/actions/workflows/test.yml/badge.svg)](https://github.com/indooorsman/esbuild-css-modules-plugin/actions/workflows/test.yml)

A esbuild plugin to bundle css modules into js(x)/ts(x).

Works both with `bundle: false` and `bundle: true`.

If build with `bundle: false`, `xxx.modules.css` will be transformed to `xxx.modules.js`.

See [`./test/test.js`](https://github.com/indooorsman/esbuild-css-modules-plugin/blob/v3/test/test.js) for examples.

## Install

```shell
npm i -D esbuild-css-modules-plugin@v3-dev
```

or

```shell
yarn add -D esbuild-css-modules-plugin@v3-dev
```

## Usage

```js
import esbuild from 'esbuild';
import CssModulesPlugin from 'esbuild-css-modules-plugin';

esbuild.build({
  plugins: [
    CssModulesPlugin({
      /** optional, force to build modules-css files even if `bundle` is disabled in esbuild. default is `false` */
      force: false,
      /** optional, inline images imported in css as data url even if `bundle` is false. default is `false` */
      forceInlineImages: false,
      /** optional, generate declaration file for css file. default is `false` */
      emitDeclarationFile: false,
      /**
       * optional
       * @see https://lightningcss.dev/css-modules.html#local-css-variables
       */
      dashedIndents: false,
      /**
       * optional, pattern of class names
       * The currently supported segments are:
       * [name] - the base name of the CSS file, without the extension
       * [hash] - a hash of the full file path
       * [local] - the original class name
       * @see https://lightningcss.dev/css-modules.html#custom-naming-patterns
       */
      pattern: '[name]_[local]_[hash]',
      /**
       * optional, localsConvention
       * default is `camelCaseOnly`
       * **cameCase** : `.some-class-name` ==> `someClassName`, the original class name will not to be removed from the locals
       * **camelCaseOnly**: `.some-class-name` ==> `someClassName`, the original class name will be removed from the locals
       * **pascalCase** : `.some-class-name` ==> `SomeClassName`, the original class name will not to be removed from the locals
       * **pascalCaseOnly**: `.some-class-name` ==> `SomeClassName`, the original class name will be removed from the locals
       */
      localsConvention: 'camelCase' | 'pascalCase' | 'camelCaseOnly' | 'pascalCaseOnly',
      /**
       * optional, enable named exports
       * @default false
       * @description
       * e.g.:
       * ```
       * export const someClassName = '.some-class-name__hauajsk';
       * ```
       * Notes:
       * - `someClassName` can **NOT** be a js key word like `const`, `var` & etc.
       * - can **NOT** be used with `inject`
       */
      namedExports: false,
      // optional, package info
      package: {
        name: 'my-lib',
        main: 'index.cjs',
        module: 'index.js',
        version: '3.0.0'
      },
      /**
       * optional. set to false to not inject generated css into page;
       * if set to `true`, the generated css will be injected into `head`;
       * could be a string of css selector of the element to inject into,
       * e.g.
       *
       * ```
       * inject: '#some-element-id' // the plugin will try to get `shadowRoot` of the found element, and append css to the
       * `shadowRoot`, if no shadowRoot then append to the found element, if no element found then append to document.head
       *
       * ```
       *
       * could be a function with params content & digest (return a string of js code to inject css into page),
       * e.g.
       *
       * ```
       * inject: (content, digest) => `console.log(${content}, ${digest})`
       * ```
       */
      inject: false,

      /** Optional. Regex to filter certain CSS files. default is `/\.modules?\.css$/i` */
      filter: /\.modules?\.css$/i
    })
  ]
});
```
