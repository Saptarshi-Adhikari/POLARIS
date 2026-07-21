import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, MapPin, Phone, Shield, Eye, EyeOff, Cloud, Sun, Thermometer, Droplets, Wind, ArrowRight, Mic, Scale } from 'lucide-react'
import { useLanguage } from '../App.jsx'

function RadarPing({ active }) {
  if (!active) return null
  return (
    <div className="relative w-48 h-48 mx-auto">
      {[0, 1, 2, 3].map(i => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full border border-[#FF3B5C]/40"
          initial={{ scale: 0.3, opacity: 0.8 }}
          animate={{ scale: 2.5, opacity: 0 }}
          transition={{
            duration: 3,
            repeat: Infinity,
            delay: i * 0.75,
            ease: 'easeOut',
          }}
        />
      ))}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
      >
        <div className="w-1 h-24 bg-gradient-to-t from-[#FF3B5C]/60 to-transparent origin-bottom" />
      </motion.div>
      <div className="absolute inset-0 flex items-center justify-center">
        <MapPin className="w-8 h-8 text-[#FF3B5C]" />
      </div>
    </div>
  )
}

function DiscreetWeatherApp() {
  return (
    <motion.div
      initial={{ rotateY: 90, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      exit={{ rotateY: -90, opacity: 0 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
      className="rounded-2xl bg-gradient-to-br from-sky-900/30 to-blue-900/20 backdrop-blur-xl border border-white/10 p-6 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-white/90">Kolkata</h3>
          <p className="text-xs text-white/40">Monday, July 21</p>
        </div>
        <Cloud className="w-10 h-10 text-sky-300/60" />
      </div>

      <div className="flex items-end gap-2">
        <span className="text-6xl font-light text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>32°</span>
        <span className="text-white/40 text-sm mb-2">Partly Cloudy</span>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/10">
        <div className="text-center">
          <Thermometer className="w-4 h-4 text-orange-300/60 mx-auto mb-1" />
          <p className="text-xs text-white/60">Feels 38°</p>
        </div>
        <div className="text-center">
          <Droplets className="w-4 h-4 text-blue-300/60 mx-auto mb-1" />
          <p className="text-xs text-white/60">82%</p>
        </div>
        <div className="text-center">
          <Wind className="w-4 h-4 text-white/40 mx-auto mb-1" />
          <p className="text-xs text-white/60">12 km/h</p>
        </div>
      </div>

      <div className="flex justify-between pt-2 border-t border-white/10">
        {['Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center">
            <p className="text-[10px] text-white/30">{day}</p>
            <Sun className="w-3.5 h-3.5 text-yellow-300/40 mx-auto my-1" />
            <p className="text-[10px] text-white/50">34°</p>
          </div>
        ))}
      </div>

      <p className="text-[9px] text-white/15 text-center mt-2">
        Triple-tap temperature to access SOS
      </p>
    </motion.div>
  )
}

export default function WomenSafety() {
  const { t } = useLanguage()
  const [holdProgress, setHoldProgress] = useState(0)
  const [activated, setActivated] = useState(false)
  const [discreetMode, setDiscreetMode] = useState(false)
  const holdTimerRef = useRef(null)
  const holdIntervalRef = useRef(null)

  const contacts = [
    { name: 'Priya (Sister)', phone: '+91 98XXX XXXXX', status: 'Location shared' },
    { name: 'Amit (Friend)', phone: '+91 97XXX XXXXX', status: 'Location shared' },
    { name: 'Mom', phone: '+91 98XXX XXXXX', status: 'Location shared' },
  ]

  const startHold = () => {
    if (activated || discreetMode) return
    setHoldProgress(0)
    holdIntervalRef.current = setInterval(() => {
      setHoldProgress(prev => {
        if (prev >= 100) {
          clearInterval(holdIntervalRef.current)
          setActivated(true)
          return 100
        }
        return prev + 2
      })
    }, 40)
  }

  const endHold = () => {
    if (holdProgress < 100) {
      clearInterval(holdIntervalRef.current)
      setHoldProgress(0)
    }
  }

  const reset = () => {
    setActivated(false)
    setHoldProgress(0)
    setDiscreetMode(false)
  }

  return (
    <section id="women-safety" className="relative z-10 py-20 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FF3B5C]/10 border border-[#FF3B5C]/20 text-[#FF3B5C] text-xs font-semibold uppercase tracking-widest mb-4">
            <Heart className="w-3.5 h-3.5" />
            {t.feature4}
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Women's Safety <span className="text-[#FF3B5C]">SOS</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left - SOS Panel */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            {/* Discreet Mode Toggle */}
            <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {discreetMode ? <EyeOff className="w-4 h-4 text-[#FFB84C]" /> : <Eye className="w-4 h-4 text-white/40" />}
                <div>
                  <p className="text-sm font-medium text-white/80">Discreet Mode</p>
                  <p className="text-[10px] text-white/30">Disguises SOS as weather app</p>
                </div>
              </div>
              <button
                onClick={() => setDiscreetMode(!discreetMode)}
                className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${
                  discreetMode ? 'bg-[#FFB84C]' : 'bg-white/10'
                }`}
                id="discreet-mode-toggle"
              >
                <motion.div
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md"
                  animate={{ left: discreetMode ? '26px' : '2px' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              </button>
            </div>

            {/* Main SOS / Weather swap */}
            <AnimatePresence mode="wait">
              {discreetMode ? (
                <DiscreetWeatherApp key="weather" />
              ) : (
                <motion.div
                  key="sos"
                  initial={{ rotateY: -90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  exit={{ rotateY: 90, opacity: 0 }}
                  transition={{ duration: 0.6, ease: 'easeInOut' }}
                  className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-8 flex flex-col items-center"
                >
                  {!activated ? (
                    <>
                      {/* Press-and-hold SOS button */}
                      <div className="relative w-36 h-36 mb-6">
                        {/* Progress ring */}
                        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                          <motion.circle
                            cx="50" cy="50" r="46"
                            fill="none"
                            stroke="#FF3B5C"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray={289}
                            strokeDashoffset={289 - (289 * holdProgress / 100)}
                            style={{ filter: 'drop-shadow(0 0 8px rgba(255,59,92,0.5))' }}
                          />
                        </svg>
                        <button
                          onMouseDown={startHold}
                          onMouseUp={endHold}
                          onMouseLeave={endHold}
                          onTouchStart={startHold}
                          onTouchEnd={endHold}
                          className="absolute inset-4 rounded-full bg-gradient-to-br from-[#FF3B5C] to-[#cc1e3a] shadow-[0_0_50px_rgba(255,59,92,0.4)] flex items-center justify-center cursor-pointer select-none"
                          id="sos-button"
                        >
                          <motion.div
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                          >
                            <Shield className="w-14 h-14 text-white" />
                          </motion.div>
                        </button>
                      </div>
                      <p className="text-sm text-white/40 text-center">
                        Press &amp; hold for 2 seconds to activate SOS
                      </p>
                      <p className="text-[10px] text-white/20 text-center mt-1">
                        Hold prevents accidental triggers
                      </p>
                    </>
                  ) : (
                    <div className="w-full space-y-6">
                      <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="text-center"
                      >
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF3B5C]/20 border border-[#FF3B5C]/30 mb-4">
                          <motion.div
                            animate={{ scale: [1, 1.3, 1] }}
                            transition={{ duration: 0.8, repeat: Infinity }}
                          >
                            <Shield className="w-4 h-4 text-[#FF3B5C]" />
                          </motion.div>
                          <span className="text-sm font-bold text-[#FF3B5C]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            SOS ACTIVATED
                          </span>
                        </div>
                      </motion.div>

                      <RadarPing active={true} />

                      {/* Contacts notified */}
                      <div className="space-y-2">
                        {contacts.map((c, i) => (
                          <motion.div
                            key={c.name}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.5 + i * 0.3 }}
                            className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10"
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-[#FF3B5C]/20 flex items-center justify-center">
                                <Phone className="w-3.5 h-3.5 text-[#FF3B5C]" />
                              </div>
                              <div>
                                <p className="text-xs text-white/80">{c.name}</p>
                                <p className="text-[10px] text-white/30">{c.phone}</p>
                              </div>
                            </div>
                            <span className="text-[10px] text-[#33FFB0]">✓ {c.status}</span>
                          </motion.div>
                        ))}
                      </div>

                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 2 }}
                        className="text-center p-3 rounded-lg bg-[#33FFB0]/5 border border-[#33FFB0]/20"
                      >
                        <p className="text-xs text-[#33FFB0]">
                          📍 Location shared with 3 contacts + nearest police station (Park Street PS — 0.8 km)
                        </p>
                      </motion.div>

                      <button
                        onClick={reset}
                        className="w-full text-xs text-white/30 hover:text-white/60 transition-colors text-center cursor-pointer py-2"
                      >
                        Reset Demo
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Right - Connected Feature Pathway */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6"
          >
            <h3 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-6" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Connected Safety Pathway
            </h3>

            <div className="space-y-0">
              {/* Step 1 - SOS */}
              <PathwayStep
                icon={Shield}
                color="#FF3B5C"
                title="SOS Activated"
                desc="Emergency contacts notified, location shared with nearest station"
                active={true}
                delay={0}
              />
              <PathwayConnector color="#FF3B5C" />

              {/* Step 2 - Voice FIR */}
              <PathwayStep
                icon={Mic}
                color="#4CE0FF"
                title="Voice FIR Recording"
                desc="Speak your complaint — AI structures it into official FIR draft"
                active={activated}
                delay={0.5}
                onClick={() => {
                  const el = document.getElementById('voice-fir')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}
              />
              <PathwayConnector color="#4CE0FF" />

              {/* Step 3 - Legal Aid */}
              <PathwayStep
                icon={Scale}
                color="#33FFB0"
                title="WBSLSA Legal Aid Scheme"
                desc="Free legal assistance under West Bengal State Legal Services Authority"
                active={activated}
                delay={1}
              />
            </div>

            {/* Info card */}
            <div className="mt-8 p-4 rounded-xl bg-white/5 border border-white/10">
              <h4 className="text-xs font-semibold text-[#FFB84C] uppercase tracking-widest mb-2">Quick Resources</h4>
              <div className="space-y-2">
                {[
                  { label: 'Women Helpline', value: '181', color: '#FF3B5C' },
                  { label: 'Police Emergency', value: '100', color: '#4CE0FF' },
                  { label: 'Cyber Crime', value: '1930', color: '#FFB84C' },
                  { label: 'WBSLSA', value: 'wbslsa.gov.in', color: '#33FFB0' },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between text-xs">
                    <span className="text-white/40">{r.label}</span>
                    <span className="font-mono font-semibold" style={{ color: r.color, fontFamily: "'JetBrains Mono', monospace" }}>
                      {r.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

function PathwayStep({ icon: Icon, color, title, desc, active, delay, onClick }) {
  return (
    <motion.div
      initial={{ opacity: 0.4 }}
      whileInView={{ opacity: active ? 1 : 0.4 }}
      viewport={{ once: true }}
      transition={{ delay }}
      className={`flex items-start gap-4 p-3 rounded-lg transition-all ${onClick ? 'cursor-pointer hover:bg-white/5' : ''}`}
      onClick={onClick}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-white/10"
        style={{ backgroundColor: `${color}15`, boxShadow: active ? `0 0 20px ${color}20` : 'none' }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-white/90">{title}</h4>
        <p className="text-xs text-white/40 mt-0.5">{desc}</p>
        {onClick && (
          <span className="inline-flex items-center gap-1 text-[10px] mt-1" style={{ color }}>
            Go to feature <ArrowRight className="w-3 h-3" />
          </span>
        )}
      </div>
    </motion.div>
  )
}

function PathwayConnector({ color }) {
  return (
    <div className="flex items-center ml-[19px] h-8">
      <motion.div
        className="w-0.5 h-full"
        style={{ backgroundColor: `${color}30` }}
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      />
    </div>
  )
}
