const esbuild = require('esbuild');
const cssModulesPlugin = require('../index.js');
const fse = require('fs-extra');
fse.emptyDirSync('./dist');

(async () => {
  await esbuild.build({
    entryPoints: ['app.jsx'],
    format: 'esm',
    target: ['es2020'],
    bundle: true,
    minify: false,
    sourcemap: true,
    external: ['react', 'react-dom'],
    outdir: './dist/bundle-default',
    write: true,
    plugins: [cssModulesPlugin()],
    logLevel: 'debug',
    loader: {
      '.jpg': 'file'
    }
  });
  console.log('[test][esbuild:bundle-default] done, please check `test/dist/bundle-default`', '\n');

  await esbuild.build({
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
        inject: false,
        cssModulesOption: {
          generateScopedName: '[path][name]__[local]___[hash:base64:8]'
        }
      })
    ],
    logLevel: 'debug',
    loader: {
      '.jpg': 'file'
    }
  });
  console.log(
    '[test][esbuild:bundle-no-inject] done, please check `test/dist/bundle-no-inject`',
    '\n'
  );

  await esbuild.build({
    entryPoints: [
      './styles/app.modules.css',
      './styles/deep/styles/hello.modules.css',
      'app.jsx',
      './components/hello.world.jsx'
    ],
    format: 'esm',
    target: ['es2020'],
    bundle: false,
    minify: false,
    sourcemap: false,
    outdir: './dist/no-bundle',
    write: true,
    plugins: [cssModulesPlugin()],
    logLevel: 'debug',
    loader: {
      '.jpg': 'file'
    }
  });
  console.log('[test][esbuild:no-bundle] done, please check `test/dist/no-bundle`', '\n');

  await esbuild.build({
    entryPoints: {
      ['custom-entry-name']: 'app.jsx'
    },
    entryNames: '[name]-[hash]',
    format: 'esm',
    target: ['es2020'],
    bundle: true,
    minify: false,
    sourcemap: true,
    publicPath: 'https://my.domain/static/',
    external: ['react', 'react-dom'],
    outdir: './dist/bundle-v2-inject',
    write: true,
    loader: {
      '.jpg': 'file'
    },
    plugins: [cssModulesPlugin({ 
      v2: true,
      inject: '#my-custom-element-with-shadow-dom' 
    })],
    logLevel: 'debug'
  });
  console.log('[test][esbuild:bundle:v2] done, please check `test/dist/bundle-v2-inject`', '\n');

  await esbuild.build({
    entryPoints: ['app.jsx'],
    entryNames: '[name]-[hash]',
    format: 'esm',
    target: ['es2020'],
    bundle: true,
    minify: false,
    sourcemap: true,
    publicPath: 'https://my.domain/static/',
    external: ['react', 'react-dom'],
    outdir: './dist/bundle-v2-no-inject',
    write: true,
    loader: {
      '.jpg': 'file'
    },
    plugins: [cssModulesPlugin({ 
      v2: true,
      inject: false
    })],
    logLevel: 'debug'
  });
  console.log('[test][esbuild:bundle:v2] done, please check `test/dist/bundle-v2-no-inject`', '\n');
})();
