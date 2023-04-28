import React from 'react';
import styles from '../styles/app.modules.css';
import styles2 from '../styles/deep/styles/hello.modules.css'

export const HelloWorld = () => (
  <>
    <h3 className={styles.helloWorld}>Hello World!</h3>
    <p className={styles2.helloText}>hi...</p>
    <p className={styles.var}>...</p>
  </>
);
