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

  useEffect(() => {
    if (!ready) return
    if (!signedIn && !PUBLIC.has(route)) go('welcome', { replace: true })
    else if (signedIn && (route === '' || route === 'welcome' || route === 'login')) go('home', { replace: true })
  }, [ready, signedIn, route])

  if (!ready || (!signedIn && !PUBLIC.has(route))) return null

  return (
    <div className={`app ${FULLSCREEN.has(route) ? 'is-full' : ''}`}>
      <main className="screen" key={route}>
        <Screen route={route} />
      </main>
      {!FULLSCREEN.has(route) && <TabBar active={route || 'home'} />}
    </div>
  )
}
