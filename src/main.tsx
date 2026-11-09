import { createRoot } from 'react-dom/client';
import '@fontsource/sora/latin-500.css';
import '@fontsource/sora/latin-600.css';
import '@fontsource/sora/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import './ui/styles/global.css';
import App from './ui/App';

createRoot(document.getElementById('root')!).render(<App />);
