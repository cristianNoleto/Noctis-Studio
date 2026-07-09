import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { I18nProvider } from './i18n'
import { AuthProvider } from './auth/AuthContext'
import App from './App'
import './index.css'

// Restaura tema e modo privado antes do primeiro paint
document.documentElement.dataset.theme = localStorage.getItem('noctis_theme') || 'dark'
document.documentElement.dataset.privacy = localStorage.getItem('noctis_privacy') || '0'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
)
