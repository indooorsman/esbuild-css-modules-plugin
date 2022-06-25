import React from 'react';
import ReactDom from 'react-dom';

import { HelloWorld } from './components/named-exports.world';

const App = () => {
  return <HelloWorld/>;
};

ReactDom.render(<App/>, document.body);
