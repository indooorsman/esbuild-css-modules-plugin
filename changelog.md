## V2.2.10
- **[v2]** refine cache logic
- **[v2]** replace fs sync methods to promises

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