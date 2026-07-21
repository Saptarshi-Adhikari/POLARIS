import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldAlert, Phone, CheckCircle, AlertTriangle, Clock, X } from 'lucide-react'
import { useLanguage } from '../App.jsx'

const mockFormFields = [
  { label: 'Transaction ID', value: 'TXN-2024-WB-889421', delay: 800 },
  { label: 'Suspected UPI Handle', value: 'fraud.pay@yblupi', delay: 1600 },
  { label: 'Call Timestamp', value: '21 Jul 2026, 20:47:33 IST', delay: 2400 },
  { label: 'Amount at Risk', value: '₹47,500', delay: 3200 },
  { label: 'Bank', value: 'State Bank of India — XXXX-4821', delay: 4000 },
]

const checklistItems = [
  { text: 'Block UPI handle', icon: CheckCircle, status: 'done', delay: 2000 },
  { text: 'Screenshot saved to device', icon: CheckCircle, status: 'done', delay: 3000 },
  { text: 'NCRP complaint auto-drafted', icon: CheckCircle, status: 'done', delay: 4000 },
  { text: 'Do not hang up on legit bank calls', icon: AlertTriangle, status: 'warning', delay: 5000 },
  { text: 'Golden hour evidence preserved', icon: CheckCircle, status: 'done', delay: 6000 },
]

function TypewriterText({ text, delay, onComplete }) {
  const [displayed, setDisplayed] = useState('')
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const startTimer = setTimeout(() => setStarted(true), delay)
    return () => clearTimeout(startTimer)
  }, [delay])

  useEffect(() => {
    if (!started) return
    let i = 0
    const timer = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) {
        clearInterval(timer)
        onComplete?.()
      }
    }, 30)
    return () => clearInterval(timer)
  }, [started, text])

  if (!started) return <span className="text-white/20">—</span>
  return (
    <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      {displayed}
      {displayed.length < text.length && (
        <span className="animate-pulse text-[#4CE0FF]">|</span>
      )}
    </span>
  )
}

function WaveformBar({ active }) {
  return (
    <div className="flex items-center justify-center gap-0.5 h-12">
      {Array.from({ length: 40 }).map((_, i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full bg-[#4CE0FF]"
          animate={active ? {
            height: [4, Math.random() * 40 + 8, 4],
            opacity: [0.3, 1, 0.3],
          } : { height: 4, opacity: 0.2 }}
          transition={{
            duration: 0.5 + Math.random() * 0.5,
            repeat: active ? Infinity : 0,
            ease: 'easeInOut',
            delay: i * 0.02,
          }}
        />
      ))}
    </div>
  )
}

function GoldenHourTimer({ active }) {
  const [seconds, setSeconds] = useState(3600)

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => {
      setSeconds(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [active])

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60

  return (
    <div className="text-center">
      <div className="text-xs text-[#FFB84C] uppercase tracking-widest mb-2 flex items-center justify-center gap-2">
        <Clock className="w-3.5 h-3.5" />
        Golden Hour Countdown
      </div>
      <div
        className="text-5xl font-bold text-[#FFB84C] drop-shadow-[0_0_30px_rgba(255,184,76,0.4)]"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </div>
      <div className="text-xs text-white/30 mt-1">Time remaining to freeze fraudulent transaction</div>
    </div>
  )
}

export default function CyberFraudShield() {
  const { t } = useLanguage()
  const [activated, setActivated] = useState(false)
  const [showOverlay, setShowOverlay] = useState(false)
  const [dialingPhase, setDialingPhase] = useState(0)
  const [sirenRings, setSirenRings] = useState([])

  const activate = () => {
    if (activated) return
    setActivated(true)
    setShowOverlay(true)

    // siren rings
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        setSirenRings(prev => [...prev, Date.now() + i])
      }, i * 300)
    }

    // Phase transitions
    setTimeout(() => setDialingPhase(1), 500)   // Dialing...
    setTimeout(() => setDialingPhase(2), 3000)  // Connected
    setTimeout(() => setShowOverlay(false), 2000)
  }

  const reset = () => {
    setActivated(false)
    setShowOverlay(false)
    setDialingPhase(0)
    setSirenRings([])
  }

  return (
    <section id="cyber-fraud" className="relative z-10 py-20 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FF3B5C]/10 border border-[#FF3B5C]/20 text-[#FF3B5C] text-xs font-semibold uppercase tracking-widest mb-4">
            <ShieldAlert className="w-3.5 h-3.5" />
            {t.feature1}
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Digital Arrest &amp; Cyber Fraud <span className="text-[#FF3B5C]">Shield</span>
          </h2>
        </motion.div>

        {/* Red Flash Overlay */}
        <AnimatePresence>
          {showOverlay && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[100] pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(255,59,92,0.15) 0%, rgba(255,59,92,0.05) 100%)' }}
            />
          )}
        </AnimatePresence>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left - Panic Button */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-8 flex flex-col items-center justify-center relative overflow-hidden"
          >
            {/* Siren Rings */}
            <AnimatePresence>
              {sirenRings.map(id => (
                <motion.div
                  key={id}
                  initial={{ width: 100, height: 100, opacity: 0.8 }}
                  animate={{ width: 800, height: 800, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 2, ease: 'easeOut' }}
                  className="absolute rounded-full border-2 border-[#FF3B5C] pointer-events-none"
                  style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                />
              ))}
            </AnimatePresence>

            {!activated ? (
              <>
                <motion.button
                  onClick={activate}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="relative w-40 h-40 rounded-full cursor-pointer flex items-center justify-center"
                  id="panic-button"
                >
                  {/* Pulsing glow rings */}
                  <motion.div
                    className="absolute inset-0 rounded-full bg-[#FF3B5C]/20"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <motion.div
                    className="absolute inset-2 rounded-full bg-[#FF3B5C]/30"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.6, 0.1, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                  />
                  <div className="absolute inset-4 rounded-full bg-gradient-to-br from-[#FF3B5C] to-[#cc1e3a] shadow-[0_0_60px_rgba(255,59,92,0.6)] flex items-center justify-center">
                    <ShieldAlert className="w-16 h-16 text-white" />
                  </div>
                </motion.button>
                <p className="text-sm text-white/40 mt-6 text-center">
                  Tap to activate emergency cyber fraud response
                </p>
              </>
            ) : (
              <div className="w-full space-y-6">
                {/* Dialing UI */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center space-y-3"
                >
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF3B5C]/10 border border-[#FF3B5C]/30">
                    <Phone className="w-4 h-4 text-[#FF3B5C]" />
                    <span className="text-sm font-semibold text-[#FF3B5C]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {dialingPhase === 0 && 'INITIATING...'}
                      {dialingPhase === 1 && 'DIALING 1930...'}
                      {dialingPhase >= 2 && '✓ CONNECTED — 1930 NATIONAL CYBER HELPLINE'}
                    </span>
                  </div>
                  <WaveformBar active={dialingPhase >= 1} />
                </motion.div>

                {/* Golden Hour Timer */}
                <GoldenHourTimer active={activated} />

                {/* Reset */}
                <div className="text-center">
                  <button
                    onClick={reset}
                    className="text-xs text-white/30 hover:text-white/60 transition-colors flex items-center gap-1 mx-auto cursor-pointer"
                  >
                    <X className="w-3 h-3" /> Reset Demo
                  </button>
                </div>
              </div>
            )}
          </motion.div>

          {/* Right - Auto-fill Form + Checklist */}
          <div className="space-y-6">
            {/* NCRP Complaint Form */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[#4CE0FF] uppercase tracking-widest" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  NCRP Auto-Complaint Draft
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#4CE0FF]/10 border border-[#4CE0FF]/20 text-[#4CE0FF]">
                  AI-DRAFTED
                </span>
              </div>

              <div className="space-y-3">
                {mockFormFields.map((field) => (
                  <div key={field.label} className="flex flex-col gap-1">
                    <label className="text-[10px] text-white/30 uppercase tracking-wider">{field.label}</label>
                    <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 min-h-[36px] flex items-center">
                      {activated ? (
                        <TypewriterText text={field.value} delay={field.delay} />
                      ) : (
                        <span className="text-white/20">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-3 rounded-lg bg-[#FFB84C]/5 border border-[#FFB84C]/20 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#FFB84C] mt-0.5 shrink-0" />
                <p className="text-xs text-[#FFB84C]/80">
                  Human review required before submission — AI-assisted draft only
                </p>
              </div>
            </motion.div>

            {/* Checklist */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6"
            >
              <h3 className="text-sm font-semibold text-[#33FFB0] uppercase tracking-widest mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Emergency Checklist
              </h3>
              <div className="space-y-3">
                {checklistItems.map((item) => (
                  <ChecklistItem key={item.text} item={item} activated={activated} />
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ChecklistItem({ item, activated }) {
  const [visible, setVisible] = useState(false)
  const Icon = item.icon

  useEffect(() => {
    if (!activated) {
      setVisible(false)
      return
    }
    const timer = setTimeout(() => setVisible(true), item.delay)
    return () => clearTimeout(timer)
  }, [activated, item.delay])

  return (
    <motion.div
      initial={false}
      animate={visible ? { opacity: 1, x: 0 } : { opacity: 0.3, x: -10 }}
      transition={{ duration: 0.4, type: 'spring' }}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all duration-300 ${
        visible
          ? item.status === 'warning'
            ? 'bg-[#FFB84C]/5 border-[#FFB84C]/20'
            : 'bg-[#33FFB0]/5 border-[#33FFB0]/20'
          : 'bg-white/5 border-white/5'
      }`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${
        visible
          ? item.status === 'warning' ? 'text-[#FFB84C]' : 'text-[#33FFB0]'
          : 'text-white/20'
      }`} />
      <span className={`text-sm ${visible ? 'text-white/80' : 'text-white/20'}`}>
        {item.text}
      </span>
    </motion.div>
  )
}
