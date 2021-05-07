const esbuild = require('esbuild');
const cssModulesPlugin = require('../index.js');
const fse = require('fs-extra');
fse.emptyDirSync('./dist');

esbuild.build({
  entryPoints: ['app.jsx'],
  format: 'esm',
  target: ['es2020'],
  bundle: true,
  minify: false,
  sourcemap: true,
  external: ['react', 'react-dom'],
  outdir: './dist/bundle',
  write: true,
  plugins: [
    cssModulesPlugin()
  ],
  logLevel: 'info'
}).then((result) => {
  console.log('[test][esbuild:bundle] done, please check `test/dist/bundle`');
});

esbuild.build({
  entryPoints: ['./styles/app.modules.css', 'app.jsx', './components/hello.world.jsx'],
  format: 'esm',
  target: ['es2020'],
  bundle: false,
  minify: false,
  sourcemap: false,
  outdir: './dist/no-bundle',
  write: true,
  plugins: [
    cssModulesPlugin()
  ],
  logLevel: 'info'
}).then((result) => {
  console.log('[test][esbuild:no-bundle] done, please check `test/dist/no-bundle`');
});

esbuild.build({
  entryPoints: ['app.jsx'],
  format: 'esm',
  target: ['es2020'],
  bundle: true,
  minify: false,
  sourcemap: true,
  external: ['react', 'react-dom'],
  outdir: './dist/bundle-no-inject',
  write: true,
  plugins: [
    cssModulesPlugin({
      inject: false
    })
  ]
}).then((result) => {
  console.log('[test][esbuild:bundle-no-inject] done, please check `test/dist/bundle-no-inject`');
});
