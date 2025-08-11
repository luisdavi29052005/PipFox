
import { forwardRef } from 'react'
import { motion } from 'framer-motion'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  icon,
  className = '',
  type = 'text',
  ...props
}, ref) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <motion.div 
            className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.2 }}
          >
            {icon}
          </motion.div>
        )}
        <motion.input
          ref={ref}
          type={type}
          className={`
            w-full px-3 py-3 border border-gray-300 rounded-lg
            focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400
            placeholder-gray-400 text-gray-900 text-sm
            transition-all duration-200
            ${icon ? 'pl-10' : ''}
            ${error ? 'border-red-300 focus:ring-red-500' : ''}
            ${className}
          `}
          whileFocus={{ 
            scale: 1.02,
            boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.1)"
          }}
          whileHover={{
            borderColor: "#9CA3AF"
          }}
          transition={{ duration: 0.2 }}
          {...props}
        />
      </div>
      {error && (
        <motion.p 
          className="mt-1 text-sm text-red-600"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {error}
        </motion.p>
      )}
    </div>
  )
})

Input.displayName = 'Input'

export default Input
