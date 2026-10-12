import '@fontsource/coming-soon/400.css';
import '@fontsource/bangers/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

import { loadFonts } from './fonts';

loadFonts().finally(() => createRoot(document.getElementById('root')!).render(<App />));
