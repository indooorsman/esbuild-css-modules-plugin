import React from 'react';
import ReactDom from 'react-dom';

import { HelloWorld } from './hello.world';

const App = () => {
  return <HelloWorld/>;
};

ReactDom.render(<App/>, document.body);
