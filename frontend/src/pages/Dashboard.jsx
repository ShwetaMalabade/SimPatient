// Save as: frontend/src/pages/Dashboard.jsx
import React, { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { api } from '../lib/api.js'
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'
import {
  TrendingUp, Award, AlertCircle, Target, Calendar,
  BarChart3, User, LogOut
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import defaultProfile from '../images/default-profile.webp'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
  }, [])

  async function fetchAnalytics() {
    try {
      setLoading(true)
      const res = await api.get('/analytics')
      console.log('📊 Analytics response:', res.data)
      setAnalytics(res.data)
    } catch (err) {
      console.error('❌ Analytics error:', err)
      alert('Failed to load analytics: ' + (err.response?.data?.message || err.message))
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 via-emerald-50 to-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading analytics...</p>
        </div>
      </div>
    )
  }

  if (!analytics || analytics.total_sessions === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-emerald-50 to-white p-6">
        <div className="max-w-7xl mx-auto">
          <ProfileHeader user={user} logout={logout} navigate={navigate} />
          <div className="mt-8 text-center">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <BarChart3 className="w-10 h-10 text-slate-400" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">No Analytics Data Yet</h2>
            <p className="text-slate-600 mb-6">
              Complete and close your first patient session to see analytics
            </p>
            <button
              onClick={() => navigate('/newchat')}
              className="px-6 py-3 bg-brand-600 text-white rounded-2xl hover:bg-brand-700 shadow-soft"
            >
              Start First Session
            </button>
          </div>
        </div>
      </div>
    )
  }

  const categoryData = Object.entries(analytics.category_avg).map(([key, value]) => ({
    category: formatCategoryName(key),
    score: value,
    fullMark: 100
  }))

  const radarData = Object.entries(analytics.category_avg).map(([key, value]) => ({
    subject: formatCategoryName(key),
    score: value,
    fullMark: 100
  }))

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-emerald-50 to-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <ProfileHeader user={user} logout={logout} navigate={navigate} />

        <div className="grid md:grid-cols-4 gap-4">
          <MetricCard
            icon={<Award className="w-6 h-6" />}
            label="Overall Score"
            value={`${analytics.overall_avg}%`}
            color="brand"
          />
          <MetricCard
            icon={<Target className="w-6 h-6" />}
            label="Total Sessions"
            value={analytics.total_sessions}
            color="blue"
          />
          <MetricCard
            icon={<TrendingUp className="w-6 h-6" />}
            label="Strongest Area"
            value={formatCategoryName(analytics.insights.strongest.category)}
            subtitle={`${analytics.insights.strongest.score}%`}
            color="green"
          />
          <MetricCard
            icon={<AlertCircle className="w-6 h-6" />}
            label="Focus Area"
            value={formatCategoryName(analytics.insights.weakest.category)}
            subtitle={`${analytics.insights.weakest.score}%`}
            color="orange"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="glass rounded-2xl p-6 shadow-soft">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Performance Trend
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.trend_data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="session" stroke="#64748b" />
                <YAxis domain={[0, 100]} stroke="#64748b" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px'
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#0d9488"
                  strokeWidth={3}
                  dot={{ fill: '#0d9488', r: 5 }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="glass rounded-2xl p-6 shadow-soft">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Skills Breakdown
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="category" stroke="#64748b" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="#64748b" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="score" fill="#0d9488" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="glass rounded-2xl p-6 shadow-soft">
            <h3 className="text-lg font-semibold mb-4">Skill Assessment</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" stroke="#64748b" fontSize={11} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} stroke="#64748b" />
                <Radar
                  name="Score"
                  dataKey="score"
                  stroke="#0d9488"
                  fill="#0d9488"
                  fillOpacity={0.5}
                />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="glass rounded-2xl p-6 shadow-soft">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Recent Sessions
            </h3>
            <div className="space-y-2 max-h-[300px] overflow-auto">
              {analytics.recent_sessions.map((session) => (
                <div
                  key={session.id}
                  className="p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer"
                  onClick={() => navigate(`/${session.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{session.title}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(session.ended_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="ml-3">
                      <ScoreBadge score={session.overall_score} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {analytics.insights.improvement_areas.length > 0 && (
          <div className="glass rounded-2xl p-6 shadow-soft">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-600" />
              Areas for Improvement
            </h3>
            <div className="grid md:grid-cols-3 gap-4">
              {analytics.insights.improvement_areas.map((area) => (
                <div
                  key={area.category}
                  className="p-4 rounded-xl border border-orange-200 bg-orange-50"
                >
                  <p className="font-medium text-orange-900">
                    {formatCategoryName(area.category)}
                  </p>
                  <p className="text-sm text-orange-700 mt-1">
                    Current: {area.score.toFixed(1)}% - Focus on practice
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-4 justify-center pt-4">
          <button
            onClick={() => navigate('/newchat')}
            className="px-6 py-3 bg-brand-600 text-white rounded-2xl hover:bg-brand-700 shadow-soft"
          >
            Start New Session
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 border border-slate-300 rounded-2xl hover:bg-slate-50"
          >
            View All Sessions
          </button>
        </div>
      </div>
    </div>
  )
}

function ProfileHeader({ user, logout, navigate }) {
  return (
    <div className="glass rounded-2xl p-6 shadow-soft flex items-center justify-between">
      <div className="flex items-center gap-4">
        <img
          src={user?.picture || defaultProfile}
          alt="Profile"
          className="w-16 h-16 rounded-2xl object-cover border-2 border-brand-200"
        />
        <div>
          <h1 className="text-2xl font-bold">{user?.name || 'Doctor'}</h1>
          <p className="text-slate-600">{user?.hospital || 'Medical Center'}</p>
          <p className="text-sm text-slate-500">{user?.email}</p>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center gap-2"
        >
          <User className="w-4 h-4" />
          Sessions
        </button>
        <button
          onClick={logout}
          className="px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </div>
  )
}

function MetricCard({ icon, label, value, subtitle, color = 'brand' }) {
  const colors = {
    brand: 'from-teal-400 to-teal-600',
    blue: 'from-blue-400 to-blue-600',
    green: 'from-green-400 to-green-600',
    orange: 'from-orange-400 to-orange-600'
  }

  return (
    <div className="glass rounded-2xl p-5 shadow-soft">
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center text-white mb-3`}>
        {icon}
      </div>
      <p className="text-sm text-slate-600 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </div>
  )
}

function ScoreBadge({ score }) {
  const getColor = (score) => {
    if (score >= 80) return 'bg-green-100 text-green-700 border-green-200'
    if (score >= 60) return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    return 'bg-red-100 text-red-700 border-red-200'
  }

  return (
    <span className={`px-2 py-1 rounded-lg text-xs font-semibold border ${getColor(score)}`}>
      {score}%
    </span>
  )
}

function formatCategoryName(key) {
  const names = {
    history: 'History',
    red_flags: 'Red Flags',
    meds_allergies: 'Meds & Allergies',
    differential: 'Diagnosis',
    plan: 'Plan',
    communication: 'Communication'
  }
  return names[key] || key
}