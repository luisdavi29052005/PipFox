import { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface AuthLayoutProps {
  children: ReactNode
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="w-screen h-screen bg-white flex">
      {/* Left side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <motion.div 
          className="w-full max-w-sm space-y-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      </div>
      
      {/* Right side - Animated Gradient */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Animated Gradient Background */}
        <motion.div 
          className="absolute inset-0"
          animate={{
            background: [
              "linear-gradient(45deg, #3B82F6, #8B5CF6, #EC4899, #EF4444)",
              "linear-gradient(135deg, #8B5CF6, #EC4899, #EF4444, #3B82F6)",
              "linear-gradient(225deg, #EC4899, #EF4444, #3B82F6, #8B5CF6)",
              "linear-gradient(315deg, #EF4444, #3B82F6, #8B5CF6, #EC4899)",
              "linear-gradient(45deg, #3B82F6, #8B5CF6, #EC4899, #EF4444)"
            ]
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <div className="absolute inset-0 bg-black bg-opacity-10"></div>
        </motion.div>
        
        {/* Floating Elements for Extra Animation */}
        <motion.div
          className="absolute top-1/4 left-1/4 w-32 h-32 rounded-full bg-white bg-opacity-10 blur-xl"
          animate={{
            x: [0, 50, 0],
            y: [0, -30, 0],
            scale: [1, 1.2, 1]
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div
          className="absolute bottom-1/3 right-1/3 w-24 h-24 rounded-full bg-white bg-opacity-5 blur-xl"
          animate={{
            x: [0, -40, 0],
            y: [0, 40, 0],
            scale: [1, 0.8, 1]
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          }}
        />
      </div>
    </div>
  )
}
