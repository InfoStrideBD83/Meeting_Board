import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { CallProvider } from './context/CallContext.jsx';
import { App } from './App.jsx';
import { InstallGate } from './components/InstallGate.jsx';
import { registerServiceWorker } from './push.js';
import './styles/theme.css';

registerServiceWorker();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <InstallGate>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <CallProvider>
              <App />
            </CallProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </InstallGate>
  </StrictMode>
);
