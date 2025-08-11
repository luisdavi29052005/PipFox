import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { me } from '../lib/api'

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    me().then(() => setAllowed(true)).catch(() => setAllowed(false))
  }, [])

  if (allowed === null) return <div className="text-center">Validando sessão...</div>
  if (allowed === false) return <Navigate to="/login" replace />
  return children
}
