import { useEffect } from 'react'
import { go, useRoute } from './router'
import { useStore } from './store'
import { TabBar } from './ui'
import Welcome from './screens/Welcome'
import Setup from './screens/Setup'
import Home from './screens/Home'
import Snap from './screens/Snap'
import Result from './screens/Result'
import Board from './screens/Board'
import Rewards from './screens/Rewards'
import Me from './screens/Me'
import Spotlight from './screens/Spotlight'
import Admin from './screens/Admin'

const PUBLIC = new Set(['welcome', 'setup', 'login'])
const FULLSCREEN = new Set(['welcome', 'setup', 'login', 'snap', 'result'])

function Screen({ route }: { route: string }) {
  switch (route) {
    case 'welcome':
      return <Welcome />
    case 'setup':
      return <Setup />
    case 'login':
      return <Setup login />
    case 'snap':
      return <Snap />
    case 'result':
      return <Result />
    case 'board':
      return <Board />
    case 'spotlight':
      return <Spotlight />
    case 'rewards':
      return <Rewards />
    case 'me':
      return <Me />
    default:
      return <Home />
  }
}

export default function App() {
  const route = useRoute()
  const { ready, session } = useStore()
  const signedIn = !!session
  const isAdmin = !!session?.user.admin

  useEffect(() => {
    if (!ready) return
    if (!signedIn && !PUBLIC.has(route)) go('welcome', { replace: true })
    else if (isAdmin && route !== 'admin') go('admin', { replace: true })
    else if (signedIn && (route === '' || route === 'welcome' || route === 'login')) go('home', { replace: true })
  }, [ready, signedIn, isAdmin, route])

  if (!ready || (!signedIn && !PUBLIC.has(route))) return null

  // Admins get only the moderation dashboard, none of the student app.
  if (isAdmin)
    return (
      <div className="app is-full">
        <main className="screen">
          <Admin />
        </main>
      </div>
    )

  return (
    <div className={`app ${FULLSCREEN.has(route) ? 'is-full' : ''}`}>
      <main className="screen" key={route}>
        <Screen route={route} />
      </main>
      {!FULLSCREEN.has(route) && <TabBar active={route || 'home'} />}
    </div>
  )
}
