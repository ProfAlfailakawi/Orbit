import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './app.css';

createRoot(document.getElementById('root')!).render(<App />);

// Hidden iPhone Duo diagnostics, only when ?duo-debug=1 is in the address (nothing is downloaded otherwise).
if (new URLSearchParams(window.location.search).get('duo-debug') === '1') {
  void import('./core/duoDebug.ts').then(m => m.mountDuoDebug());
}
