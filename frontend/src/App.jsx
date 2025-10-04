import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import ChatLayout from './pages/ChatLayout.jsx'
import NewChat from './pages/NewChat.jsx'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'

function PrivateRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/newchat"
          element={
            <PrivateRoute>
              <NewChat />
            </PrivateRoute>
          }
        />
        <Route
          path="/:threadId"
          element={
            <PrivateRoute>
              <ChatLayout />
            </PrivateRoute>
          }
        />
        {/* Default → newchat */}
        <Route path="/" element={<Navigate to="/newchat" />} />
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/newchat" />} />
      </Routes>
    </AuthProvider>
  )
}
