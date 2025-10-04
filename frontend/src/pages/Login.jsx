// import React, { useEffect, useState } from 'react'
// import { useNavigate } from 'react-router-dom'
// import { useAuth } from '../auth/AuthContext.jsx'
// import { api, setAuthToken } from '../lib/api.js'
// import { Stethoscope, Hospital } from 'lucide-react'

// export default function Login() {
//   const navigate = useNavigate()
//   const { setToken, setUser } = useAuth()
//   const [hospital, setHospital] = useState('')
//   const [loading, setLoading] = useState(false)
//   const [error, setError] = useState('')

//   useEffect(() => {
//     const script = document.createElement('script')
//     script.src = 'https://accounts.google.com/gsi/client'
//     script.async = true
//     script.defer = true
//     script.onload = renderGoogleButton
//     document.body.appendChild(script)
//     return () => {
//       document.body.removeChild(script)
//     }
//   }, [])

//   function renderGoogleButton() {
//     if (!window.google) return
//     window.google.accounts.id.initialize({
//       client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
//       callback: handleCredentialResponse
//     })
//     window.google.accounts.id.renderButton(
//       document.getElementById('gbtn'),
//       { theme: 'outline', size: 'large', width: 320 }
//     )
//   }

//   async function handleCredentialResponse(response) {
//     setError('')
//     if (!hospital) {
//       setError('Please select your hospital before continuing.')
//       return
//     }
//     setLoading(true)
//     try {
//       const res = await api.post('/auth/google-login', {
//         id_token: response.credential,
//         hospital
//       })
//       setAuthToken(res.data.token)
//       setToken(res.data.token)
//       setUser(res.data.user)
//       navigate('/')
//     } catch (e) {
//       console.error(e)
//       setError(e?.response?.data?.message || 'Login failed')
//     } finally {
//       setLoading(false)
//     }
//   }

//   return (
//     <div className="min-h-screen flex items-center justify-center p-6">
//       <div className="max-w-xl w-full glass rounded-2xl shadow-soft p-10">
//         <div className="flex items-center gap-3 mb-6">
//           <div className="p-3 rounded-2xl bg-brand-100">
//             <Stethoscope className="w-7 h-7 text-brand-700" />
//           </div>
//           <div>
//             <h1 className="text-2xl font-semibold tracking-tight">MediSim</h1>
//             <p className="text-sm text-slate-600">Doctor–Patient Practice Chat</p>
//           </div>
//         </div>

//         <label className="block text-sm font-medium mb-1">Your Hospital</label>
//         <div className="flex gap-3 mb-6">
//           <div className="relative w-full">
//             <Hospital className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
//             <input
//               placeholder="e.g., Rutgers Medical Center"
//               value={hospital}
//               onChange={(e) => setHospital(e.target.value)}
//               className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
//             />
//           </div>
//         </div>

//         <div id="gbtn" className="flex justify-center"></div>

//         {loading && <p className="mt-4 text-sm text-slate-500">Signing you in…</p>}
//         {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

//         <p className="mt-8 text-xs text-slate-500">
//           We use Google Sign‑In to verify your identity. On first login we’ll store your
//           email, name, and selected hospital.
//         </p>
//       </div>
//     </div>
//   )
// }


import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { api, setAuthToken } from '../lib/api.js'
import { Stethoscope, Hospital, Mail, User } from 'lucide-react'

const DEV = (import.meta.env.VITE_AUTH_MODE || '').toLowerCase() === 'dev'

export default function Login() {
  const navigate = useNavigate()
  const { setToken, setUser } = useAuth()
  const [hospital, setHospital] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (DEV) return // skip Google script entirely in dev mode
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = renderGoogleButton
    document.body.appendChild(script)
    return () => { document.body.removeChild(script) }
  }, [])

  function renderGoogleButton() {
    if (!window.google) return
    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse
    })
    window.google.accounts.id.renderButton(
      document.getElementById('gbtn'),
      { theme: 'outline', size: 'large', width: 320 }
    )
  }

  async function handleCredentialResponse(response) {
    setError('')
    if (!hospital) return setError('Please enter your hospital first.')
    setLoading(true)
    try {
      const res = await api.post('/auth/google-login', {
        id_token: response.credential,
        hospital
      })
      setAuthToken(res.data.token)
      setToken(res.data.token)
      setUser(res.data.user)
      navigate('/')
    } catch (e) {
      console.error(e)
      setError(e?.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function devLogin() {
    setError('')
    if (!hospital) return setError('Please enter your hospital.')
    if (!email) return setError('Please enter your email.')
    setLoading(true)
    try {
      const res = await api.post('/auth/dev-login', { email, name, hospital })
      setAuthToken(res.data.token)
      setToken(res.data.token)
      setUser(res.data.user)
      navigate('/')
    } catch (e) {
      console.error(e)
      setError(e?.response?.data?.message || 'Dev login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-xl w-full glass rounded-2xl shadow-soft p-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-2xl bg-brand-100">
            <Stethoscope className="w-7 h-7 text-brand-700" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">MediSim</h1>
            <p className="text-sm text-slate-600">Doctor–Patient Practice Chat</p>
          </div>
        </div>

        {/* Hospital */}
        <label className="block text-sm font-medium mb-1">Your Hospital</label>
        <div className="relative mb-4">
          <Hospital className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            placeholder="e.g., Rutgers Medical Center"
            value={hospital}
            onChange={(e) => setHospital(e.target.value)}
            className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>

        {/* Dev or Google */}
        {DEV ? (
          <>
            <label className="block text-sm font-medium mb-1">Email (dev)</label>
            <div className="relative mb-3">
              <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="email"
                placeholder="doc@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>

            <label className="block text-sm font-medium mb-1">Name (optional)</label>
            <div className="relative mb-6">
              <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                placeholder="Dr. Dev"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>

            <button
              onClick={devLogin}
              disabled={loading}
              className="w-full rounded-2xl px-5 py-3 bg-brand-600 text-white hover:bg-brand-700 shadow-soft disabled:opacity-60"
            >
              Continue (Dev Login)
            </button>
          </>
        ) : (
          <div id="gbtn" className="flex justify-center"></div>
        )}

        {loading && <p className="mt-4 text-sm text-slate-500">Signing you in…</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <p className="mt-8 text-xs text-slate-500">
          {DEV
            ? 'Dev mode: no Google required. For production, switch VITE_AUTH_MODE to google.'
            : 'We use Google Sign-In to verify your identity.'}
        </p>
      </div>
    </div>
  )
}
