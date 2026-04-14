import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

export default function Home() {
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState('')
  const [nickname, setNickname] = useState('')

  const canJoin = joinCode.trim().length === 4 && nickname.trim().length > 0

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      <h1 className="text-6xl font-bold mb-2 bg-gradient-to-r from-pink-400 to-indigo-400 bg-clip-text text-transparent">
        Trivia Night
      </h1>
      <p className="text-slate-400 mb-10">Quick. Live. Competitive.</p>

      <div className="w-full max-w-md space-y-6">
        <button
          onClick={() => navigate('/host')}
          className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xl font-semibold py-4 rounded-xl shadow-lg transition"
        >
          Host a game
        </button>

        <div className="flex items-center gap-3 text-slate-500">
          <div className="flex-1 h-px bg-slate-700" />
          <span className="text-sm">or join</span>
          <div className="flex-1 h-px bg-slate-700" />
        </div>

        <div className="space-y-3">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="ROOM CODE"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-center text-3xl tracking-widest uppercase font-mono focus:outline-none focus:border-indigo-500"
          />
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 20))}
            placeholder="Your nickname"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
          />
          <button
            disabled={!canJoin}
            onClick={() =>
              navigate(
                `/play/${joinCode.trim().toUpperCase()}?nickname=${encodeURIComponent(nickname.trim())}`,
              )
            }
            className="w-full bg-pink-500 hover:bg-pink-400 active:bg-pink-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-lg font-semibold py-3 rounded-xl transition"
          >
            Join game
          </button>
        </div>
      </div>
    </div>
  )
}
