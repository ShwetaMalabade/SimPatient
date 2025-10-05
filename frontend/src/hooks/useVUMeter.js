// src/hooks/useVUMeter.js - Audio Level Meter
import { useEffect, useRef, useState } from 'react'

export function useVUMeter(active) {
  const [level, setLevel] = useState(0)
  const streamRef = useRef(null)
  const acRef = useRef(null)
  const rafRef = useRef(null)
  
  useEffect(() => {
    if (!active) {
      cleanup()
      return
    }
    
    let cancelled = false
    
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) return
        
        streamRef.current = stream
        const ac = new (window.AudioContext || window.webkitAudioContext)()
        acRef.current = ac
        
        const src = ac.createMediaStreamSource(stream)
        const analyser = ac.createAnalyser()
        analyser.fftSize = 2048
        src.connect(analyser)
        
        const data = new Uint8Array(analyser.fftSize)
        
        const tick = () => {
          analyser.getByteTimeDomainData(data)
          let sum = 0
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128
            sum += v * v
          }
          const rms = Math.sqrt(sum / data.length)
          setLevel(Math.min(1, rms * 4))
          rafRef.current = requestAnimationFrame(tick)
        }
        tick()
      } catch {}
    })()
    
    return () => {
      cancelled = true
      cleanup()
    }
  }, [active])
  
  function cleanup() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    if (acRef.current) { acRef.current.close(); acRef.current = null }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }
  
  return { level }
}