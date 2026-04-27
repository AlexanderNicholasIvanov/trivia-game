import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { audio } from './audio'
import MuteToggle from './components/MuteToggle'
import Home from './pages/Home'
import Host from './pages/Host'
import Play from './pages/Play'
import Solo from './pages/Solo'
import './App.css'

export default function App() {
  // Browsers block autoplay until the user interacts with the page. Catch the
  // first click or keypress anywhere and unlock the audio context once.
  useEffect(() => {
    let unlocked = false
    const unlock = () => {
      if (unlocked) return
      unlocked = true
      audio.unlock()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  return (
    <BrowserRouter>
      <MuteToggle />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/host" element={<Host />} />
        <Route path="/play/:roomCode" element={<Play />} />
        <Route path="/solo" element={<Solo />} />
      </Routes>
    </BrowserRouter>
  )
}
