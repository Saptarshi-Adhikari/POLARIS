import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Shield, Scale, Sun, Moon, Home, ShieldAlert, Mic, Map, Heart, Search, Bot, BookOpen, Menu, X } from 'lucide-react'
import { useLanguage, useTheme, useNavigation } from '../App.jsx'

export default function Navbar() {
  const { lang, setLang, t } = useLanguage()
  const { theme, toggleTheme } = useTheme()
  const { activePage, setActivePage } = useNavigation()
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isDark = theme === 'dark'

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navItems = [
    { id: 'home', label: t.navHome, icon: Home },
    { id: 'cyber-fraud', label: t.navFeature1, icon: ShieldAlert },
    { id: 'voice-fir', label: t.navFeature2, icon: Mic },
    { id: 'heatmap', label: t.navFeature3, icon: Map },
    { id: 'women-safety', label: t.navFeature4, icon: Heart },
    { id: 'evidence', label: t.navFeature5, icon: Search },
    { id: 'ai-assistant', label: t.navAiAssistant, icon: Bot },
    { id: 'glossary', label: t.navGlossary, icon: BookOpen },
  ]

  return (
    <motion.nav
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? 'py-2' : 'py-3'
      }`}
    >
      <div className={`mx-3 md:mx-6 rounded-2xl border px-3 md:px-5 py-2.5 flex items-center justify-between transition-all duration-500 ${
        isDark
          ? scrolled
            ? 'bg-[#05070d]/90 backdrop-blur-2xl shadow-2xl border-white/10'
            : 'bg-white/5 backdrop-blur-xl border-white/10'
          : scrolled
            ? 'bg-white/90 backdrop-blur-2xl shadow-xl border-slate-200'
            : 'bg-white/70 backdrop-blur-xl border-slate-200/80 shadow-sm'
      }`}>
        {/* Logo */}
        <div
          className="flex items-center gap-2 cursor-pointer group shrink-0"
          onClick={() => { setActivePage('home'); setMobileMenuOpen(false) }}
        >
          <div className="relative w-8 h-8 md:w-9 md:h-9 flex items-center justify-center">
            <Shield className={`w-7 h-7 md:w-8 md:h-8 absolute ${isDark ? 'text-[#4CE0FF]' : 'text-[#0284c7]'}`} strokeWidth={1.5} />
            <Scale className={`w-3.5 h-3.5 md:w-4 md:h-4 absolute ${isDark ? 'text-[#4CE0FF]' : 'text-[#0284c7]'}`} strokeWidth={2} />
          </div>
          <div>
            <h1 className={`text-sm md:text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              LawAI <span className={isDark ? 'text-[#4CE0FF]' : 'text-[#0284c7]'}>Bengal</span>
            </h1>
            <p className={`text-[8px] md:text-[9px] tracking-widest uppercase -mt-1 hidden sm:block ${isDark ? 'text-white/40' : 'text-slate-500'}`}>Legal Intelligence Grid</p>
          </div>
        </div>

        {/* Center - Navigation Tabs (Desktop) */}
        <div className={`hidden xl:flex items-center gap-0.5 p-1 rounded-full border ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-slate-100/90 border-slate-200'
        }`}>
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activePage === item.id

            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`relative flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? isDark ? 'text-white' : 'text-white'
                    : isDark ? 'text-white/50 hover:text-white/80' : 'text-slate-600 hover:text-slate-900'
                }`}
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabPill"
                    className={`absolute inset-0 rounded-full ${
                      isDark ? 'bg-gradient-to-r from-[#4CE0FF]/80 to-[#33FFB0]/80 shadow-[0_0_15px_rgba(76,224,255,0.3)]' : 'bg-[#0284c7]'
                    }`}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1">
                  <Icon className="w-3 h-3" />
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {/* Status Dot */}
          <div className={`hidden 2xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-slate-100/80 border-slate-200'
          }`}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#33FFB0] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#33FFB0]"></span>
            </span>
            <span className={`text-[10px] font-medium ${isDark ? 'text-[#33FFB0]' : 'text-emerald-600'}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {t.systemOnline}
            </span>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            id="theme-toggle"
            aria-label="Toggle Theme"
            className={`p-1.5 rounded-full border transition-all duration-300 flex items-center justify-center cursor-pointer ${
              isDark
                ? 'bg-white/5 border-white/10 text-[#FFB84C] hover:bg-white/10'
                : 'bg-slate-100 border-slate-300 text-amber-600 hover:bg-slate-200 shadow-sm'
            }`}
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-[#FFB84C]" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-600" />
            )}
          </button>

          {/* Language Toggle */}
          <div
            className={`relative flex items-center border rounded-full p-0.5 cursor-pointer select-none ${
              isDark ? 'bg-white/5 border-white/10' : 'bg-slate-100 border-slate-300'
            }`}
            onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
            id="language-toggle"
          >
            <div className={`relative z-10 px-2 py-0.5 text-[11px] font-semibold rounded-full transition-all duration-300 ${
              lang === 'en'
                ? isDark ? 'text-[#05070d]' : 'text-white'
                : isDark ? 'text-white/60' : 'text-slate-600'
            }`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              EN
            </div>
            <div className={`relative z-10 px-2 py-0.5 text-[11px] font-semibold rounded-full transition-all duration-300 ${
              lang === 'bn'
                ? isDark ? 'text-[#05070d]' : 'text-white'
                : isDark ? 'text-white/60' : 'text-slate-600'
            }`}>
              বাং
            </div>
            <motion.div
              className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full ${
                isDark ? 'bg-[#4CE0FF]' : 'bg-[#0284c7]'
              }`}
              animate={{ left: lang === 'en' ? '2px' : 'calc(50% + 0px)' }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`xl:hidden p-1.5 rounded-xl border ${
              isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-100 border-slate-300 text-slate-900'
            }`}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className={`xl:hidden mx-3 mt-2 rounded-2xl border p-3 shadow-2xl ${
            isDark ? 'bg-[#0a0e1a]/95 backdrop-blur-2xl border-white/10' : 'bg-white/95 backdrop-blur-2xl border-slate-200'
          }`}
        >
          <div className="grid grid-cols-2 gap-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activePage === item.id

              return (
                <button
                  key={item.id}
                  onClick={() => { setActivePage(item.id); setMobileMenuOpen(false) }}
                  className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? isDark
                        ? 'bg-[#4CE0FF]/20 text-[#4CE0FF] border border-[#4CE0FF]/30'
                        : 'bg-[#0284c7] text-white'
                      : isDark
                        ? 'bg-white/5 text-white/70 hover:bg-white/10'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </div>
        </motion.div>
      )}
    </motion.nav>
  )
}
