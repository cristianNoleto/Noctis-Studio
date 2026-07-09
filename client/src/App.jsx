import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import Layout from './components/layout/Layout'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
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
import ComingSoon from './pages/ComingSoon'

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-500" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/canais" element={<ChannelsList />} />
        <Route path="/canais/:id" element={<ChannelDetail />} />
        <Route path="/quadro-ideias" element={<IdeaBoard />} />
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
        <Route path="/suporte" element={<Support />} />
        <Route path="/text-to-speech" element={<ComingSoon phase={8} feature="Text to Speech" />} />
        <Route path="/app" element={<ComingSoon phase={8} feature="Noctis App (desktop)" />} />
        <Route path="/api-docs" element={<ComingSoon phase={8} feature="Documentação da API" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
