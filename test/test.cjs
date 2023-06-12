const CssModulesPlugin = require('../index.cjs');
const esbuild = require('esbuild');

esbuild.build({
  entryPoints: [
    'app.jsx',
    // 'components/hello.world.jsx',
    // 'styles/app.modules.css',
    // 'styles/deep/styles/hello.modules.css'
  ],
  entryNames: '[dir]/[name]',
  assetNames: '[dir]/[name]',
  format: 'esm',
  target: ['esnext'],
  bundle: true,
  external: ['react', 'react-dom'],
  minify: false,
  sourcemap: false,
  publicPath: 'https://my.cdn/static/',
  outdir: './dist/bundle-v3',
  write: true,
  loader: {
    '.jpg': 'file'
  },
  logLevel: 'debug',
  plugins: [
    CssModulesPlugin({
      inject: false
    })
  ]
})
