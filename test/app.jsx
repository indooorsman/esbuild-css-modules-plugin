import React from 'react';
import ReactDom from 'react-dom';
import klass from './styles/app.modules.css';

import { HelloWorld } from './components/hello.world';

const App = () => {
  return (
    <div className={klass.helloWorld}>
      <HelloWorld />
    </div>
  );
};

ReactDom.render(<App />, document.body);
