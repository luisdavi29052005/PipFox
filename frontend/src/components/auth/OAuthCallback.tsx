
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function OAuthCallback() {
  const navigate = useNavigate()
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    const handleOAuthCallback = async () => {
      if (isProcessing) return // Evitar múltiplas execuções
      
      const hash = window.location.hash
      console.log('OAuth callback hash:', hash)
      
      if (!hash || !hash.includes('access_token')) {
        console.log('No access token found, redirecting to login')
        navigate('/login?error=no_token', { replace: true })
        return
      }

      setIsProcessing(true)
      
      try {
        const params = new URLSearchParams(hash.substring(1))
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        
        console.log('Found tokens:', { accessToken: !!accessToken, refreshToken: !!refreshToken })
        
        if (!accessToken) {
          throw new Error('No access token in URL')
        }

        // Salvar token no cookie via API
        const response = await fetch('/api/auth/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            access_token: accessToken,
            refresh_token: refreshToken
          })
        })

        const result = await response.json()
        console.log('Session API response:', { ok: response.ok, result })

        if (response.ok) {
          // Limpar a URL removendo o hash
          window.history.replaceState({}, document.title, '/dashboard')
          // Redirecionar sem reload para evitar loop
          navigate('/dashboard', { replace: true })
        } else {
          throw new Error(result.error || 'Session creation failed')
        }
      } catch (error) {
        console.error('Erro ao processar OAuth:', error)
        navigate('/login?error=oauth_failed', { replace: true })
      } finally {
        setIsProcessing(false)
      }
    }

    // Só processar se tiver tokens na URL e não estiver processando
    const hasTokens = window.location.hash.includes('access_token')
    if (hasTokens && !isProcessing) {
      handleOAuthCallback()
    } else if (!hasTokens) {
      // Se não tem tokens, redirecionar imediatamente
      navigate('/login?error=no_token', { replace: true })
    }
  }, [navigate, isProcessing])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
        <p className="mt-2 text-gray-600">Processando login...</p>
      </div>
    </div>
  )
}
