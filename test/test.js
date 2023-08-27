import esbuild from 'esbuild';
import cssModulesPlugin from '../index.js';

(async () => {
  await esbuild.build({
    entryPoints: ['app.jsx'],
    entryNames: '[name]-[hash]',
    format: 'esm',
    target: ['esnext'],
    bundle: true,
    minify: false,
    publicPath: 'https://my.domain/static/',
    external: ['react', 'react-dom'],
    outdir: './dist/bundle-inject',
    write: true,
    loader: {
      '.jpg': 'file'
    },
    plugins: [
      cssModulesPlugin({
        inject: '#my-custom-element-with-shadow-dom',
        emitDeclarationFile: true
      })
    ],
    logLevel: 'debug'
  });
  console.log('[test][esbuild:bundle:inject] done, please check `test/dist/bundle-inject`', '\n');

  await esbuild.build({
    entryPoints: {
      ['custom-entry-name']: 'app.jsx'
    },
    entryNames: '[name]-[hash]',
    format: 'esm',
    target: ['esnext'],
    bundle: true,
    minify: false,
    publicPath: 'https://my.domain/static/',
    external: ['react', 'react-dom'],
    outdir: './dist/bundle-custom-inject',
    write: true,
    loader: {
      '.jpg': 'dataurl'
    },
    plugins: [
      cssModulesPlugin({
        inject: (css, digest) => {
          return `
          const styleId = 'style-' + ${digest};
          if (!document.getElementById(styleId)) {
            const styleEle = document.createElement('style');
            styleEle.id = styleId;
            styleEle.textContent = ${css};
            document.head.appendChild(styleEle);
          }
        `;
        }
      })
    ],
    logLevel: 'debug'
  });
  console.log(
    '[test][esbuild:bundle:custom:inject] done, please check `test/dist/bundle-custom-inject`',
    '\n'
  );

  await esbuild.build({
    entryPoints: ['filter.jsx'],
    entryNames: '[name]-[hash]',
    format: 'esm',
    target: ['esnext'],
    bundle: true,
    minify: false,
    sourcemap: false,
    publicPath: 'https://my.domain/static/',
    packages: 'external',
    outdir: './dist/bundle-custom-filter',
    write: true,
    loader: {
      '.jpg': 'file'
    },
    plugins: [
      cssModulesPlugin({
        inject: false,
        namedExports: true,
        filter: /\.css$/i
      })
    ],
    logLevel: 'debug'
  });
  console.log('[test][esbuild:bundle:custom:filter] done, please check `test/dist/bundle-custom-filter`', '\n');

  await esbuild.build({
    entryPoints: ['app.jsx'],
    entryNames: '[name]-[hash]',
    format: 'esm',
    target: ['esnext'],
    bundle: true,
    minify: false,
    sourcemap: false,
    publicPath: 'https://my.domain/static/',
    external: ['react', 'react-dom'],
    outdir: './dist/bundle-no-inject',
    write: true,
    loader: {
      '.jpg': 'file'
    },
    plugins: [
      cssModulesPlugin({
        inject: false,
        namedExports: true
      })
    ],
    logLevel: 'debug'
  });
  console.log('[test][esbuild:bundle:no:inject] done, please check `test/dist/bundle-no-inject`', '\n');

  /** @type {import('esbuild').BuildOptions} */
  const buildOptions = {
    entryPoints: [
      './app.jsx',
      './components/hello.world.jsx',
      './styles/**/*.modules.css',
    ],
    entryNames: '[dir]/[name]',
    assetNames: '[dir]/[name]',
    format: 'esm',
    target: ['esnext'],
    bundle: false,
    minify: false,
    sourcemap: false,
    outdir: './dist/no-bundle',
    write: true,
    plugins: [
      cssModulesPlugin({
        emitDeclarationFile: true,
        force: true,
        forceInlineImages: true,
        inject: '#my-styles-container'
      })
    ],
    logLevel: 'debug'
  };

  await esbuild.build(buildOptions);
  console.log('[test][esbuild:no:bundle] done, please check `test/dist/no-bundle`', '\n');
})();
