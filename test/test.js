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
    metafile: true,
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
    metafile: true,
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
    logLevel: 'debug',
    metafile: true
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
        namedExports: true,
        emitDeclarationFile: true
      })
    ],
    logLevel: 'debug',
    metafile: true
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
        emitDeclarationFile: {
          '.css.d.ts': './dist/no-bundle',
          '.d.css.ts': './generated-dts'
        },
        force: true,
        forceInlineImages: true,
        inject: '#my-styles-container'
      })
    ],
    logLevel: 'debug',
    metafile: true
  };

  await esbuild.build(buildOptions);
  console.log('[test][esbuild:no:bundle] done, please check `test/dist/no-bundle`', '\n');

  await esbuild.build({
    ...buildOptions,
    entryPoints: [
      './app.jsx',
      './components/hello.world.jsx'
    ],
    splitting: true,
    bundle: true,
    packages: 'external',
    outdir: './dist/bundle-splitting',
    loader: {
      '.jpg': 'file'
    },
    plugins: [
      cssModulesPlugin({
        inject: true
      })
    ],
    logLevel: 'debug',
    metafile: true
  });
  console.log('[test][esbuild:bundle:splitting] done, please check `test/dist/bundle-splitting`', '\n');

  // testing no metafile & write false
  const r = await esbuild.build({
    ...buildOptions,
    entryPoints: ['./app.jsx'],
    bundle: true,
    packages: 'external',
    metafile: false,
    write: false,
    loader: {
      '.jpg': 'file'
    },
    outdir: '__virtual_path__'
  });
  console.log('\nbuild result with metafile: false & write: false', r);
})();
