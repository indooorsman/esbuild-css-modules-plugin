import React from 'react';
import styles, * as appCssModules from '../styles/app.modules.css';

export const HelloWorld = () => (
  <>
    <h3 className={styles.helloWorld}>Hello World!</h3>
    <p className={styles.helloText}>hi...</p>
    <pre>
      <code>${appCssModules?.digest ?? '// n/a'}</code>
    </pre>
    <pre>
      <code>${appCssModules?.css ?? '// n/a'}</code>
    </pre>
  </>
);
