import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import ChatLayout from './pages/ChatLayout.jsx'
import NewChat from './pages/NewChat.jsx'
import Dashboard from './pages/Dashboard.jsx'
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
        
        {/* ⚠️ CRITICAL: /dashboard MUST come before /:threadId */}
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        
        <Route
          path="/newchat"
          element={
            <PrivateRoute>
              <NewChat />
            </PrivateRoute>
          }
        />
        
        {/* Dynamic route comes LAST */}
        <Route
          path="/:threadId"
          element={
            <PrivateRoute>
              <ChatLayout />
            </PrivateRoute>
          }
        />
        
        <Route path="/" element={<Navigate to="/newchat" />} />
        <Route path="*" element={<Navigate to="/newchat" />} />
      </Routes>
    </AuthProvider>
  )
}