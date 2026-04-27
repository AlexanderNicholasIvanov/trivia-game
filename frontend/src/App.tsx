import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Host from './pages/Host'
import Play from './pages/Play'
import Solo from './pages/Solo'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/host" element={<Host />} />
        <Route path="/play/:roomCode" element={<Play />} />
        <Route path="/solo" element={<Solo />} />
      </Routes>
    </BrowserRouter>
  )
}
