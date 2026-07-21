import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Send, Sparkles, Scale, BookOpen, AlertTriangle, ArrowRight, User } from 'lucide-react'
import { useLanguage, useNavigation } from '../App.jsx'

const suggestedQuestions = [
  {
    text: "What are my constitutional rights if arrested by police?",
    bnText: "পুলিশ গ্রেপ্তার করলে আমার সাংবিধানিক অধিকার কী কী?",
    category: "Fundamental Rights",
  },
  {
    text: "I was scammed ₹45,000 via UPI. Which Indian laws & sections apply?",
    bnText: "আমার সাথে ৪৫,০০০ টাকার UPI জালিয়াতি হয়েছে। কোন আইন প্রযোজ্য?",
    category: "Cyber Crime",
  },
  {
    text: "What provisions protect women against harassment under BNS?",
    bnText: "BNS-এর অধীনে নারীদের হয়রানি থেকে সুরক্ষার জন্য কী কী বিধান আছে?",
    category: "Women Protection",
  },
  {
    text: "How do I file a Zero FIR under BNSS in West Bengal?",
    bnText: "পশ্চিমবঙ্গে BNSS-এর অধীনে কীভাবে জিরো এফআইআর (Zero FIR) করবেন?",
    category: "Criminal Procedure",
  },
]

const prebuiltAnswers = {
  "What are my constitutional rights if arrested by police?": {
    articles: ["Article 22(1)", "Article 22(2)", "Article 21"],
    sections: ["BNSS Section 35 (Grounds of Arrest)", "BNSS Section 47 (Right to legal practitioner)", "BNSS Section 58 (Medical Examination)"],
    summary: "Under the Constitution of India and Bharatiya Nagarik Suraksha Sanhita (BNSS 2023), every citizen enjoys strict legal protections upon arrest.",
    keyPoints: [
      "Article 22(1): Right to be informed immediately of the grounds of arrest and right to consult a legal practitioner of choice.",
      "Article 22(2) & BNSS Sec 57: Mandatory requirement to produce the arrested person before the nearest Magistrate within 24 hours.",
      "Article 21: Guarantee against unlawful detention or custodial violence (Right to Life & Personal Liberty).",
      "BNSS Sec 47: Right to inform a friend/relative immediately after arrest.",
    ],
    remedy: "Request legal assistance through WBSLSA (West Bengal State Legal Services Authority) or call DLSA Helpline if free legal aid is needed."
  },
  "I was scammed ₹45,000 via UPI. Which Indian laws & sections apply?": {
    articles: ["Article 300A (Right to Property)"],
    sections: ["IT Act Section 66D (Cheating by impersonation)", "BNS Section 318(4) (Cheating)", "IT Act Section 43 (Damage to computer systems)"],
    summary: "Cyber financial fraud using UPI/NetBanking is punishable under both the Information Technology Act 2000 and the Bharatiya Nyaya Sanhita (BNS 2023).",
    keyPoints: [
      "IT Act Sec. 66D: Punishes cheating by impersonation using computer resources with imprisonment up to 3 years and fine.",
      "BNS Sec. 318(4): Criminal cheating causing financial loss; carries imprisonment up to 7 years.",
      "NCRP Protocol: Immediate reporting within 2 hours ('Golden Hour') via 1930 Helpline allows bank payment lien freezing.",
    ],
    remedy: "Dial 1930 or file complaint on cybercrime.gov.in. Retain UPI Transaction Reference ID (UTR) as evidence."
  },
  "What provisions protect women against harassment under BNS?": {
    articles: ["Article 14 (Equality before law)", "Article 15(3) (Special provisions for women)"],
    sections: ["BNS Section 74 (Assault on woman to outrage modesty)", "BNS Section 78 (Stalking)", "BNS Section 79 (Word/gesture insulting modesty)"],
    summary: "Bharatiya Nyaya Sanhita (BNS 2023) has strengthened protection laws for women with stringent penalties for harassment, stalking, and physical intimidation.",
    keyPoints: [
      "BNS Sec. 74 (Formerly IPC 354): Protects women against criminal force or assault aimed at outraging modesty (1 to 5 years imprisonment).",
      "BNS Sec. 78 (Formerly IPC 354D): Defines electronic and physical stalking; repeat offenders face up to 5 years imprisonment.",
      "BNS Sec. 79 (Formerly IPC 509): Outlaws intrusive words, sounds, or gestures insulting female dignity.",
    ],
    remedy: "Reach out to National/WB Commission for Women Helpline 181 or file a discreet complaint at the nearest police station or WBSLSA."
  },
  "How do I file a Zero FIR under BNSS in West Bengal?": {
    articles: ["Article 21 (Access to Justice)"],
    sections: ["BNSS Section 173(1) (Information in cognizable cases - Zero FIR)"],
    summary: "Under Section 173(1) of BNSS 2023, a Zero FIR allows any victim to register an FIR at ANY police station regardless of jurisdiction.",
    keyPoints: [
      "Zero FIR Rule: Police CANNOT refuse to register a complaint claiming the jurisdiction belongs to another station.",
      "Serial Number 0: The FIR is registered with number '0' and subsequently transferred to the appropriate jurisdictional police station.",
      "Mandatory Compliance: Refusal by a police officer to register Zero FIR is punishable under BNS Section 199.",
    ],
    remedy: "If a local station refuses, submit a written complaint to the District SP or Kolkata Police Commissionerate, or record via LawAI Voice FIR."
  }
}

export default function AILawAssistant() {
  const { lang, t } = useLanguage()
  const { setActivePage } = useNavigation()
  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      text: lang === 'bn'
        ? 'নমস্কার! আমি LawAI Nyaya সহকারী। ভারতীয় সংবিধানের অনুচ্ছেদ এবং BNS/IT Act-এর ধারা অনুযায়ী আপনার আইনি প্রশ্নের উত্তর দিতে প্রস্তুত।'
        : 'Greetings! I am the LawAI Nyaya Assistant. Ask me any legal question grounded in the Constitution of India, BNS, BNSS, and IT Act.',
      articles: [],
      sections: [],
    }
  ])
  const [inputQuery, setInputQuery] = useState('')
  const [isTyping, setIsTyping] = useState(false)

  const handleSend = (queryText) => {
    const q = queryText || inputQuery
    if (!q.trim()) return

    const userMsg = { sender: 'user', text: q }
    setMessages(prev => [...prev, userMsg])
    if (!queryText) setInputQuery('')
    setIsTyping(true)

    setTimeout(() => {
      // Find matching prebuilt answer or generate intelligent Indian law response
      const matched = prebuiltAnswers[q] || {
        articles: ["Article 21 (Right to Life & Liberty)", "Article 14 (Equality Before Law)"],
        sections: ["BNS Section 318 (Cheating & Fraud)", "BNSS Section 173 (Filing Information/FIR)"],
        summary: `Under Indian Jurisprudence regarding "${q}":`,
        keyPoints: [
          "Constitutional Guarantee: Guaranteed under fundamental rights framework of Part III of the Constitution of India.",
          "Statutory Provisions: Provisions enforced under Bharatiya Nyaya Sanhita (BNS 2023) and Bharatiya Nagarik Suraksha Sanhita (BNSS).",
          "Legal Due Process: Requires proper registration of complaint and compliance with procedural safeguards.",
        ],
        remedy: "Consult WBSLSA legal counsel or file an official grievance through e-Courts / National Legal Services Authority."
      }

      const aiMsg = {
        sender: 'ai',
        text: matched.summary,
        keyPoints: matched.keyPoints,
        articles: matched.articles,
        sections: matched.sections,
        remedy: matched.remedy,
      }

      setMessages(prev => [...prev, aiMsg])
      setIsTyping(false)
    }, 1200)
  }

  return (
    <section className="relative z-10 py-8 px-4 md:px-8 max-w-6xl mx-auto">
      {/* Page Title */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#4CE0FF]/10 border border-[#4CE0FF]/20 text-[#4CE0FF] text-xs font-semibold uppercase tracking-widest mb-3">
          <Bot className="w-4 h-4" />
          Indian Law AI Console
        </div>
        <h2 className="text-3xl md:text-5xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          LawAI <span className="text-[#4CE0FF]">Nyaya Assistant</span>
        </h2>
        <p className="text-sm text-white/50 max-w-xl mx-auto">
          Ask questions about Indian Law — get instant answers citing exact Articles of the Constitution of India and Sections of BNS / IT Act.
        </p>
      </motion.div>

      {/* Suggested Questions Bar */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        {suggestedQuestions.map((item, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(item.text)}
            className="p-3 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-[#4CE0FF]/40 hover:bg-white/8 transition-all text-left group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-mono tracking-wider text-[#4CE0FF]">
                {item.category}
              </span>
              <Sparkles className="w-3.5 h-3.5 text-[#4CE0FF] opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-xs text-white/80 group-hover:text-white transition-colors">
              {lang === 'bn' ? item.bnText : item.text}
            </p>
          </button>
        ))}
      </motion.div>

      {/* Chat Window */}
      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4 md:p-6 mb-6 min-h-[420px] flex flex-col justify-between">
        {/* Messages list */}
        <div className="space-y-4 overflow-y-auto max-h-[500px] pr-2 mb-4">
          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[88%] md:max-w-[75%] p-4 rounded-2xl ${
                msg.sender === 'user'
                  ? 'bg-gradient-to-r from-[#0284c7] to-[#0369a1] text-white rounded-tr-none shadow-lg'
                  : 'bg-white/5 border border-white/10 text-white/90 rounded-tl-none backdrop-blur-xl'
              }`}>
                {/* Header */}
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
                  {msg.sender === 'ai' ? (
                    <>
                      <div className="w-6 h-6 rounded-full bg-[#4CE0FF]/20 flex items-center justify-center">
                        <Bot className="w-3.5 h-3.5 text-[#4CE0FF]" />
                      </div>
                      <span className="text-xs font-bold text-[#4CE0FF]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        LawAI Nyaya Bot
                      </span>
                    </>
                  ) : (
                    <>
                      <User className="w-4 h-4 text-white/70" />
                      <span className="text-xs font-semibold text-white/80">Citizen Query</span>
                    </>
                  )}
                </div>

                {/* Main text */}
                <p className="text-sm leading-relaxed mb-3">{msg.text}</p>

                {/* Key Points */}
                {msg.keyPoints && (
                  <div className="space-y-1.5 mb-3 bg-white/5 p-3 rounded-lg border border-white/5">
                    {msg.keyPoints.map((pt, pIdx) => (
                      <p key={pIdx} className="text-xs text-white/80 flex items-start gap-2">
                        <span className="text-[#33FFB0] mt-0.5">•</span>
                        <span>{pt}</span>
                      </p>
                    ))}
                  </div>
                )}

                {/* Badges for Articles and Sections */}
                {(msg.articles?.length > 0 || msg.sections?.length > 0) && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                    {/* Articles */}
                    {msg.articles.length > 0 && (
                      <div>
                        <span className="text-[10px] font-mono uppercase text-[#FFB84C] tracking-wider block mb-1">
                          📜 Constitution of India:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.articles.map((art, aIdx) => (
                            <span key={aIdx} className="text-[11px] px-2 py-0.5 rounded-full bg-[#FFB84C]/15 border border-[#FFB84C]/30 text-[#FFB84C] font-mono">
                              {art}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sections */}
                    {msg.sections.length > 0 && (
                      <div className="mt-2">
                        <span className="text-[10px] font-mono uppercase text-[#33FFB0] tracking-wider block mb-1">
                          ⚖️ Statutory Sections (BNS / IT Act):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sections.map((sec, sIdx) => (
                            <span key={sIdx} className="text-[11px] px-2 py-0.5 rounded-full bg-[#33FFB0]/15 border border-[#33FFB0]/30 text-[#33FFB0] font-mono">
                              {sec}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Legal Remedy advice */}
                {msg.remedy && (
                  <div className="mt-3 p-2.5 rounded-lg bg-[#4CE0FF]/10 border border-[#4CE0FF]/20 text-[11px] text-[#4CE0FF] flex items-center gap-2">
                    <Scale className="w-4 h-4 shrink-0" />
                    <span><strong>Legal Recourse:</strong> {msg.remedy}</span>
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          {isTyping && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs text-[#4CE0FF] flex items-center gap-2 font-mono">
                <Bot className="w-4 h-4 animate-spin text-[#4CE0FF]" />
                Analyzing Indian Law statutes & Articles...
              </div>
            </motion.div>
          )}
        </div>

        {/* Input Bar */}
        <div className="flex items-center gap-2 pt-3 border-t border-white/10">
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={lang === 'bn' ? 'ভারতীয় আইন সম্পর্কিত আপনার প্রশ্ন লিখুন...' : 'Ask any Indian Law question (e.g., arrest rights, cyber fraud, BNS sections)...'}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-[#4CE0FF]/50 transition-colors"
          />
          <button
            onClick={() => handleSend()}
            className="p-3 rounded-xl bg-gradient-to-r from-[#4CE0FF] to-[#33FFB0] text-[#05070d] font-bold hover:shadow-[0_0_20px_rgba(76,224,255,0.4)] transition-all cursor-pointer"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Link to Glossary */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-[#FFB84C]" />
          <div>
            <h4 className="text-sm font-semibold text-white">Need to lookup specific Articles or Sections directly?</h4>
            <p className="text-xs text-white/40">Browse our complete Indian Legal Code Glossary &amp; Search Engine ("Nyaya Kosh").</p>
          </div>
        </div>
        <button
          onClick={() => setActivePage('glossary')}
          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-[#FFB84C] border border-[#FFB84C]/30 flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
        >
          Explore Legal Glossary <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  )
}
