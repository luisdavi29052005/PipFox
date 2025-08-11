
import { ReactNode } from 'react'

interface AlertProps {
  children: ReactNode
  variant: 'success' | 'error' | 'warning' | 'info'
  title?: string
  onClose?: () => void
}

export default function Alert({ children, variant, title, onClose }: AlertProps) {
  const variants = {
    success: {
      container: 'bg-green-50 border-green-200',
      icon: '✓',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      titleColor: 'text-green-800',
      textColor: 'text-green-700'
    },
    error: {
      container: 'bg-red-50 border-red-200',
      icon: '⚠',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      titleColor: 'text-red-800',
      textColor: 'text-red-700'
    },
    warning: {
      container: 'bg-yellow-50 border-yellow-200',
      icon: '⚠',
      iconBg: 'bg-yellow-100',
      iconColor: 'text-yellow-600',
      titleColor: 'text-yellow-800',
      textColor: 'text-yellow-700'
    },
    info: {
      container: 'bg-blue-50 border-blue-200',
      icon: 'ℹ',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      titleColor: 'text-blue-800',
      textColor: 'text-blue-700'
    }
  }
  
  const config = variants[variant]
  
  return (
    <div className={`border rounded-lg p-4 ${config.container} animate-in slide-in-from-top-2 duration-300`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <div className={`w-5 h-5 rounded-full ${config.iconBg} flex items-center justify-center`}>
            <span className={`text-sm ${config.iconColor}`}>{config.icon}</span>
          </div>
        </div>
        <div className="ml-3">
          {title && (
            <p className={`text-sm font-medium ${config.titleColor}`}>{title}</p>
          )}
          <div className={`text-sm ${config.textColor} ${title ? 'mt-1' : ''}`}>
            {children}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={`ml-auto -mx-1.5 -my-1.5 ${config.iconColor} hover:bg-gray-100 rounded-lg p-1.5`}
          >
            <span className="sr-only">Fechar</span>
            ×
          </button>
        )}
      </div>
    </div>
  )
}
