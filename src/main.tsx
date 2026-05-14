import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

// Polyfill Promise.withResolvers for pdfjs-dist compatibility in older browsers/iOS
if (typeof Promise.withResolvers === 'undefined') {
  // @ts-ignore
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Polyfill Object.groupBy for pdfjs-dist
if (typeof Object.groupBy === 'undefined') {
  // @ts-ignore
  Object.groupBy = function(iterable, cb) {
    const obj = Object.create(null);
    for (const item of iterable) {
      const key = cb(item);
      if (!obj[key]) obj[key] = [];
      obj[key].push(item);
    }
    return obj;
  };
}

import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
