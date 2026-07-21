import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, MessageCircle, AlertTriangle, User, FileText } from 'lucide-react'
import { useLanguage } from '../App.jsx'

const mockTranscript = "My name is Rina Mondal. On July 19th, around 8:30 PM, I was walking near Park Street, Kolkata when two men on a motorcycle snatched my gold chain. I screamed for help but they fled towards AJC Bose Road. I immediately called the police. The chain was worth approximately 45,000 rupees. I can identify one of them — he had a scar on his left cheek."

const firFields = [
  { label: 'WHO (Complainant)', value: 'Rina Mondal', icon: User },
  { label: 'WHAT (Offence)', value: 'Chain snatching — IPC Section 356/379', icon: FileText },
  { label: 'WHEN (Date & Time)', value: '19 July 2026, ~20:30 IST', icon: FileText },
  { label: 'WHERE (Location)', value: 'Park Street, near Metro Station, Kolkata', icon: FileText },
  { label: 'HOW (Modus Operandi)', value: 'Two men on motorcycle, snatched gold chain, fled via AJC Bose Road', icon: FileText },
  { label: 'IDENTIFYING MARKS', value: 'Suspect 1: scar on left cheek', icon: User },
  { label: 'ESTIMATED LOSS', value: '₹45,000 (Gold chain)', icon: FileText },
]

const whatsAppMessages = [
  { type: 'received', text: '🎤 Voice note (0:34)', isVoice: true, time: '8:47 PM' },
  { type: 'sent', text: 'Analyzing your voice complaint...', time: '8:47 PM' },
  { type: 'sent', text: '✅ FIR draft generated. Please review the details below.', time: '8:48 PM' },
]

function WaveformVisualizer({ active }) {
  return (
    <div className="flex items-center justify-center gap-[3px] h-16">
      {Array.from({ length: 24 }).map((_, i) => (
        <motion.div
          key={i}
          className="w-1.5 rounded-full bg-gradient-to-t from-[#4CE0FF] to-[#33FFB0]"
          animate={active ? {
            height: [6, Math.random() * 50 + 10, 6],
            opacity: [0.4, 1, 0.4],
          } : { height: 6, opacity: 0.2 }}
          transition={{
            duration: 0.4 + Math.random() * 0.4,
            repeat: active ? Infinity : 0,
            ease: 'easeInOut',
            delay: i * 0.03,
          }}
        />
      ))}
    </div>
  )
}

export default function VoiceFIR() {
  const { t } = useLanguage()
  const [recording, setRecording] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const [transcriptText, setTranscriptText] = useState('')
  const [showFIR, setShowFIR] = useState(false)
  const [visibleFields, setVisibleFields] = useState(0)

  const startRecording = () => {
    setRecording(true)
    setShowTranscript(false)
    setShowFIR(false)
    setTranscriptText('')
    setVisibleFields(0)

    // Auto-stop after 3 seconds
    setTimeout(() => {
      setRecording(false)
      setShowTranscript(true)
      // Typewriter transcript
      let i = 0
      const timer = setInterval(() => {
        i += 2
        setTranscriptText(mockTranscript.slice(0, i))
        if (i >= mockTranscript.length) {
          clearInterval(timer)
          // Show FIR fields with stagger
          setTimeout(() => {
            setShowFIR(true)
            firFields.forEach((_, idx) => {
              setTimeout(() => setVisibleFields(prev => prev + 1), idx * 400)
            })
          }, 800)
        }
      }, 20)
    }, 3000)
  }

  return (
    <section id="voice-fir" className="relative z-10 py-20 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#4CE0FF]/10 border border-[#4CE0FF]/20 text-[#4CE0FF] text-xs font-semibold uppercase tracking-widest mb-4">
            <Mic className="w-3.5 h-3.5" />
            {t.feature2}
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Voice FIR + WhatsApp <span className="text-[#4CE0FF]">Parser</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recording Console */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-8 flex flex-col items-center"
          >
            <h3 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-6" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Recording Console
            </h3>

            <motion.button
              onClick={startRecording}
              disabled={recording}
              whileHover={!recording ? { scale: 1.05 } : {}}
              whileTap={!recording ? { scale: 0.95 } : {}}
              className={`relative w-28 h-28 rounded-full flex items-center justify-center cursor-pointer mb-6 ${
                recording ? '' : 'hover:shadow-[0_0_40px_rgba(76,224,255,0.3)]'
              }`}
              id="mic-button"
            >
              {recording && (
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-[#FF3B5C]"
                  animate={{ scale: [1, 1.4, 1], opacity: [0.8, 0, 0.8] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
              <div className={`absolute inset-2 rounded-full flex items-center justify-center transition-colors duration-300 ${
                recording
                  ? 'bg-gradient-to-br from-[#FF3B5C] to-[#cc1e3a] shadow-[0_0_40px_rgba(255,59,92,0.5)]'
                  : 'bg-gradient-to-br from-[#4CE0FF] to-[#33FFB0] shadow-[0_0_40px_rgba(76,224,255,0.3)]'
              }`}>
                {recording ? <MicOff className="w-10 h-10 text-white" /> : <Mic className="w-10 h-10 text-white" />}
              </div>
            </motion.button>

            <WaveformVisualizer active={recording} />

            <p className="text-xs text-white/30 mt-4 text-center">
              {recording ? 'Recording... speak your complaint' : 'Tap to start voice recording'}
            </p>

            {/* WhatsApp Chat Mockup */}
            <div className="w-full mt-8 rounded-xl bg-[#0b141a] border border-white/10 overflow-hidden">
              <div className="bg-[#1f2c34] px-4 py-2 flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-[#25D366]" />
                <span className="text-xs text-white/60">WhatsApp Parser</span>
              </div>
              <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
                {whatsAppMessages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.2 }}
                    className={`flex ${msg.type === 'sent' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] px-3 py-2 rounded-lg text-xs ${
                      msg.type === 'sent'
                        ? 'bg-[#005c4b] text-white/90'
                        : 'bg-[#1f2c34] text-white/80'
                    }`}>
                      {msg.isVoice && (
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex gap-0.5">
                            {Array.from({ length: 20 }).map((_, j) => (
                              <div key={j} className="w-0.5 bg-white/40 rounded-full" style={{ height: `${Math.random() * 12 + 3}px` }} />
                            ))}
                          </div>
                        </div>
                      )}
                      <p>{msg.text}</p>
                      <p className="text-[10px] text-white/30 text-right mt-1">{msg.time}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Transcript + FIR Fields */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2 space-y-6"
          >
            {/* Transcript */}
            <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6">
              <h3 className="text-sm font-semibold text-[#4CE0FF] uppercase tracking-widest mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Live Transcript
              </h3>
              <div className="min-h-[100px] p-4 rounded-lg bg-white/5 border border-white/5 text-sm text-white/70 leading-relaxed">
                {transcriptText || (
                  <span className="text-white/20 italic">Transcript will appear here after recording...</span>
                )}
                {showTranscript && transcriptText.length < mockTranscript.length && (
                  <span className="animate-pulse text-[#4CE0FF]">|</span>
                )}
              </div>
            </div>

            {/* FIR Fields */}
            <AnimatePresence>
              {showFIR && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-[#33FFB0] uppercase tracking-widest" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      AI-Structured FIR Draft
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FFB84C]/10 border border-[#FFB84C]/20 text-[#FFB84C] flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> HUMAN REVIEW REQUIRED
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {firFields.map((field, i) => (
                      <motion.div
                        key={field.label}
                        initial={{ opacity: 0, x: -20, scale: 0.95 }}
                        animate={i < visibleFields ? { opacity: 1, x: 0, scale: 1 } : {}}
                        transition={{ duration: 0.5, type: 'spring' }}
                        className="p-3 rounded-lg bg-white/5 border border-white/10"
                      >
                        <label className="text-[10px] text-[#4CE0FF]/60 uppercase tracking-wider block mb-1">
                          {field.label}
                        </label>
                        <input
                          type="text"
                          defaultValue={i < visibleFields ? field.value : ''}
                          className="w-full bg-transparent text-sm text-white/80 outline-none border-none"
                          readOnly={false}
                        />
                      </motion.div>
                    ))}
                  </div>

                  <div className="mt-4 p-3 rounded-lg bg-[#FFB84C]/5 border border-[#FFB84C]/20 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#FFB84C] mt-0.5 shrink-0" />
                    <p className="text-xs text-[#FFB84C]/80">
                      All fields are editable. AI-assisted draft requires human review before submission to the nearest police station.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
