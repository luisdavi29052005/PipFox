import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { me } from '../lib/api'

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await me()
        setAllowed(true)
      } catch (error) {
        console.log('Auth check failed:', error)
        setAllowed(false)
      }
    }

    checkAuth()
  }, [])

  if (allowed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-gray-600">Validando sessão...</p>
        </div>
      </div>
    )
  }
  
  if (allowed === false) return <Navigate to="/login" replace />
  return children
}
