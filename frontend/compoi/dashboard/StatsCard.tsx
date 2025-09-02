
import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string | number
  icon: string
  color?: 'blue' | 'green' | 'purple' | 'orange'
  delay?: number
  dailyChange?: number
  sparklineData?: Array<{ value: number }>
}

export default function StatsCard({ 
  title, 
  value, 
  icon, 
  color = 'blue', 
  delay = 0,
  dailyChange = 0,
  sparklineData = []
}: StatsCardProps) {
  const [animatedValue, setAnimatedValue] = useState(0)
  const numericValue = typeof value === 'number' ? value : parseInt(value.toString()) || 0

  useEffect(() => {
    const timer = setTimeout(() => {
      let startValue = 0
      const duration = 1000
      const increment = numericValue / (duration / 50)

      const counter = setInterval(() => {
        startValue += increment
        if (startValue >= numericValue) {
          setAnimatedValue(numericValue)
          clearInterval(counter)
        } else {
          setAnimatedValue(Math.floor(startValue))
        }
      }, 50)

      return () => clearInterval(counter)
    }, delay * 200)

    return () => clearTimeout(timer)
  }, [numericValue, delay])

  // Generate sample sparkline data if none provided
  const defaultSparklineData = Array.from({ length: 7 }, (_, i) => ({
    value: Math.floor(Math.random() * 100) + numericValue - 50
  }))
  
  const chartData = sparklineData.length > 0 ? sparklineData : defaultSparklineData

  const gradients = {
    blue: 'from-blue-500 to-cyan-500',
    green: 'from-emerald-500 to-teal-500',
    purple: 'from-violet-500 to-purple-500',
    orange: 'from-orange-500 to-red-500'
  }

  const shadows = {
    blue: 'shadow-blue-500/25',
    green: 'shadow-emerald-500/25',
    purple: 'shadow-violet-500/25',
    orange: 'shadow-orange-500/25'
  }

  const lineColors = {
    blue: '#3B82F6',
    green: '#10B981',
    purple: '#8B5CF6',
    orange: '#F97316'
  }

  const isPositiveChange = dailyChange >= 0

  return (
    <motion.div
      className="group cursor-pointer"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: delay * 0.2 }}
      whileHover={{ y: -5, scale: 1.02 }}
    >
      <div className={`bg-white rounded-2xl border border-gray-100 p-6 shadow-lg ${shadows[color]} hover:shadow-xl transition-all duration-300 relative overflow-hidden`}>
        {/* Background Gradient */}
        <div className={`absolute inset-0 bg-gradient-to-br ${gradients[color]} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
        
        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
              <motion.p 
                className="text-3xl font-bold text-gray-900"
                key={animatedValue}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                {animatedValue.toLocaleString()}
              </motion.p>
            </div>
            
            <motion.div 
              className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${gradients[color]} flex items-center justify-center text-white text-2xl shadow-lg`}
              whileHover={{ rotate: 10, scale: 1.1 }}
              transition={{ duration: 0.3 }}
            >
              {icon}
            </motion.div>
          </div>

          {/* Daily Change */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              {isPositiveChange ? (
                <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
              )}
              <span className={`text-sm font-medium ${isPositiveChange ? 'text-green-600' : 'text-red-600'}`}>
                {isPositiveChange ? '+' : ''}{dailyChange.toFixed(1)}%
              </span>
              <span className="text-xs text-gray-500 ml-1">hoje</span>
            </div>
          </div>

          {/* Sparkline */}
          <div className="h-12 mb-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={lineColors[color]}
                  strokeWidth={2}
                  dot={false}
                  strokeOpacity={0.8}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Progress indicator */}
          <motion.div 
            className="h-1 bg-gray-100 rounded-full overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: delay * 0.2 + 0.5 }}
          >
            <motion.div
              className={`h-full bg-gradient-to-r ${gradients[color]} rounded-full`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (numericValue / 100) * 100)}%` }}
              transition={{ duration: 1, delay: delay * 0.2 + 0.5 }}
            />
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}
