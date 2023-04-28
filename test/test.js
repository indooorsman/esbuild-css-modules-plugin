import esbuild from 'esbuild';
import cssModulesPlugin from '../index.js';

(async () => {
  // await esbuild.build({
  //   entryPoints: {
  //     ['custom-entry-name']: 'app.jsx',
  //     ['named-exports']: 'named-exports.jsx'
  //   },
  //   entryNames: '[name]-[hash]',
  //   format: 'esm',
  //   target: ['esnext'],
  //   bundle: true,
  //   minify: false,
  //   sourcemap: true,
  //   publicPath: 'https://my.domain/static/',
  //   external: ['react', 'react-dom'],
  //   outdir: './dist/bundle-v2-inject',
  //   write: true,
  //   loader: {
  //     '.jpg': 'file'
  //   },
  //   plugins: [cssModulesPlugin({
  //     inject: '#my-custom-element-with-shadow-dom',
  //     generateTsFile: true
  //   })],
  //   logLevel: 'debug'
  // });
  // console.log('[test][esbuild:bundle:v2] done, please check `test/dist/bundle-v2-inject`', '\n');

  // await esbuild.build({
  //   entryPoints: {
  //     ['custom-entry-name']: 'app.jsx',
  //     ['named-exports']: 'named-exports.jsx'
  //   },
  //   entryNames: '[name]-[hash]',
  //   format: 'esm',
  //   target: ['esnext'],
  //   bundle: true,
  //   minify: false,
  //   sourcemap: 'external',
  //   publicPath: 'https://my.domain/static/',
  //   external: ['react', 'react-dom'],
  //   outdir: './dist/bundle-v2-custom-inject',
  //   write: true,
  //   loader: {
  //     '.jpg': 'dataurl'
  //   },
  //   plugins: [cssModulesPlugin({
  //     inject: (css, digest) => {
  //       return `
  //         const styleId = 'style_${digest}';
  //         if (!document.getElementById(styleId)) {
  //           const styleEle = document.createElement('style');
  //           styleEle.id = styleId;
  //           styleEle.textContent = \`${css.replace(/\n/g, '')}\`;
  //           document.head.appendChild(styleEle);
  //         }
  //       `
  //     }
  //   })],
  //   logLevel: 'debug'
  // });
  // console.log('[test][esbuild:bundle:v2] done, please check `test/dist/bundle-v2-custom-inject`', '\n');

  // await esbuild.build({
  //   entryPoints: ['app.jsx', 'named-exports.jsx'],
  //   entryNames: '[name]-[hash]',
  //   format: 'esm',
  //   target: ['esnext'],
  //   bundle: true,
  //   minify: false,
  //   sourcemap: false,
  //   publicPath: 'https://my.domain/static/',
  //   external: ['react', 'react-dom'],
  //   outdir: './dist/bundle-v2-no-inject',
  //   write: true,
  //   loader: {
  //     '.jpg': 'file'
  //   },
  //   plugins: [
  //     cssModulesPlugin({
  //       inject: false
  //     })
  //   ],
  //   logLevel: 'debug'
  // });
  // console.log('[test][esbuild:bundle:v2] done, please check `test/dist/bundle-v2-no-inject`', '\n');

  await esbuild.build({
    entryPoints: ['app.jsx'],
    entryNames: '[name]-[hash]',
    format: 'esm',
    target: ['esnext'],
    bundle: true,
    external: ['react', 'react-dom'],
    minify: false,
    sourcemap: true,
    publicPath: 'https://my.domain/static/',
    outdir: './dist/bundle-v3',
    write: true,
    loader: {
      '.jpg': 'file'
    },
    plugins: [
      cssModulesPlugin({
        // inject: (css, digest) => {
        //   return `console.log("${css}", "${digest}");`
        // },
        inject: '#my-styles-container'
      })
    ],
    logLevel: 'debug'
  });
  console.log('[test][esbuild:bundle:v3] done, please check `test/dist/bundle-v3`', '\n');
})();
