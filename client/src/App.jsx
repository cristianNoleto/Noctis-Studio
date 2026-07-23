import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import Layout from './components/layout/Layout'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import AcceptInvite from './pages/auth/AcceptInvite'
import Dashboard from './pages/Dashboard'
import ChannelsList from './pages/channels/ChannelsList'
import ChannelDetail from './pages/channels/ChannelDetail'
import IdeaBoard from './pages/IdeaBoard'
import References from './pages/References'
import Prompts from './pages/Prompts'
import Profile from './pages/Profile'
import NicheFinder from './pages/NicheFinder'
import ViralVideos from './pages/ViralVideos'
import RemovedChannels from './pages/RemovedChannels'
import NicheDoubling from './pages/NicheDoubling'
import MediaBank from './pages/MediaBank'
import Transcription from './pages/Transcription'
import TextTools from './pages/TextTools'
import Academy from './pages/Academy'
import Support from './pages/Support'
import Help from './pages/Help'
import Admin from './pages/Admin'
import MyPlan from './pages/MyPlan'
import Landing from './pages/Landing'
import PrivacyPolicy from './pages/legal/PrivacyPolicy'
import TermsOfService from './pages/legal/TermsOfService'
// Excalidraw é um pacote grande → carregado sob demanda (só nestas rotas).
const DrawingsGallery = lazy(() => import('./pages/excalidraw/DrawingsGallery'))
const DrawingEditor = lazy(() => import('./pages/excalidraw/DrawingEditor'))

function LazyFallback() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-500" />
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-950">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-500" />
    </div>
  )
}

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Raiz: visitante não logado vê a página inicial pública (explica o app, exigida
// pelo Google); usuário logado entra no app (Layout + Dashboard).
function RootRoute() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Landing />
  return <Layout />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/aceitar-convite" element={<AcceptInvite />} />
      {/* Páginas legais públicas (acessíveis sem login — exigidas p/ o Google) */}
      <Route path="/privacidade" element={<PrivacyPolicy />} />
      <Route path="/termos" element={<TermsOfService />} />
      {/* Raiz: landing pública (deslogado) ou Dashboard dentro do Layout (logado) */}
      <Route path="/" element={<RootRoute />}>
        <Route index element={<Dashboard />} />
      </Route>
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/canais" element={<ChannelsList />} />
        <Route path="/canais/:id" element={<ChannelDetail />} />
        <Route path="/quadro-ideias" element={<IdeaBoard />} />
        <Route path="/desenhos" element={<Suspense fallback={<LazyFallback />}><DrawingsGallery /></Suspense>} />
        <Route path="/referencias" element={<References />} />
        <Route path="/prompts" element={<Prompts />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/niche-finder" element={<NicheFinder />} />
        <Route path="/videos-virais" element={<ViralVideos />} />
        <Route path="/canais-removidos" element={<RemovedChannels />} />
        <Route path="/dobra-de-nicho" element={<NicheDoubling />} />
        <Route path="/videos-imagens" element={<MediaBank />} />
        <Route path="/transcricao" element={<Transcription />} />
        <Route path="/ferramentas-texto" element={<TextTools />} />
        <Route path="/academia" element={<Academy />} />
        <Route path="/ajuda" element={<Help />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/suporte" element={<Support />} />
        <Route path="/meu-plano" element={<MyPlan />} />
      </Route>
      {/* Editor de desenho em TELA CHEIA (fora do Layout: sem sidebar/header) */}
      <Route
        path="/desenhos/:id"
        element={
          <Protected>
            <Suspense fallback={<LazyFallback />}>
              <DrawingEditor />
            </Suspense>
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
