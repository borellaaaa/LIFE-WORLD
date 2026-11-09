import { createRoot } from 'react-dom/client';
import '@fontsource/sora/500.css';
import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './ui/styles/global.css';
import App from './ui/App';

createRoot(document.getElementById('root')!).render(<App />);
