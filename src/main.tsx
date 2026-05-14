import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

// Polyfill Promise.withResolvers for pdfjs-dist compatibility in older browsers/iOS
if (typeof (Promise as any).withResolvers === 'undefined') {
  (Promise as any).withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Polyfill Object.groupBy for pdfjs-dist
if (typeof (Object as any).groupBy === 'undefined') {
  (Object as any).groupBy = function(iterable: any, cb: any) {
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
