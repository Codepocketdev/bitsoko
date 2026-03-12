import { useState } from 'react'
import Login from './Login'
import CreateAccount from './CreateAccount'

export default function Auth({ onAuth }) {
  const [screen, setScreen] = useState('login')
  if (screen === 'create')
    return <CreateAccount onAuth={onAuth} onGoLogin={() => setScreen('login')} />
  return <Login onAuth={onAuth} onGoCreate={() => setScreen('create')} />
}

