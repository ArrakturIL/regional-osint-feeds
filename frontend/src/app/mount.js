import { D, h } from './runtime.js';
import { App } from './App.js';
import { ErrorBoundary } from '../components/ErrorBoundary/ErrorBoundary.js';
const root = document.getElementById('root');
D.createRoot(root).render(h(ErrorBoundary, { level: 'app' }, h(App)));
