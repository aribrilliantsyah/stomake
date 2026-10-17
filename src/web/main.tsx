import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

import { loadFonts } from './fonts';
import { applyTheme, readThemePref } from './state/theme';

if (!location.pathname.startsWith('/print/')) applyTheme(readThemePref());

// an OS file dropped outside a drop zone must not navigate the app to that file (loses the editor);
// only file drags: in-app drags keep their own "no drop here" feedback
for (const type of ['dragover', 'drop'] as const)
  window.addEventListener(type, (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  });

loadFonts().finally(() => createRoot(document.getElementById('root')!).render(<App />));
