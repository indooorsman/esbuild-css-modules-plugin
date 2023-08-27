# esbuild-css-modules-plugin

[![npm version](https://img.shields.io/npm/v/esbuild-css-modules-plugin)](https://www.npmjs.com/package/esbuild-css-modules-plugin)
[![Test](https://github.com/indooorsman/esbuild-css-modules-plugin/actions/workflows/test.yml/badge.svg)](https://github.com/indooorsman/esbuild-css-modules-plugin/actions/workflows/test.yml)

A esbuild plugin to bundle css modules into js(x)/ts(x).

Works both with `bundle: false` and `bundle: true`.

If build with `bundle: false`, `xxx.modules.css` will be transformed to `xxx.modules.css.js`.

See [`./test/test.js`](https://github.com/indooorsman/esbuild-css-modules-plugin/blob/main/test/test.js) for examples.

## Install

```shell
npm i -D esbuild-css-modules-plugin
```

or

```shell
yarn add -D esbuild-css-modules-plugin
```

## Usage

```js
import esbuild from 'esbuild';
import CssModulesPlugin from 'esbuild-css-modules-plugin';

esbuild.build({
  plugins: [
    CssModulesPlugin({
      // @see https://github.com/indooorsman/esbuild-css-modules-plugin/blob/main/index.d.ts for more details
      force: true,
      emitDeclarationFile: true,
      localsConvention: 'camelCaseOnly',
      namedExports: true,
      inject: false
    })
  ]
});
```
