import { Show, UserButton } from '@clerk/react'
import { useLocation } from 'react-router-dom'

const CLERK_ENABLED = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

/**
 * Pinned top-left avatar for signed-in users. Hidden inside /host and
 * /play/* so it doesn't collide with the leave-lobby chalk link that
 * already lives there.
 */
export default function AccountButton() {
  const location = useLocation()
  if (!CLERK_ENABLED) return null
  const inLobby =
    location.pathname.startsWith('/host') ||
    location.pathname.startsWith('/play/')
  if (inLobby) return null
  return (
    <Show when="signed-in">
      <div className="fixed top-2 left-3 z-50">
        <UserButton />
      </div>
    </Show>
  )
}
