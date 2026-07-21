import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Map, Eye, BarChart3, Clock } from 'lucide-react'
import { useLanguage } from '../App.jsx'

const districts = [
  { name: 'Kolkata', x: 55, y: 72, cyber: 89, crime: 67, disaster: 12, response: '32s', dlsa: '94%' },
  { name: 'Howrah', x: 50, y: 70, cyber: 72, crime: 58, disaster: 8, response: '41s', dlsa: '88%' },
  { name: 'North 24 Parganas', x: 60, y: 62, cyber: 65, crime: 71, disaster: 15, response: '48s', dlsa: '82%' },
  { name: 'South 24 Parganas', x: 55, y: 82, cyber: 45, crime: 52, disaster: 34, response: '67s', dlsa: '71%' },
  { name: 'Hooghly', x: 43, y: 63, cyber: 38, crime: 41, disaster: 6, response: '55s', dlsa: '79%' },
  { name: 'Murshidabad', x: 50, y: 42, cyber: 52, crime: 63, disaster: 22, response: '72s', dlsa: '65%' },
  { name: 'Nadia', x: 55, y: 52, cyber: 41, crime: 38, disaster: 18, response: '58s', dlsa: '76%' },
  { name: 'Bardhaman', x: 38, y: 52, cyber: 35, crime: 44, disaster: 9, response: '62s', dlsa: '73%' },
  { name: 'Malda', x: 45, y: 30, cyber: 28, crime: 55, disaster: 16, response: '78s', dlsa: '61%' },
  { name: 'Jalpaiguri', x: 42, y: 15, cyber: 22, crime: 38, disaster: 25, response: '85s', dlsa: '58%' },
  { name: 'Darjeeling', x: 48, y: 8, cyber: 18, crime: 25, disaster: 31, response: '92s', dlsa: '52%' },
  { name: 'Cooch Behar', x: 58, y: 12, cyber: 15, crime: 32, disaster: 19, response: '88s', dlsa: '55%' },
  { name: 'Siliguri', x: 45, y: 10, cyber: 42, crime: 48, disaster: 14, response: '45s', dlsa: '81%' },
  { name: 'Bankura', x: 30, y: 60, cyber: 18, crime: 35, disaster: 7, response: '75s', dlsa: '67%' },
  { name: 'Purulia', x: 22, y: 58, cyber: 12, crime: 42, disaster: 5, response: '95s', dlsa: '54%' },
  { name: 'Birbhum', x: 35, y: 45, cyber: 25, crime: 39, disaster: 11, response: '68s', dlsa: '69%' },
  { name: 'Medinipur West', x: 28, y: 72, cyber: 21, crime: 38, disaster: 9, response: '71s', dlsa: '72%' },
  { name: 'Medinipur East', x: 38, y: 78, cyber: 19, crime: 33, disaster: 11, response: '65s', dlsa: '74%' },
  { name: 'Dakshin Dinajpur', x: 43, y: 25, cyber: 16, crime: 29, disaster: 13, response: '82s', dlsa: '60%' },
  { name: 'Uttar Dinajpur', x: 42, y: 20, cyber: 14, crime: 34, disaster: 17, response: '88s', dlsa: '56%' },
  { name: 'Alipurduar', x: 55, y: 10, cyber: 10, crime: 22, disaster: 28, response: '96s', dlsa: '48%' },
]

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']

function getColor(type, value) {
  const alpha = Math.min(value / 100, 1)
  if (type === 'cyber') return `rgba(76, 224, 255, ${alpha})`
  if (type === 'crime') return `rgba(255, 59, 92, ${alpha})`
  return `rgba(255, 184, 76, ${alpha})`
}

export default function CrimeHeatmap() {
  const { t } = useLanguage()
  const [hoveredDistrict, setHoveredDistrict] = useState(null)
  const [viewMode, setViewMode] = useState('citizen')
  const [timelineIdx, setTimelineIdx] = useState(6)
  const [activeType, setActiveType] = useState('cyber')

  return (
    <section id="heatmap" className="relative z-10 py-20 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FFB84C]/10 border border-[#FFB84C]/20 text-[#FFB84C] text-xs font-semibold uppercase tracking-widest mb-4">
            <Map className="w-3.5 h-3.5" />
            {t.feature3}
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Crime &amp; Fraud Risk <span className="text-[#FFB84C]">Heatmap</span>
          </h2>
        </motion.div>

        {/* Controls */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-wrap items-center justify-between gap-4 mb-8"
        >
          {/* Data type toggle */}
          <div className="flex gap-2">
            {[
              { key: 'cyber', label: 'Cyber Fraud', color: '#4CE0FF' },
              { key: 'crime', label: 'Crime', color: '#FF3B5C' },
              { key: 'disaster', label: 'Disaster Claims', color: '#FFB84C' },
            ].map(dt => (
              <button
                key={dt.key}
                onClick={() => setActiveType(dt.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                  activeType === dt.key
                    ? 'border-white/20 bg-white/10 text-white'
                    : 'border-white/5 bg-white/5 text-white/40 hover:text-white/60'
                }`}
              >
                <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: dt.color }} />
                {dt.label}
              </button>
            ))}
          </div>

          {/* View mode */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/5 border border-white/10">
            <button
              onClick={() => setViewMode('citizen')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all cursor-pointer ${
                viewMode === 'citizen' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> Citizen
            </button>
            <button
              onClick={() => setViewMode('admin')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all cursor-pointer ${
                viewMode === 'admin' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Admin / District
            </button>
          </div>
        </motion.div>

        {/* Map Area */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="relative rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-8 overflow-hidden"
          style={{ minHeight: '500px' }}
        >
          {/* State outline shape (stylized) */}
          <svg viewBox="0 0 100 100" className="w-full h-[450px] opacity-10 absolute inset-0 m-auto">
            <path
              d="M45 5 Q55 3 60 8 L62 15 Q65 18 60 22 L58 30 Q62 35 55 42 L58 50 Q62 55 58 62 L62 68 Q60 75 58 78 L55 85 Q50 92 45 88 L40 82 Q35 78 30 75 L25 68 Q22 62 25 55 L28 50 Q25 45 30 38 L35 30 Q38 22 42 18 L45 12 Z"
              fill="none"
              stroke="white"
              strokeWidth="0.5"
            />
          </svg>

          {/* District dots */}
          {districts.map((d, i) => {
            const value = d[activeType]
            const scale = Math.max(0.5, value / 50)
            const monthMultiplier = 0.5 + (timelineIdx / 6) * 0.5 + (Math.sin(i + timelineIdx) * 0.2)
            const adjustedValue = Math.min(100, Math.floor(value * monthMultiplier))

            return (
              <motion.div
                key={d.name}
                className="absolute cursor-pointer"
                style={{ left: `${d.x}%`, top: `${d.y}%`, transform: 'translate(-50%, -50%)' }}
                onMouseEnter={() => setHoveredDistrict(d)}
                onMouseLeave={() => setHoveredDistrict(null)}
                initial={{ scale: 0, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.03 }}
              >
                {/* Pulse ring */}
                <motion.div
                  className="absolute rounded-full"
                  style={{
                    width: scale * 50,
                    height: scale * 50,
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: getColor(activeType, adjustedValue),
                  }}
                  animate={{
                    scale: [1, 1.5, 1],
                    opacity: [0.6, 0.1, 0.6],
                  }}
                  transition={{
                    duration: 2 + Math.random(),
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
                {/* Core dot */}
                <div
                  className="relative w-3 h-3 rounded-full border border-white/20"
                  style={{
                    backgroundColor: getColor(activeType, adjustedValue),
                    boxShadow: `0 0 ${adjustedValue / 3}px ${getColor(activeType, adjustedValue)}`,
                  }}
                />
                {/* Label (admin only) */}
                {viewMode === 'admin' && (
                  <div className="absolute top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-white/40">
                    {d.name}
                  </div>
                )}
              </motion.div>
            )
          })}

          {/* Tooltip */}
          <AnimatePresence>
            {hoveredDistrict && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed z-50 p-4 rounded-xl bg-[#0a0e1a]/95 backdrop-blur-2xl border border-white/15 shadow-2xl pointer-events-none"
                style={{
                  left: `${hoveredDistrict.x}%`,
                  top: '20%',
                  minWidth: '220px',
                }}
              >
                <h4 className="text-sm font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {hoveredDistrict.name}
                </h4>
                <div className="space-y-1.5">
                  <StatRow label="Cyber Fraud" value={hoveredDistrict.cyber} color="#4CE0FF" viewMode={viewMode} />
                  <StatRow label="Crime Index" value={hoveredDistrict.crime} color="#FF3B5C" viewMode={viewMode} />
                  <StatRow label="Disaster Claims" value={hoveredDistrict.disaster} color="#FFB84C" viewMode={viewMode} />
                  <div className="border-t border-white/10 pt-1.5 mt-1.5">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-white/40">Avg Response</span>
                      <span className="text-white/70 font-mono">{hoveredDistrict.response}</span>
                    </div>
                    {viewMode === 'admin' && (
                      <div className="flex justify-between text-[10px]">
                        <span className="text-white/40">DLSA Coverage</span>
                        <span className="text-[#33FFB0] font-mono">{hoveredDistrict.dlsa}</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Timeline Scrubber */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-6 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 p-4"
        >
          <div className="flex items-center gap-4">
            <Clock className="w-4 h-4 text-white/40" />
            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={6}
                value={timelineIdx}
                onChange={e => setTimelineIdx(Number(e.target.value))}
                className="w-full accent-[#4CE0FF] cursor-pointer"
                id="timeline-scrubber"
              />
              <div className="flex justify-between text-[10px] text-white/30 mt-1">
                {months.map(m => <span key={m}>{m}</span>)}
              </div>
            </div>
            <span className="text-xs text-[#4CE0FF] font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {months[timelineIdx]} 2026
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function StatRow({ label, value, color, viewMode }) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-white/40">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-white/70 font-mono">{value}</span>
        {viewMode === 'admin' && (
          <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
          </div>
        )}
      </div>
    </div>
  )
}
