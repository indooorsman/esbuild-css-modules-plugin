import React from 'react';
import ReactDom from 'react-dom';
import klass from './styles/app.modules.css';
import klass2 from './styles/app-filter.css';

import { HelloWorld } from './components/hello.world';

const App = () => {
  return (
    <div className={`${klass.helloWorld} ${klass2.helloWorld}`}>
      <HelloWorld />
    </div>
  );
};

ReactDom.render(<App />, document.body);
