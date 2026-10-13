import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

import { loadFonts } from './fonts';
import { applyTheme, readThemePref } from './state/theme';

if (!location.pathname.startsWith('/print/')) applyTheme(readThemePref());

loadFonts().finally(() => createRoot(document.getElementById('root')!).render(<App />));
