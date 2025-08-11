
import { motion } from 'framer-motion'
import { Sun, Moon } from 'lucide-react'

interface DarkModeToggleProps {
  isDarkMode: boolean
  onToggle: () => void
}

export default function DarkModeToggle({ isDarkMode, onToggle }: DarkModeToggleProps) {
  return (
    <motion.button
      onClick={onToggle}
      className={`relative w-14 h-7 rounded-full p-1 transition-colors duration-300 ${
        isDarkMode ? 'bg-slate-700' : 'bg-gray-200'
      }`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <motion.div
        className={`absolute w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-300 ${
          isDarkMode ? 'bg-slate-800 text-yellow-400' : 'bg-white text-orange-500'
        }`}
        animate={{
          x: isDarkMode ? 28 : 0
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        {isDarkMode ? (
          <Moon className="w-3 h-3" />
        ) : (
          <Sun className="w-3 h-3" />
        )}
      </motion.div>
    </motion.button>
  )
}
