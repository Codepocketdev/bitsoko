import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import './styles/index.css'

import Landing from './pages/Landing'
import Login from './pages/Login'
import CreateAccount from './pages/CreateAccount'
import Home from './pages/Home'
import Explore from './pages/Explore'
import Deals from './pages/Deals'
import Cart from './pages/Cart'
import Profile from './pages/Profile'
import Orders from './pages/Orders'
import Messages from './pages/Messages'
import Settings from './pages/Settings'
import MyShop from './pages/MyShop'
import CreateListing from './pages/CreateListing'
import ProductDetail from './pages/ProductDetail'
import PageWrapper from './components/layout/PageWrapper'

export default function App() {
  const [authed, setAuthed] = useState(false)
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    const nsec = localStorage.getItem('bitsoko_nsec')
    if (nsec) setAuthed(true)
    const saved = localStorage.getItem('bitsoko_theme') || 'light'
    setTheme(saved)
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    localStorage.setItem('bitsoko_theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  const handleAuth = () => setAuthed(true)

  if (!authed) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/"        element={<Landing />} />
          <Route path="/login"   element={<Login onAuth={handleAuth} />} />
          <Route path="/create"  element={<CreateAccount onAuth={handleAuth} />} />
          <Route path="*"        element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <PageWrapper toggleTheme={toggleTheme} theme={theme}>
        <Routes>
          <Route path="/"               element={<Home />} />
          <Route path="/explore"        element={<Explore />} />
          <Route path="/deals"          element={<Deals />} />
          <Route path="/cart"           element={<Cart />} />
          <Route path="/profile"        element={<Profile />} />
          <Route path="/orders"         element={<Orders />} />
          <Route path="/messages"       element={<Messages />} />
          <Route path="/settings"       element={<Settings />} />
          <Route path="/shop"           element={<MyShop />} />
          <Route path="/create-listing" element={<CreateListing />} />
          <Route path="/product/:id"    element={<ProductDetail />} />
          <Route path="*"               element={<Navigate to="/" />} />
        </Routes>
      </PageWrapper>
    </BrowserRouter>
  )
}

