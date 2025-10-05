import React, { useEffect } from 'react'
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react'

export default function Modal({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  type = 'info',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  showCancel = true
}) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  const iconConfig = {
    info: { Icon: Info, color: 'text-blue-600', bg: 'bg-blue-100' },
    success: { Icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' },
    warning: { Icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-100' },
    error: { Icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100' },
    confirm: { Icon: AlertCircle, color: 'text-teal-600', bg: 'bg-teal-100' }
  }

  const { Icon, color, bg } = iconConfig[type] || iconConfig.info

  const handleConfirm = () => {
    if (onConfirm) onConfirm()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-slideUp">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl hover:bg-slate-100 transition-colors z-10"
        >
          <X className="w-5 h-5 text-slate-500" />
        </button>

        <div className="p-6">
          <div className={`w-16 h-16 rounded-2xl ${bg} flex items-center justify-center mb-4`}>
            <Icon className={`w-8 h-8 ${color}`} />
          </div>

          <h3 className="text-2xl font-bold text-slate-900 mb-2">
            {title}
          </h3>

          {message && (
            <p className="text-slate-600 mb-6 leading-relaxed">
              {message}
            </p>
          )}

          <div className="flex gap-3">
            {showCancel && (
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-2xl border-2 border-slate-200 hover:bg-slate-50 font-semibold transition-all"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={handleConfirm}
              className={`flex-1 px-4 py-3 rounded-2xl font-semibold text-white transition-all ${
                type === 'error' || type === 'warning'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-teal-600 hover:bg-teal-700'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}