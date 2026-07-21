import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, BookOpen, Scale, Copy, Check, Filter, ShieldCheck, Tag } from 'lucide-react'
import { useLanguage } from '../App.jsx'

const legalGlossaryData = [
  {
    id: 'art-21',
    code: 'Article 21',
    act: 'Constitution of India',
    title: 'Protection of Life and Personal Liberty',
    category: 'Constitution',
    summary: 'No person shall be deprived of his life or personal liberty except according to procedure established by law.',
    details: 'Covers fundamental human rights including right to privacy, right to clean environment, right to legal aid, and protection against custodial torture.',
    penalty: 'Constitutional Guarantee — Enforceable via Writ Petition in High Court (Art 226) or Supreme Court (Art 32).'
  },
  {
    id: 'art-22',
    code: 'Article 22',
    act: 'Constitution of India',
    title: 'Protection Against Arrest and Detention',
    category: 'Constitution',
    summary: 'Mandates right to be informed of arrest grounds, right to lawyer consultation, and production before Magistrate within 24 hours.',
    details: 'Prevents arbitrary police detention and guarantees fundamental safeguards for arrested individuals.',
    penalty: 'Constitutional Mandate — Unlawful detention leads to immediate Habeas Corpus writ.'
  },
  {
    id: 'bns-318',
    code: 'BNS Section 318',
    act: 'Bharatiya Nyaya Sanhita (BNS 2023)',
    title: 'Cheating and Dishonestly Inducing Delivery of Property',
    category: 'Cyber & Financial Crime',
    summary: 'Replaces IPC Section 420. Outlaws cheating, fraudulent inducement, and financial deception.',
    details: 'Applies to bank fraud, online phishing, fake investment schemes, and impersonation scams.',
    penalty: 'Imprisonment up to 7 years + fine.'
  },
  {
    id: 'bns-356',
    code: 'BNS Section 356',
    act: 'Bharatiya Nyaya Sanhita (BNS 2023)',
    title: 'Snatching',
    category: 'Criminal Offence',
    summary: 'Newly introduced explicit section defining theft by sudden or forcible snatching of property.',
    details: 'Covers chain snatching, phone snatching, and handbag theft on public streets.',
    penalty: 'Rigorous imprisonment up to 3 years + mandatory fine.'
  },
  {
    id: 'bns-74',
    code: 'BNS Section 74',
    act: 'Bharatiya Nyaya Sanhita (BNS 2023)',
    title: 'Assault or Criminal Force to Woman to Outrage Modesty',
    category: 'Women Protection',
    summary: 'Replaces IPC Section 354. Punishes any assault or criminal force intended to outrage female modesty.',
    details: 'Covers physical intimidation, non-consensual physical contact, and indecent aggression.',
    penalty: 'Imprisonment for minimum 1 year extending up to 5 years + fine.'
  },
  {
    id: 'bns-78',
    code: 'BNS Section 78',
    act: 'Bharatiya Nyaya Sanhita (BNS 2023)',
    title: 'Stalking',
    category: 'Women Protection',
    summary: 'Replaces IPC Section 354D. Outlaws physical or electronic monitoring/following of a woman.',
    details: 'Includes cyberstalking, social media harassment, persistent unwanted contact, and location tracking.',
    penalty: 'First offense: up to 3 years imprisonment. Repeat offense: up to 5 years imprisonment.'
  },
  {
    id: 'bnss-173',
    code: 'BNSS Section 173',
    act: 'Bharatiya Nagarik Suraksha Sanhita (BNSS 2023)',
    title: 'Information in Cognizable Cases & Zero FIR',
    category: 'Criminal Procedure',
    summary: 'Replaces CrPC Section 154. Explicitly mandates registration of Zero FIR regardless of territorial jurisdiction.',
    details: 'Allows crime victims to register complaints electronically or at the nearest police station immediately.',
    penalty: 'Police failure to record complaint violates statutory duty under BNS Section 199.'
  },
  {
    id: 'it-66d',
    code: 'Section 66D',
    act: 'Information Technology Act, 2000',
    title: 'Punishment for Cheating by Impersonation using Computer Resource',
    category: 'Cyber & Financial Crime',
    summary: 'Outlaws cheating via spoofed UPI IDs, fake bank websites, or impersonating bank officials.',
    details: 'Covers Digital Arrest scams, fake call center fraud, and online lottery tricks.',
    penalty: 'Imprisonment up to 3 years + fine up to ₹1,000,000.'
  },
  {
    id: 'it-66c',
    code: 'Section 66C',
    act: 'Information Technology Act, 2000',
    title: 'Punishment for Identity Theft',
    category: 'Cyber & Financial Crime',
    summary: 'Punishes fraudulent use of electronic signatures, passwords, or unique identification features.',
    details: 'Covers SIM swap fraud, password hacking, and stolen Aadhaar/PAN misuse.',
    penalty: 'Imprisonment up to 3 years + fine up to ₹100,000.'
  },
  {
    id: 'cp-35',
    code: 'Section 35',
    act: 'Consumer Protection Act, 2019',
    title: 'Manner in which Complaint shall be made to District Commission',
    category: 'Consumer Rights',
    summary: 'Grants every consumer the right to file grievances against defective goods or deficient services.',
    details: 'Allows filing via e-Daakhil portal without requiring mandatory advocate representation.',
    penalty: 'District Commission can order full refund, replacement, and compensation for mental agony.'
  }
]

const categories = ['All', 'Constitution', 'BNS / Criminal Law', 'Cyber & Financial Crime', 'Women Protection', 'Consumer Rights']

export default function LegalGlossary() {
  const { lang, t } = useLanguage()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [copiedId, setCopiedId] = useState(null)

  const filteredItems = legalGlossaryData.filter(item => {
    const matchesSearch = item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.act.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.summary.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCat = selectedCategory === 'All' || item.category.includes(selectedCategory.split(' ')[0])
    return matchesSearch && matchesCat
  })

  const copyCitation = (item) => {
    const text = `${item.code} - ${item.title} (${item.act}): ${item.summary}`
    navigator.clipboard.writeText(text)
    setCopiedId(item.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <section className="relative z-10 py-8 px-4 md:px-8 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FFB84C]/10 border border-[#FFB84C]/20 text-[#FFB84C] text-xs font-semibold uppercase tracking-widest mb-3">
          <BookOpen className="w-4 h-4" />
          Indian Legal Code Glossary
        </div>
        <h2 className="text-3xl md:text-5xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Nyaya <span className="text-[#FFB84C]">Kosh</span>
        </h2>
        <p className="text-sm text-white/50 max-w-xl mx-auto">
          Search Articles of the Constitution of India, BNS 2023, BNSS, IT Act, and Consumer Protection laws in simple plain language.
        </p>
      </motion.div>

      {/* Search & Category Filter Bar */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-8 space-y-4"
      >
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-5 h-5 text-white/40 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Section 318, Article 21, IT Act 66D, Stalking, Zero FIR..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-[#FFB84C]/50 transition-colors backdrop-blur-xl"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/40 hover:text-white cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#FFB84C] text-[#05070d] border-[#FFB84C] shadow-md'
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Grid of Legal Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredItems.map((item, idx) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="p-6 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-sm font-bold px-3 py-1 rounded-lg bg-[#FFB84C]/15 border border-[#FFB84C]/30 text-[#FFB84C] font-mono">
                  {item.code}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-white/40 font-mono">
                  {item.act}
                </span>
              </div>

              <h3 className="text-base font-bold text-white mb-2 group-hover:text-[#FFB84C] transition-colors" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {item.title}
              </h3>

              <p className="text-xs text-white/80 leading-relaxed mb-3">
                {item.summary}
              </p>

              <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-[11px] text-white/60 mb-4 space-y-1.5">
                <p><strong>Scope:</strong> {item.details}</p>
                <p className="text-[#33FFB0]"><strong>Penalty / Legal Effect:</strong> {item.penalty}</p>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-[10px] text-white/40 flex items-center gap-1">
                <Tag className="w-3 h-3 text-[#FFB84C]" /> {item.category}
              </span>
              <button
                onClick={() => copyCitation(item)}
                className="flex items-center gap-1.5 text-xs text-[#FFB84C] hover:underline cursor-pointer"
              >
                {copiedId === item.id ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#33FFB0]" />
                    <span className="text-[#33FFB0]">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Citation</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        ))}

        {filteredItems.length === 0 && (
          <div className="col-span-full py-12 text-center rounded-2xl bg-white/5 border border-white/10 text-white/40">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No Sections or Articles found matching "{searchTerm}". Try searching for BNS, IT Act, or Article 21.
          </div>
        )}
      </div>
    </section>
  )
}
