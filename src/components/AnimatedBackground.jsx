import { useEffect, useRef } from 'react'
import { useTheme } from '../App.jsx'

export default function AnimatedBackground() {
  const canvasRef = useRef(null)
  const { theme } = useTheme()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let animationId
    let time = 0

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight * 5
    }
    resize()
    window.addEventListener('resize', resize)

    function draw() {
      time += 0.002
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const isDark = theme === 'dark'

      const gradients = isDark
        ? [
            { x: Math.sin(time * 0.7) * 300 + canvas.width * 0.3, y: Math.cos(time * 0.5) * 200 + canvas.height * 0.2, color: 'rgba(30, 0, 80, 0.15)' },
            { x: Math.cos(time * 0.4) * 400 + canvas.width * 0.7, y: Math.sin(time * 0.6) * 300 + canvas.height * 0.15, color: 'rgba(80, 0, 30, 0.12)' },
            { x: Math.sin(time * 0.3) * 250 + canvas.width * 0.5, y: Math.cos(time * 0.8) * 350 + canvas.height * 0.35, color: 'rgba(0, 60, 60, 0.12)' },
            { x: Math.cos(time * 0.5) * 300 + canvas.width * 0.2, y: Math.sin(time * 0.4) * 200 + canvas.height * 0.5, color: 'rgba(20, 0, 60, 0.1)' },
            { x: Math.sin(time * 0.6) * 350 + canvas.width * 0.8, y: Math.cos(time * 0.3) * 250 + canvas.height * 0.6, color: 'rgba(60, 0, 20, 0.08)' },
          ]
        : [
            { x: Math.sin(time * 0.7) * 300 + canvas.width * 0.3, y: Math.cos(time * 0.5) * 200 + canvas.height * 0.2, color: 'rgba(186, 230, 253, 0.4)' },
            { x: Math.cos(time * 0.4) * 400 + canvas.width * 0.7, y: Math.sin(time * 0.6) * 300 + canvas.height * 0.15, color: 'rgba(254, 205, 211, 0.35)' },
            { x: Math.sin(time * 0.3) * 250 + canvas.width * 0.5, y: Math.cos(time * 0.8) * 350 + canvas.height * 0.35, color: 'rgba(204, 251, 241, 0.4)' },
            { x: Math.cos(time * 0.5) * 300 + canvas.width * 0.2, y: Math.sin(time * 0.4) * 200 + canvas.height * 0.5, color: 'rgba(224, 231, 255, 0.35)' },
            { x: Math.sin(time * 0.6) * 350 + canvas.width * 0.8, y: Math.cos(time * 0.3) * 250 + canvas.height * 0.6, color: 'rgba(254, 243, 199, 0.3)' },
          ]

      gradients.forEach(g => {
        const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, 600)
        grad.addColorStop(0, g.color)
        grad.addColorStop(1, 'transparent')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      })

      animationId = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [theme])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none transition-opacity duration-700"
      style={{ opacity: theme === 'dark' ? 0.8 : 0.9 }}
    />
  )
}
