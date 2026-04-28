import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { audio } from './audio'
import AccountButton from './components/AccountButton'
import HeaderMark from './components/HeaderMark'
import MuteToggle from './components/MuteToggle'
import Home from './pages/Home'
import Host from './pages/Host'
import Play from './pages/Play'
import Solo from './pages/Solo'
import './App.css'

export default function App() {
  // Browsers block autoplay until the user interacts with the page. Try to
  // unlock on every user gesture and only stop once music is actually
  // playing — some browsers reject the first play() even from a real click.
  useEffect(() => {
    const tryUnlock = () => {
      audio.unlock()
      if (audio.isPlayingMusic()) {
        window.removeEventListener('pointerdown', tryUnlock)
        window.removeEventListener('keydown', tryUnlock)
        window.removeEventListener('touchend', tryUnlock)
      }
    }
    window.addEventListener('pointerdown', tryUnlock)
    window.addEventListener('keydown', tryUnlock)
    window.addEventListener('touchend', tryUnlock)
    return () => {
      window.removeEventListener('pointerdown', tryUnlock)
      window.removeEventListener('keydown', tryUnlock)
      window.removeEventListener('touchend', tryUnlock)
    }
  }, [])

  return (
    <BrowserRouter>
      <HeaderMark />
      <AccountButton />
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
