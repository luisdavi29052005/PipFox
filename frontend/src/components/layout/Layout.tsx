
import { ReactNode } from 'react'

interface LayoutProps {
  children: ReactNode
  showHeader?: boolean
}

export default function Layout({ children, showHeader = true }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {showHeader && (
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center">
                  <span className="text-white font-bold text-sm">P</span>
                </div>
                <span className="ml-2 text-xl font-semibold text-gray-900">PipeFox</span>
              </div>
            </div>
          </div>
        </header>
      )}
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
