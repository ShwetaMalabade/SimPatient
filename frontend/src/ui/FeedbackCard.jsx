import React from 'react'

export default function FeedbackCard({ data }) {
  if (!data) return null
  const parsed = typeof data.rubric === 'string' ? JSON.parse(data.rubric) : data.rubric
  const sections = parsed.sections || {}
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
      <div className="flex items-baseline gap-3 mb-2">
        <h3 className="text-sm font-semibold">Session Feedback</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-800">
          Score {parsed.overall_score}/100
        </span>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {Object.entries(sections).map(([key, sec]) => (
          <div key={key} className="rounded-xl border border-slate-100 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{sec.title}</div>
              <div className="text-xs">★ {sec.score}/5</div>
            </div>
            <div className="text-xs text-slate-600 mt-1">{sec.feedback}</div>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-slate-500 mt-2">Generated for training only.</div>
    </div>
  )
}
