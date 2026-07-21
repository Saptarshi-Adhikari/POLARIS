import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ShieldAlert, Mic, Map, Heart, Search, ArrowRight } from 'lucide-react'
import { useLanguage, useNavigation } from '../App.jsx'

function AnimatedCounter({ end, duration = 2000, prefix = '', suffix = '' }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let start = 0
    const step = end / (duration / 16)
    const timer = setInterval(() => {
      start += step
      if (start >= end) {
        setCount(end)
        clearInterval(timer)
      } else {
        setCount(Math.floor(start))
      }
    }, 16)
    return () => clearInterval(timer)
  }, [end, duration])

  return (
    <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      {prefix}{count.toLocaleString()}{suffix}
    </span>
  )
}

function LiveCounter({ end, duration, prefix, suffix, label }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="text-center"
    >
      <div className="text-3xl md:text-4xl font-bold text-[#4CE0FF] drop-shadow-[0_0_20px_rgba(76,224,255,0.3)]">
        <AnimatedCounter end={end} duration={duration} prefix={prefix} suffix={suffix} />
      </div>
      <div className="text-xs text-white/50 mt-1 uppercase tracking-wider">{label}</div>
    </motion.div>
  )
}

const featureCards = [
  { id: 'cyber-fraud', icon: ShieldAlert, color: '#FF3B5C', label: 'feature1', desc: 'feature1desc' },
  { id: 'voice-fir', icon: Mic, color: '#4CE0FF', label: 'feature2', desc: 'feature2desc' },
  { id: 'heatmap', icon: Map, color: '#FFB84C', label: 'feature3', desc: 'feature3desc' },
  { id: 'women-safety', icon: Heart, color: '#FF3B5C', label: 'feature4', desc: 'feature4desc' },
  { id: 'evidence', icon: Search, color: '#33FFB0', label: 'feature5', desc: 'feature5desc' },
]

export default function HeroSection() {
  const { t } = useLanguage()
  const [casesToday, setCasesToday] = useState(1247)

  useEffect(() => {
    const interval = setInterval(() => {
      setCasesToday(prev => prev + Math.floor(Math.random() * 3) + 1)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <section className="relative z-10 pt-12 pb-20 px-4 md:px-8">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.2 }}
        className="max-w-5xl mx-auto text-center mb-16"
      >
        <h2
          className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          <span className="bg-gradient-to-r from-[#4CE0FF] via-white to-[#33FFB0] bg-clip-text text-transparent">
            {t.tagline}
          </span>
        </h2>
        <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto">
          {t.subtitle}
        </p>
      </motion.div>

      {/* Live Counters */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.4 }}
        className="max-w-3xl mx-auto mb-16 grid grid-cols-3 gap-8 p-6 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10"
      >
        <LiveCounter end={casesToday} duration={2500} label={t.casesRouted} />
        <LiveCounter end={47} duration={1500} suffix="s" label={t.avgResponse} />
        <LiveCounter end={23} duration={1800} label={t.districtsCovered} />
      </motion.div>

      {/* Feature Cards Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {featureCards.map((card, i) => (
          <FeatureCard key={card.id} card={card} index={i} t={t} />
        ))}
      </div>
    </section>
  )
}

function FeatureCard({ card, index, t }) {
  const [hovered, setHovered] = useState(false)
  const { setActivePage } = useNavigation()
  const Icon = card.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      whileHover={{ y: -8, scale: 1.02 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => setActivePage(card.id)}
      className={`relative group cursor-pointer p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl transition-all duration-300 overflow-hidden ${
        index === 0 ? 'md:col-span-2 lg:col-span-1' : ''
      }`}
      style={{
        boxShadow: hovered ? `0 0 40px ${card.color}15, inset 0 1px 0 rgba(255,255,255,0.1)` : 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `radial-gradient(circle at 50% 50%, ${card.color}08, transparent 70%)` }}
      />
      <div className="relative z-10">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 border border-white/10"
          style={{ backgroundColor: `${card.color}15` }}
        >
          <Icon className="w-6 h-6" style={{ color: card.color }} />
        </div>
        <h3 className="text-lg font-semibold mb-2 text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {t[card.label]}
        </h3>
        <p className="text-sm text-white/40 mb-4 leading-relaxed">{t[card.desc]}</p>
        <div className="flex items-center gap-2 text-sm font-medium" style={{ color: card.color }}>
          <span>{t.lang === 'bn' ? 'অন্বেষণ করুন' : 'Explore'}</span>
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </motion.div>
  )
}
