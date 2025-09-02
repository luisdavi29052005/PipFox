import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import BotLoopVisualizer from '../animations/BotLoopVisualizer'

interface AuthLayoutProps {
  children: ReactNode
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex">
      {/* Left side - Visual */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex-col justify-center items-center p-12 relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(79,70,229,0.3),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(139,92,246,0.2),transparent_40%)]" />
        <div className="absolute top-20 left-20 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl" />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative z-10 text-center"
        >
          <div className="mb-12">
            <BotLoopVisualizer />
          </div>
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <h1 className="text-5xl font-bold text-white mb-2">
                PipeFox
              </h1>
              <div className="h-1 w-24 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full mx-auto mb-6" />
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              <h2 className="text-3xl font-semibold text-white mb-4">
                Automação Inteligente
              </h2>
              <h3 className="text-2xl font-medium text-indigo-200 mb-6">
                para Facebook
              </h3>
            </motion.div>
            
            <motion.p 
              className="text-lg text-slate-200 max-w-lg mx-auto leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
            >
              Transforme sua estratégia de marketing no Facebook com automação inteligente que engaja sua audiência 24 horas por dia, 7 dias por semana.
            </motion.p>
            
            <motion.div
              className="flex justify-center space-x-8 mt-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.0 }}
            >
              <div className="text-center">
                <div className="text-2xl font-bold text-white">24/7</div>
                <div className="text-sm text-indigo-200">Monitoramento</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white">AI</div>
                <div className="text-sm text-indigo-200">Comentários</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white">Auto</div>
                <div className="text-sm text-indigo-200">Resposta</div>
              </div>
            </motion.div>
          </div>
        </motion.div>
        
        <motion.div 
          className="absolute bottom-8 text-slate-300 text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.4 }}
        >
          © 2024 PipeFox. Todos os direitos reservados.
        </motion.div>
      </div>
      
      {/* Right side - Form */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-24 bg-white/70 backdrop-blur-sm">
        <motion.div 
          className="mx-auto w-full max-w-md bg-white/90 backdrop-blur-md rounded-3xl shadow-2xl border border-white/20 p-8"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  )
}