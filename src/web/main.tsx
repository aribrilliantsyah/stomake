import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

import { loadFonts } from './fonts';

loadFonts().finally(() => createRoot(document.getElementById('root')!).render(<App />));
