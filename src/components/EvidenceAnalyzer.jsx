import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Upload, FileImage, CheckCircle, AlertTriangle, Info, Shield } from 'lucide-react'
import { useLanguage } from '../App.jsx'

const analysisResults = [
  { label: 'Metadata', status: 'pass', detail: 'EXIF data consistent — creation date matches', icon: CheckCircle, delay: 1500 },
  { label: 'Font Analysis', status: 'warn', detail: 'Font mismatch detected in paragraph 3, line 7', icon: AlertTriangle, delay: 2500 },
  { label: 'Clone Detection', status: 'pass', detail: 'No copy-paste artifacts found', icon: CheckCircle, delay: 3500 },
  { label: 'Resolution', status: 'pass', detail: '300 DPI — consistent with original scan', icon: CheckCircle, delay: 4200 },
  { label: 'Digital Signature', status: 'pass', detail: 'Hash verification: SHA-256 match confirmed', icon: CheckCircle, delay: 5000 },
  { label: 'Compression', status: 'warn', detail: 'Multiple JPEG saves detected (quality levels vary)', icon: AlertTriangle, delay: 5800 },
]

function ScanLine({ active }) {
  if (!active) return null
  return (
    <motion.div
      className="absolute left-0 right-0 h-0.5 z-20"
      style={{
        background: 'linear-gradient(90deg, transparent 0%, #4CE0FF 30%, #4CE0FF 70%, transparent 100%)',
        boxShadow: '0 0 20px rgba(76,224,255,0.6), 0 0 60px rgba(76,224,255,0.2)',
      }}
      initial={{ top: '0%' }}
      animate={{ top: ['0%', '100%', '0%'] }}
      transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
    />
  )
}

function MockDocument() {
  return (
    <div className="relative w-full aspect-[3/4] bg-white/[0.03] rounded-lg border border-white/10 overflow-hidden p-4 text-left">
      {/* Fake document lines */}
      <div className="space-y-2">
        <div className="h-5 w-3/4 bg-white/10 rounded" />
        <div className="h-3 w-full bg-white/5 rounded" />
        <div className="h-3 w-full bg-white/5 rounded" />
        <div className="h-3 w-5/6 bg-white/5 rounded" />
        <div className="h-4 w-1/2 bg-white/8 rounded mt-4" />
        <div className="h-3 w-full bg-white/5 rounded" />
        <div className="h-3 w-full bg-white/5 rounded" />
        {/* Flagged region */}
        <div className="relative">
          <div className="h-3 w-4/5 bg-white/5 rounded" />
          <motion.div
            className="absolute -inset-1 border-2 border-[#FFB84C] rounded bg-[#FFB84C]/5"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: [0, 1, 1], scale: [0.8, 1, 1] }}
            transition={{ duration: 1, delay: 3 }}
          >
            <span className="absolute -top-4 left-0 text-[8px] text-[#FFB84C] bg-[#FFB84C]/20 px-1 rounded">
              ⚠️ Font mismatch
            </span>
          </motion.div>
        </div>
        <div className="h-3 w-full bg-white/5 rounded" />
        <div className="h-3 w-3/4 bg-white/5 rounded" />
        <div className="h-4 w-1/3 bg-white/8 rounded mt-4" />
        <div className="h-3 w-full bg-white/5 rounded" />
        <div className="h-3 w-2/3 bg-white/5 rounded" />
      </div>

      {/* Stamp area */}
      <div className="absolute bottom-4 right-4 w-16 h-16 rounded-full border-2 border-white/10 flex items-center justify-center">
        <span className="text-[8px] text-white/20 text-center">SEAL</span>
      </div>
    </div>
  )
}

export default function EvidenceAnalyzer() {
  const { t } = useLanguage()
  const [scanning, setScanning] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [visibleResults, setVisibleResults] = useState(0)

  const startScan = () => {
    if (scanning) return
    setScanning(true)
    setCompleted(false)
    setVisibleResults(0)

    // Show results one by one
    analysisResults.forEach((r, i) => {
      setTimeout(() => {
        setVisibleResults(prev => prev + 1)
      }, r.delay)
    })

    // Complete scan
    setTimeout(() => {
      setScanning(false)
      setCompleted(true)
    }, 6500)
  }

  const reset = () => {
    setScanning(false)
    setCompleted(false)
    setVisibleResults(0)
  }

  return (
    <section id="evidence" className="relative z-10 py-20 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#33FFB0]/10 border border-[#33FFB0]/20 text-[#33FFB0] text-xs font-semibold uppercase tracking-widest mb-4">
            <Search className="w-3.5 h-3.5" />
            {t.feature5}
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Evidence &amp; Document <span className="text-[#33FFB0]">Analyzer</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left - Upload & Document Preview */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            {/* Upload Zone */}
            <div
              onClick={startScan}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); startScan() }}
              className={`relative rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-300 ${
                dragOver
                  ? 'border-[#4CE0FF] bg-[#4CE0FF]/5'
                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
              } backdrop-blur-xl`}
              id="upload-zone"
            >
              <Upload className={`w-10 h-10 mx-auto mb-3 transition-colors ${
                dragOver ? 'text-[#4CE0FF]' : 'text-white/30'
              }`} />
              <p className="text-sm text-white/50 mb-1">Drag & drop document or click to scan</p>
              <p className="text-[10px] text-white/25">Supports images, PDFs, scanned documents</p>

              {scanning && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 6 }}
                  className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-[#4CE0FF] to-[#33FFB0]"
                />
              )}
            </div>

            {/* Document Preview */}
            <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileImage className="w-4 h-4 text-white/40" />
                  <span className="text-xs text-white/40">sale_deed_2024.pdf — Page 1 of 3</span>
                </div>
                {scanning && (
                  <motion.span
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="text-[10px] text-[#4CE0FF] font-mono"
                  >
                    SCANNING...
                  </motion.span>
                )}
              </div>

              <div className="relative">
                <ScanLine active={scanning} />
                <MockDocument />
              </div>
            </div>
          </motion.div>

          {/* Right - Results */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            {/* Results Panel */}
            <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-semibold text-[#4CE0FF] uppercase tracking-widest" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Forensic Analysis Results
                </h3>
                {completed && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-[#33FFB0]/10 border border-[#33FFB0]/20 text-[#33FFB0]"
                  >
                    SCAN COMPLETE
                  </motion.span>
                )}
              </div>

              <div className="space-y-3">
                {analysisResults.map((result, i) => {
                  const visible = i < visibleResults
                  const Icon = result.icon
                  const isWarn = result.status === 'warn'

                  return (
                    <AnimatePresence key={result.label}>
                      {visible && (
                        <motion.div
                          initial={{ opacity: 0, x: 30, scale: 0.9 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          transition={{ type: 'spring', stiffness: 200 }}
                          className={`flex items-start gap-3 p-3 rounded-lg border ${
                            isWarn
                              ? 'bg-[#FFB84C]/5 border-[#FFB84C]/20'
                              : 'bg-[#33FFB0]/5 border-[#33FFB0]/20'
                          }`}
                        >
                          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${
                            isWarn ? 'text-[#FFB84C]' : 'text-[#33FFB0]'
                          }`} />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-white/80">{result.label}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                                isWarn
                                  ? 'bg-[#FFB84C]/20 text-[#FFB84C]'
                                  : 'bg-[#33FFB0]/20 text-[#33FFB0]'
                              }`}>
                                {isWarn ? '⚠️ FLAGGED' : '✅ PASS'}
                              </span>
                            </div>
                            <p className="text-[11px] text-white/40 mt-0.5">{result.detail}</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )
                })}

                {visibleResults === 0 && !scanning && (
                  <div className="text-center py-8 text-white/20 text-sm">
                    Upload a document to begin analysis
                  </div>
                )}
              </div>
            </div>

            {/* Disclaimer */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="rounded-xl bg-[#FFB84C]/5 border border-[#FFB84C]/20 p-4 flex items-start gap-3"
            >
              <Info className="w-5 h-5 text-[#FFB84C] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-[#FFB84C] mb-1">
                  Flagged for human review — not a legal verdict
                </p>
                <p className="text-xs text-white/40 leading-relaxed">
                  This AI-powered analysis highlights potential inconsistencies but does not constitute forensic certification. All flagged regions require examination by a certified forensic document examiner before use as evidence.
                </p>
              </div>
            </motion.div>

            {/* Confidence Score */}
            <AnimatePresence>
              {completed && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-white/40">Overall Authenticity Confidence</span>
                    <span className="text-lg font-bold text-[#FFB84C]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      76%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: '76%' }}
                      transition={{ duration: 1.5, ease: 'easeOut' }}
                      className="h-full rounded-full bg-gradient-to-r from-[#FFB84C] to-[#33FFB0]"
                    />
                  </div>
                  <p className="text-[10px] text-white/25 mt-2">
                    2 of 6 checks flagged — manual review recommended
                  </p>

                  <button
                    onClick={reset}
                    className="w-full mt-3 text-xs text-white/30 hover:text-white/60 transition-colors text-center cursor-pointer py-2"
                  >
                    Reset & Scan Another
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
