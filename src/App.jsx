import { useState, createContext, useContext } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Navbar from './components/Navbar.jsx'
import HeroSection from './components/HeroSection.jsx'
import CyberFraudShield from './components/CyberFraudShield.jsx'
import VoiceFIR from './components/VoiceFIR.jsx'
import CrimeHeatmap from './components/CrimeHeatmap.jsx'
import WomenSafety from './components/WomenSafety.jsx'
import EvidenceAnalyzer from './components/EvidenceAnalyzer.jsx'
import AILawAssistant from './components/AILawAssistant.jsx'
import LegalGlossary from './components/LegalGlossary.jsx'
import FloatingAIButton from './components/FloatingAIButton.jsx'
import Footer from './components/Footer.jsx'
import AnimatedBackground from './components/AnimatedBackground.jsx'

export const LanguageContext = createContext()
export const ThemeContext = createContext()
export const NavigationContext = createContext()

export function useLanguage() {
  return useContext(LanguageContext)
}

export function useTheme() {
  return useContext(ThemeContext)
}

export function useNavigation() {
  return useContext(NavigationContext)
}

const translations = {
  en: {
    tagline: 'From panic to protection in under 3 minutes',
    subtitle: 'AI-powered crisis response & legal intelligence for West Bengal',
    casesRouted: 'Cases Routed Today',
    avgResponse: 'Avg Response Time',
    districtsCovered: 'Districts Covered',
    systemOnline: '1930 Helpline Linked',
    navHome: 'Overview',
    navFeature1: 'Cyber Fraud Shield',
    navFeature2: 'Voice FIR',
    navFeature3: 'Crime Heatmap',
    navFeature4: "Women's Safety",
    navFeature5: 'Evidence Analyzer',
    navAiAssistant: 'AI Law Assistant',
    navGlossary: 'Legal Glossary',
    feature1: 'Digital Arrest & Cyber Fraud Shield',
    feature1desc: 'One-tap panic button with auto-complaint filing & golden hour countdown',
    feature2: 'Voice FIR + WhatsApp Parser',
    feature2desc: 'Speak your complaint — AI structures it into official FIR format',
    feature3: 'Crime & Fraud Risk Heatmap',
    feature3desc: 'Interactive district-level threat visualization across West Bengal',
    feature4: "Women's Safety SOS",
    feature4desc: 'Discreet SOS with location sharing & safety network activation',
    feature5: 'Evidence Authenticity Analyzer',
    feature5desc: 'AI forensic scan for document tampering & metadata verification',
    feature6: 'LawAI Nyaya Assistant',
    feature6desc: 'Ask Indian law questions and receive cited Articles of Constitution and Sections',
    feature7: 'Nyaya Kosh — Legal Directory',
    feature7desc: 'Search Articles of Constitution, BNS, BNSS, IT Act, and Consumer laws',
    disclaimer: 'AI-assisted guidance — not legal certification',
    backToHome: '← Back to Command Center Overview',
  },
  bn: {
    tagline: 'আতঙ্ক থেকে সুরক্ষা — ৩ মিনিটের মধ্যে',
    subtitle: 'পশ্চিমবঙ্গের জন্য AI-চালিত সঙ্কট প্রতিক্রিয়া ও আইনি বুদ্ধিমত্তা',
    casesRouted: 'আজ রুট করা মামলা',
    avgResponse: 'গড় প্রতিক্রিয়া সময়',
    districtsCovered: 'জেলা কভার করা হয়েছে',
    systemOnline: '১৯৩০ হেল্পলাইন সংযুক্ত',
    navHome: 'ওভারভিউ',
    navFeature1: 'সাইবার জালিয়াতি শিল্ড',
    navFeature2: 'ভয়েস FIR',
    navFeature3: 'হিটম্যাপ',
    navFeature4: 'নারী নিরাপত্তা',
    navFeature5: 'প্রমাণ বিশ্লেষক',
    navAiAssistant: 'AI আইন সহকারী',
    navGlossary: 'আইনি শব্দকোষ',
    feature1: 'ডিজিটাল গ্রেপ্তার ও সাইবার জালিয়াতি শিল্ড',
    feature1desc: 'এক-ট্যাপ প্যানিক বোতাম সহ স্বয়ংক্রিয় অভিযোগ দাখিল',
    feature2: 'ভয়েস FIR + হোয়াটসঅ্যাপ পার্সার',
    feature2desc: 'আপনার অভিযোগ বলুন — AI এটি FIR ফরম্যাটে তৈরি করবে',
    feature3: 'অপরাধ ও জালিয়াতি ঝুঁকি হিটম্যাপ',
    feature3desc: 'পশ্চিমবঙ্গ জুড়ে জেলা-স্তরের হুমকি ভিজ্যুয়ালাইজেশন',
    feature4: 'নারী নিরাপত্তা SOS',
    feature4desc: 'গোপন SOS লোকেশন শেয়ারিং ও সেফটি নেটওয়ার্ক সহ',
    feature5: 'প্রমাণ সত্যতা বিশ্লেষক',
    feature5desc: 'নথি জালিয়াতি ও মেটাডেটা যাচাইয়ের জন্য AI ফরেনসিক স্ক্যান',
    feature6: 'LawAI ন্যায় সহকারী',
    feature6desc: 'ভারতীয় আইনের প্রশ্ন জিজ্ঞাসা করুন এবং সংবিধান ও ধারার উল্লেখ পান',
    feature7: 'ন্যায় কোষ — আইনি নির্দেশিকা',
    feature7desc: 'সংবিধানের অনুচ্ছেদ, BNS, BNSS, IT Act এবং ভোক্তা আইন অনুসন্ধান করুন',
    disclaimer: 'AI-সহায়ক নির্দেশিকা — আইনি সার্টিফিকেশন নয়',
    backToHome: '← কমান্ড সেন্টার ওভারভিউতে ফিরুন',
  }
}

function App() {
  const [lang, setLang] = useState('en')
  const [theme, setTheme] = useState('dark')
  const [activePage, setActivePage] = useState('home') // 'home' | 'cyber-fraud' | 'voice-fir' | 'heatmap' | 'women-safety' | 'evidence' | 'ai-assistant' | 'glossary'
  const t = translations[lang]

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
  }

  const navigateTo = (pageId) => {
    setActivePage(pageId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      <LanguageContext.Provider value={{ lang, setLang, t }}>
        <NavigationContext.Provider value={{ activePage, setActivePage: navigateTo }}>
          <div
            className={`relative min-h-screen transition-colors duration-500 overflow-x-hidden ${
              theme === 'dark'
                ? 'bg-[#05070d] text-white'
                : 'bg-[#f0f4f8] text-[#0f172a] light-mode'
            }`}
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            <AnimatedBackground />
            <Navbar />
            <main className="relative z-10 pt-24 min-h-[85vh]">
              <AnimatePresence mode="wait">
                {activePage === 'home' && (
                  <motion.div
                    key="home"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.3 }}
                  >
                    <HeroSection />
                  </motion.div>
                )}

                {activePage === 'cyber-fraud' && (
                  <motion.div
                    key="cyber-fraud"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.3 }}
                  >
                    <PageHeader title={t.feature1} />
                    <CyberFraudShield />
                  </motion.div>
                )}

                {activePage === 'voice-fir' && (
                  <motion.div
                    key="voice-fir"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.3 }}
                  >
                    <PageHeader title={t.feature2} />
                    <VoiceFIR />
                  </motion.div>
                )}

                {activePage === 'heatmap' && (
                  <motion.div
                    key="heatmap"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.3 }}
                  >
                    <PageHeader title={t.feature3} />
                    <CrimeHeatmap />
                  </motion.div>
                )}

                {activePage === 'women-safety' && (
                  <motion.div
                    key="women-safety"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.3 }}
                  >
                    <PageHeader title={t.feature4} />
                    <WomenSafety />
                  </motion.div>
                )}

                {activePage === 'evidence' && (
                  <motion.div
                    key="evidence"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.3 }}
                  >
                    <PageHeader title={t.feature5} />
                    <EvidenceAnalyzer />
                  </motion.div>
                )}

                {activePage === 'ai-assistant' && (
                  <motion.div
                    key="ai-assistant"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.3 }}
                  >
                    <PageHeader title={t.feature6} />
                    <AILawAssistant />
                  </motion.div>
                )}

                {activePage === 'glossary' && (
                  <motion.div
                    key="glossary"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.3 }}
                  >
                    <PageHeader title={t.feature7} />
                    <LegalGlossary />
                  </motion.div>
                )}
              </AnimatePresence>
            </main>
            <FloatingAIButton />
            <Footer />
          </div>
        </NavigationContext.Provider>
      </LanguageContext.Provider>
    </ThemeContext.Provider>
  )
}

function PageHeader({ title }) {
  const { setActivePage } = useNavigation()
  const { t } = useLanguage()

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 pt-4 pb-0">
      <button
        onClick={() => setActivePage('home')}
        className="text-xs font-semibold text-[#4CE0FF] hover:underline cursor-pointer mb-2 inline-block"
      >
        {t.backToHome}
      </button>
    </div>
  )
}

export default App
