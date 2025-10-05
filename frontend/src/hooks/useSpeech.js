// src/hooks/useSpeech.js - Speech Recognition Hook
import { useEffect, useRef, useState, useCallback } from 'react'

export function useSpeech({ silenceMs = 3500 } = {}) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  
  const recRef = useRef(null)
  const activeRef = useRef(false)
  const callbacksRef = useRef({})
  const restartCountRef = useRef(0)
  const silenceTimerRef = useRef(null)
  const interimTextRef = useRef('')

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      console.error('❌ Speech recognition not supported')
      setSupported(false)
      return
    }

    console.log('🎤 Initializing speech recognition...')
    setSupported(true)

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      console.log('✅ SPEECH STARTED')
      setListening(true)
      restartCountRef.current = 0
      
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        const text = interimTextRef.current.trim()
        if (text && callbacksRef.current.onFinalText) {
          console.log('⏱️ Silence timeout:', text)
          callbacksRef.current.onFinalText(text)
        }
        interimTextRef.current = ''
        setInterim('')
      }, silenceMs)
    }

    recognition.onresult = (event) => {
      let interimTranscript = ''
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          const finalText = result[0].transcript.trim()
          console.log('✔️ Final result:', finalText)
          if (finalText && callbacksRef.current.onFinalText) {
            callbacksRef.current.onFinalText(finalText)
          }
          interimTextRef.current = ''
          setInterim('')
        } else {
          interimTranscript += result[0].transcript
        }
      }

      if (interimTranscript) {
        console.log('💬 Interim:', interimTranscript)
        interimTextRef.current = interimTranscript
        setInterim(interimTranscript)
        
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = setTimeout(() => {
          const text = interimTextRef.current.trim()
          if (text && callbacksRef.current.onFinalText) {
            console.log('⏱️ Silence timeout:', text)
            callbacksRef.current.onFinalText(text)
          }
          interimTextRef.current = ''
          setInterim('')
        }, silenceMs)
      }
    }

    recognition.onerror = (event) => {
      console.error('❌ Speech error:', event.error)
      
      if (event.error === 'no-speech' || event.error === 'audio-capture') {
        console.log('⚠️ Ignoring error, will auto-restart')
        return
      }
      
      if (event.error === 'not-allowed') {
        console.error('🚫 Microphone permission denied!')
        activeRef.current = false
        setListening(false)
      }
    }

    recognition.onend = () => {
      console.log('⏹️ SPEECH ENDED')
      setListening(false)
      
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }

      if (activeRef.current) {
        restartCountRef.current++
        if (restartCountRef.current <= 20) {
          console.log(`🔄 Auto-restart ${restartCountRef.current}/20`)
          setTimeout(() => {
            if (activeRef.current) {
              try {
                recognition.start()
              } catch (err) {
                console.error('Restart failed:', err)
              }
            }
          }, 100)
        } else {
          console.error('❌ Too many restarts')
          activeRef.current = false
        }
      }
    }

    recRef.current = recognition

    return () => {
      activeRef.current = false
      try { recognition.abort() } catch {}
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    }
  }, [silenceMs])

  const start = useCallback((callbacks = {}) => {
    console.log('▶️ START REQUESTED')
    callbacksRef.current = callbacks
    activeRef.current = true
    restartCountRef.current = 0

    try {
      recRef.current?.start()
    } catch (err) {
      if (err.message?.includes('already started')) {
        console.log('Already running')
      } else {
        console.error('Start error:', err)
      }
    }
  }, [])

  const stop = useCallback(() => {
    console.log('⏸️ STOP REQUESTED')
    activeRef.current = false
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    try {
      recRef.current?.stop()
    } catch (err) {
      console.error('Stop error:', err)
    }
  }, [])

  return { supported, listening, interim, start, stop }
}