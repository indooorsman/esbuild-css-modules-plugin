import React from 'react';
import styles, { css, digest } from './app.modules.css';

export const HelloWorld = () => <>
  <h3 className={styles.helloWorld}>Hello World!</h3>
  <code>{digest}</code>
  <pre><code>{css}</code></pre>
</>
