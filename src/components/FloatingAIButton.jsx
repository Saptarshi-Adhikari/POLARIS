import { motion } from 'framer-motion'
import { Bot, Sparkles } from 'lucide-react'
import { useNavigation, useTheme } from '../App.jsx'

export default function FloatingAIButton() {
  const { activePage, setActivePage } = useNavigation()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // Hide button if already on AI Assistant page
  if (activePage === 'ai-assistant') return null

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3"
    >
      {/* Label Tooltip Badge */}
      <motion.div
        initial={{ x: 10, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 1 }}
        className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-xl backdrop-blur-xl ${
          isDark
            ? 'bg-[#0a0e1a]/90 border-[#4CE0FF]/30 text-[#4CE0FF]'
            : 'bg-white/90 border-[#0284c7]/30 text-[#0284c7]'
        }`}
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>Ask Indian Law AI</span>
      </motion.div>

      {/* Floating Action Button */}
      <motion.button
        onClick={() => setActivePage('ai-assistant')}
        whileHover={{ scale: 1.1, rotate: 5 }}
        whileTap={{ scale: 0.9 }}
        id="floating-ai-button"
        aria-label="Ask AI Legal Assistant"
        className={`relative w-14 h-14 rounded-full flex items-center justify-center cursor-pointer shadow-2xl transition-all border ${
          isDark
            ? 'bg-gradient-to-br from-[#4CE0FF] to-[#33FFB0] border-white/20 text-[#05070d] shadow-[0_0_30px_rgba(76,224,255,0.4)]'
            : 'bg-gradient-to-br from-[#0284c7] to-[#0d9488] border-white/40 text-white shadow-lg'
        }`}
      >
        {/* Pulsing ring */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-[#4CE0FF]"
          animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <Bot className="w-7 h-7 relative z-10" />
      </motion.button>
    </motion.div>
  )
}
