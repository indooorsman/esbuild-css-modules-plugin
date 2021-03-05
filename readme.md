# esbuild-css-modules-plugin

A esbuild plugin to bundle css modules into js(x)/ts(x).

If build with `bundle: false`, `xxx.modules.css` will be transformed to `xxx.modules.css.js`.

See `./test/test.js` for examples.

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
const esbuild = require('esbuild');
const cssModulesPlugin = require('esbuild-css-modules-plugin');

esbuild.build({
  plugins: [
    cssModulesPlugin({
      localsConvention: 'camelCaseOnly', // optional. value could be one of 'camelCaseOnly', 'camelCase', 'dashes', 'dashesOnly', default is 'camelCaseOnly'
      generateScopedName: (name, filename, css) => string // optional. 
    })
  ]
});
```
