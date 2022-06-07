# esbuild-css-modules-plugin

[![npm version](https://img.shields.io/npm/v/esbuild-css-modules-plugin.svg?style=flat)](https://www.npmjs.com/package/esbuild-css-modules-plugin)
[![Test](https://github.com/indooorsman/esbuild-css-modules-plugin/actions/workflows/test.yml/badge.svg)](https://github.com/indooorsman/esbuild-css-modules-plugin/actions/workflows/test.yml)

A esbuild plugin to bundle css modules into js(x)/ts(x).

Works both with `bundle: false` and `bundle: true`.

If build with `bundle: false`, `xxx.modules.css` will be transformed to `xxx.modules.css.js`.

See [`./test/test.js`](https://github.com/indooorsman/esbuild-css-modules-plugin/blob/master/test/test.js) for examples.

## Install

```shell
npm i -D esbuild-css-modules-plugin
```

or

```shell
yarn add -D esbuild-css-modules-plugin
```

## Usage

````js
const esbuild = require('esbuild');
const cssModulesPlugin = require('esbuild-css-modules-plugin');

esbuild.build({
  plugins: [
    cssModulesPlugin({
      // optional. set to false to not inject generated css into page;
      // default value is false when set `v2` to `true`, otherwise default is true,
      // if set to `true`, the generated css will be injected into `head`;
      // could be a string of css selector of the element to inject into,
      // e.g.
      // ```
      // inject: '#some-element-id' // the plugin will try to get `shadowRoot` of the found element, and append css to the `shadowRoot`, if no shadowRoot then append to the found element, if no element found then append to document.head
      // ```
      // could be a function with params content & digest (return a string of js code to inject to page),
      // e.g.
      // ```
      // inject: (cssContent, digest) => `console.log("${cssContent}", "${digest}")`
      // ```
      inject: false,

      localsConvention: 'camelCaseOnly', // optional. value could be one of 'camelCaseOnly', 'camelCase', 'dashes', 'dashesOnly', default is 'camelCaseOnly'

      generateScopedName: (name, filename, css) => string, // optional. refer to: https://github.com/madyankin/postcss-modules#generating-scoped-names

      cssModulesOption: {
        // optional, refer to: https://github.com/madyankin/postcss-modules/blob/d7cefc427c43bf35f7ebc55e7bda33b4689baf5a/index.d.ts#L27
        // this option will override others passed to postcss-modules
      },

      v2: true // experimental. v2 can bundle images in css, note if set `v2` to true, other options except `inject` will be ignored. and v2 only works with `bundle: true`.
      v2CssModulesOption: { // Optional.
        dashedIndents: boolean; // Optional. refer to: https://github.com/parcel-bundler/parcel-css/releases/tag/v1.9.0
        /**
         * Optional. The currently supported segments are:
         * [name] - the base name of the CSS file, without the extension
         * [hash] - a hash of the full file path
         * [local] - the original class name
         */
        pattern: string;
      }
    })
  ]
});
````
