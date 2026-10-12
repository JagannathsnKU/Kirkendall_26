import { useEffect } from 'react'
import Aurora from './Aurora'
import { go, useRoute } from './router'
import { useStore } from './store'
import { TabBar } from './ui'
import Welcome from './screens/Welcome'
import Setup from './screens/Setup'
import Reset from './screens/Reset'
import Home from './screens/Home'
import Snap from './screens/Snap'
import Result from './screens/Result'
import Trip from './screens/Trip'
import Board from './screens/Board'
import Rewards from './screens/Rewards'
import Me from './screens/Me'
import Spotlight from './screens/Spotlight'
import Admin from './screens/Admin'

const PUBLIC = new Set(['welcome', 'setup', 'login', 'forgot', 'reset'])
const FULLSCREEN = new Set(['welcome', 'setup', 'login', 'forgot', 'reset', 'snap', 'result', 'trip'])

function Screen({ route, params }: { route: string; params: URLSearchParams }) {
  switch (route) {
    case 'welcome':
      return <Welcome />
    case 'setup':
      return <Setup />
    case 'login':
      return <Setup login />
    case 'forgot':
      return <Reset />
    case 'reset':
      return <Reset token={params.get('token') ?? undefined} />
    case 'snap':
      return <Snap />
    case 'result':
      return <Result />
    case 'trip':
      return <Trip />
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
  const [route, query = ''] = useRoute().split('?')
  const { ready, session } = useStore()
  const signedIn = !!session
  const isAdmin = !!session?.user.admin
  // A reset link works even if this phone is still logged in to another account.
  const resetting = route === 'reset'

  useEffect(() => {
    if (!ready) return
    if (!signedIn && !PUBLIC.has(route)) go('welcome', { replace: true })
    else if (isAdmin && route !== 'admin' && !resetting) go('admin', { replace: true })
    else if (signedIn && (route === '' || route === 'welcome' || route === 'login' || route === 'forgot')) go('home', { replace: true })
  }, [ready, signedIn, isAdmin, route, resetting])

  if (!ready || (!signedIn && !PUBLIC.has(route))) return null

  // Admins get only the moderation dashboard, none of the student app.
  if (isAdmin && !resetting)
    return (
      <div className="app is-full">
        <main className="screen">
          <Admin />
        </main>
      </div>
    )

  return (
    <div className={`app ${FULLSCREEN.has(route) ? 'is-full' : ''}`}>
      {route !== 'welcome' && (
        <Aurora
          className="app-aurora"
          colorStops={['#6ee7b7', '#34d399', '#5eead4', '#a7f3d0']}
          amplitude={1.1}
          blend={0.7}
          height={0.5}
          speed={0.3}
          glow={0.8}
          layers={2}
          lightMode
          mouseInteraction={false}
        />
      )}
      <main className="screen" key={route}>
        <Screen route={route} params={new URLSearchParams(query)} />
      </main>
      {!FULLSCREEN.has(route) && <TabBar active={route || 'home'} />}
    </div>
  )
}
