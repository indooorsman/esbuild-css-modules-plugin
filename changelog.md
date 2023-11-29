## V3.1.0
- fix [issue#61](https://github.com/indooorsman/esbuild-css-modules-plugin/issues/61)
- fix [issue#59](https://github.com/indooorsman/esbuild-css-modules-plugin/issues/59)
- do not modify user's configuration, throw warning if configuration is no valid for css modules plugin
- support more options of `lightningcss`, see [index.d.ts](https://github.com/indooorsman/esbuild-css-modules-plugin/blob/main/index.d.ts) for details

## V3.0.3
- Fix sourcemap

## V3.0.2
- Do not emit .d.ts for files outside of build root

## V3.0.1
- add ability to custom ts declaration file outdir

## V3.0.0
This version has some breaking changes:
- drop postcss-module, as a result most of postcss-module configurations are removed as well
- remove `v2` feature flag

Other changes:
- full support of `compose`
- code refactor
- export both `commonjs` & `es` module

## V2.7.1
- support esbuild@^0.17

## V2.7.0
- fix inject logic to avoid styles missing in some micro-frontend framework
- ***Important***: there's a breaking change of inject logic, before this version the inject method would be deleted once it's called, from this verson it will ***not*** be deleted anymore, for people using custom inject method please pay attention.

## V2.6.3
- upgrade dependencies
- fix #45 #46, thanks to @markdalgleish

## V2.6.0
- `@parcel/css` now named `lightningcss`
- support pascal case by @FuriouZz [#43](https://github.com/indooorsman/esbuild-css-modules-plugin/pull/43)

## V2.5.0

- upgrade `@parcel/css` to `1.12.0`
- validate class name, js keywords are considered to be invalid, e.g. `.default { } .const { }` will throw error during building

## V2.4.0

- Add filter option: Regular expression used to match CSS module files by @christianvuerings in #40

## V2.3.1

- Fix [issue#33](https://github.com/indooorsman/esbuild-css-modules-plugin/issues/33)

## V2.3.0

- **V2**: upgrade `@parcel/css` to `1.9.0`
- **V2**: add a new option `v2CssModulesOption`, refer to <https://github.com/parcel-bundler/parcel-css/releases/tag/v1.9.0>

## V2.2.16

> commit: [6d0cc68](https://github.com/indooorsman/esbuild-css-modules-plugin/commit/6d0cc68ba51ed0f31d37894c4e3afec203b44d3d)

- **V2**: pass relative path to `@parcel/css` as filename to keep hash stable in different machines

## V2.2.13

- **[v2]** [bugfix] exports of entry js are lost with auto inject

## V2.2.12

- **[v2]** only use cache in watch mode
- **[v2]** refine inject logic
- **[v2]** add example of custom inject to tests

## V2.2.11

- replace `process.memoryUsage.rss()` to `process.memoryUsage().rss` to support Nodejs<15.6.0

## V2.2.10

- **[v2]** refine cache logic
- **[v2]** replace fs sync methods with promises

## V2.2.8

- **[v2]** refine some logs
- **[v2]** make hash of outputs stable
- **[v2]** support `entryPoints` as object

## V2.2.6

- **[v2]** refine some logs
- **[v2]** handle `onResolve` for `.modules.css` files to add `sideEffects: true` & `namespace` to the resolve result
- **[v2]** better support `watch` mode

## V2.2.5

- refactor a lot, **v2** will not generate temporary folders/files anymore
- **v2** now support auto inject generated css into page
- inject for and only for **v2** can be set to a css selector of the element which you want to inject css to, if the element can't be found then inject to document.head

## V2.1.4:

- [v2] add filename as class prefix, e.g.: `.some-class` in `some.module.css` will be transformed to `.some-module__some-class-[hash]`

## V2.1.3:

- support `@import url(./xxx/xxx.css)` in v2 (path can't be remote url)
- upgrade `@parcel/css` to `1.3.1`
