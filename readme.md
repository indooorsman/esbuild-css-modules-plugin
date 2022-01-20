# esbuild-css-modules-plugin

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

```js
const esbuild = require('esbuild');
const cssModulesPlugin = require('esbuild-css-modules-plugin');

esbuild.build({
  plugins: [
    cssModulesPlugin({
      // optional. set to false to not inject generated CSS into <head>, default is true. 
      // could be a function with params content & digest (return a string of js code to inject to page), 
      // e.g.
      // ```
      // inject: (cssContent, digest) => `console.log("${cssContent}", "${digest}")`
      // ```
      inject: false,

      localsConvention: 'camelCaseOnly', // optional. value could be one of 'camelCaseOnly', 'camelCase', 'dashes', 'dashesOnly', default is 'camelCaseOnly'
      
      generateScopedName: (name, filename, css) => string, // optional. 

      v2: true, // experimental. v2 can bundle images in css, note if set `v2` to true, all other options will be ignored. and v2 only works with `bundle: true`.

      // optional. If omitted uses the default behavior.
      // This is used to override the resolved path for modules imported inside of
      // other modules (I.E. using `from` or `value`). This is expected to be a
      // function that receives a `file` string representing the full file path
      // and returns a string representing the modified file path.
      resolve(file) {
        return path.resolve(process.cwd(), 'src/styles', file);
      }
    })
  ]
});
```
