import { motion } from 'framer-motion'
import { Shield, Scale, ExternalLink } from 'lucide-react'
import { useLanguage } from '../App.jsx'

const partners = [
  { name: 'WBSLSA', full: 'West Bengal State Legal Services Authority' },
  { name: 'WB Cyber Crime Wing', full: 'West Bengal Cyber Crime Investigation Cell' },
  { name: 'SDMA', full: 'State Disaster Management Authority' },
  { name: 'eCourts', full: 'National e-Courts Services' },
  { name: 'NCRP', full: 'National Cyber Crime Reporting Portal' },
]

export default function Footer() {
  const { t } = useLanguage()

  return (
    <footer className="relative z-10 py-16 px-4 md:px-8 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        {/* Partners */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12"
        >
          <p className="text-xs text-white/30 uppercase tracking-widest text-center mb-6">
            Integration Partners
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {partners.map(p => (
              <div
                key={p.name}
                className="group px-4 py-2 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 hover:bg-white/8 transition-all cursor-default"
                title={p.full}
              >
                <span className="text-xs text-white/50 group-hover:text-white/70 transition-colors">{p.name}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Disclaimer */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mb-8 p-4 rounded-xl bg-[#FFB84C]/5 border border-[#FFB84C]/15 max-w-2xl mx-auto"
        >
          <p className="text-sm text-[#FFB84C]/80 font-medium">
            ⚠️ {t.disclaimer}
          </p>
          <p className="text-[10px] text-white/25 mt-1">
            LawAI Bengal provides AI-assisted guidance and does not replace licensed legal professionals or certified government services.
          </p>
        </motion.div>

        {/* Bottom bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div className="relative w-6 h-6 flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#4CE0FF]/40 absolute" strokeWidth={1.5} />
              <Scale className="w-3 h-3 text-[#4CE0FF]/40 absolute" strokeWidth={2} />
            </div>
            <span className="text-xs text-white/30" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              LawAI Bengal — The Legal Intelligence Grid
            </span>
          </div>

          <p className="text-[10px] text-white/20">
            Built for civic impact • Hackathon Demo 2026 • No real data is processed
          </p>
        </div>
      </div>
    </footer>
  )
}
