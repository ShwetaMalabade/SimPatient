import { useState, useCallback } from 'react'

export function useModal() {
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    onConfirm: null,
    confirmText: 'OK',
    cancelText: 'Cancel',
    showCancel: true
  })

  const showModal = useCallback((config) => {
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        title: config.title || 'Alert',
        message: config.message || '',
        type: config.type || 'info',
        confirmText: config.confirmText || 'OK',
        cancelText: config.cancelText || 'Cancel',
        showCancel: config.showCancel !== false,
        onConfirm: () => {
          resolve(true)
          closeModal()
        }
      })
    })
  }, [])

  const closeModal = useCallback(() => {
    setModalState(prev => ({ ...prev, isOpen: false }))
  }, [])

  const confirm = useCallback((title, message) => {
    return showModal({
      type: 'confirm',
      title,
      message,
      confirmText: 'Yes',
      cancelText: 'No',
      showCancel: true
    })
  }, [showModal])

  const alert = useCallback((title, message, type = 'info') => {
    return showModal({
      type,
      title,
      message,
      confirmText: 'OK',
      showCancel: false
    })
  }, [showModal])

  const error = useCallback((title, message) => {
    return showModal({
      type: 'error',
      title,
      message,
      confirmText: 'OK',
      showCancel: false
    })
  }, [showModal])

  return {
    modalState,
    closeModal,
    confirm,
    alert,
    error
  }
}