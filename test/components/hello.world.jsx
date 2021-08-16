import React from 'react';
import styles, * as appCssModules from '../styles/app.modules.css';

export const HelloWorld = () => <>
  <h3 className={styles.helloWorld}>Hello World!</h3>
  {
    appCssModules.digest && <pre><code>${appCssModules.digest}</code></pre>
  }
  {
    appCssModules.css && <pre><code>${appCssModules.css}</code></pre>
  }
</>
