
import { useState } from 'react'
import { motion } from 'framer-motion'
import { apiBase, login, signup, me } from '../lib/api'
import AuthLayout from '../components/auth/AuthLayout'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Alert from '../components/ui/Alert'
import GoogleButton from '../components/auth/GoogleButton'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const getFriendlyErrorMessage = (error: string) => {
    const errorLower = error.toLowerCase()
    
    if (errorLower.includes('user already registered') || errorLower.includes('already exists')) {
      return 'Este e-mail já está cadastrado. Tente fazer login ou use outro e-mail.'
    }
    if (errorLower.includes('invalid login credentials') || errorLower.includes('invalid') || errorLower.includes('credentials') || errorLower.includes('user not found') || errorLower.includes('email not found')) {
      return 'E-mail ou senha incorretos. Verifique os dados e tente novamente.'
    }
    if (errorLower.includes('email not confirmed') || errorLower.includes('not confirmed')) {
      return 'Verifique sua caixa de entrada e confirme seu e-mail antes de continuar.'
    }
    if (errorLower.includes('weak password') || errorLower.includes('password')) {
      return 'A senha deve ter pelo menos 6 caracteres. Tente uma senha mais forte.'
    }
    if (errorLower.includes('network') || errorLower.includes('connection')) {
      return 'Problema de conexão. Verifique sua internet e tente novamente.'
    }
    if (errorLower.includes('rate limit') || errorLower.includes('too many')) {
      return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
    }
    if (errorLower.includes('server') || errorLower.includes('internal')) {
      return 'Nossos servidores estão com problema. Tente novamente em alguns minutos.'
    }
    
    return 'E-mail ou senha incorretos. Verifique os dados e tente novamente.'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccessMessage(null)
    
    try {
      if (mode === 'signup') {
        if (password !== confirm) {
          setError('As senhas não coincidem. Digite a mesma senha nos dois campos.')
          setLoading(false)
          return
        }
        await signup({ email, password })
        
        setSuccessMessage('Conta criada com sucesso! Verifique sua caixa de entrada e confirme seu e-mail antes de fazer login.')
        
        setEmail('')
        setPassword('')
        setConfirm('')
        
        setTimeout(() => {
          setMode('login')
          setSuccessMessage(null)
        }, 3000)
        
      } else {
        await login({ email, password })
        await me()
        window.location.href = '/dashboard'
      }
    } catch (err: any) {
      const friendlyMessage = getFriendlyErrorMessage(err?.message || 'Erro desconhecido')
      setError(friendlyMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = () => {
    window.location.href = `${apiBase}/api/auth/google`
  }

  return (
    <AuthLayout>
      <div className="space-y-6">
        {/* Header */}
        <motion.div 
          className="text-center mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="text-sm text-gray-600 mb-1">Log in to</div>
          <h1 className="text-2xl font-bold text-gray-900">craftwork</h1>
        </motion.div>

        {/* Google Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <GoogleButton mode={mode} onClick={handleGoogle} />
        </motion.div>

        {/* Divider */}
        <motion.div 
          className="flex items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="flex-1 border-t border-gray-300"></div>
          <span className="px-3 text-sm text-gray-500">or</span>
          <div className="flex-1 border-t border-gray-300"></div>
        </motion.div>

        {/* Form */}
        <motion.form 
          onSubmit={handleSubmit} 
          className="space-y-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <Input
            type="email"
            placeholder="Your Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
              </svg>
            }
          />
          
          <Input
            type="password"
            placeholder="Your Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            }
          />

          {mode === 'signup' && (
            <Input
              type="password"
              placeholder="Confirm Password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              }
            />
          )}

          {successMessage && (
            <Alert variant="success" title="Sucesso!">
              {successMessage}
              <p className="text-xs mt-2">Redirecionando para o login...</p>
            </Alert>
          )}

          {error && (
            <Alert variant="error" title="Oops!">
              {error}
            </Alert>
          )}

          <motion.button
            type="submit"
            disabled={loading || successMessage !== null}
            className="w-full py-3 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm font-medium transition-all duration-200"
            whileHover={!loading && !successMessage ? { 
              scale: 1.02,
              backgroundColor: "#F3F4F6"
            } : {}}
            whileTap={!loading && !successMessage ? { scale: 0.98 } : {}}
          >
            {successMessage ? (
              <>
                <span className="mr-2">✓</span>
                Conta criada!
              </>
            ) : loading ? (
              'Loading...'
            ) : (
              mode === 'login' ? 'Log in' : 'Sign up'
            )}
          </motion.button>
        </motion.form>

        {/* Footer */}

        <motion.div 
          className="text-center space-y-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          <motion.button
            onClick={() => alert('Envie seu e-mail, implementamos depois.')}
            className="text-sm text-gray-600 hover:underline transition-colors duration-200"
            whileHover={{ color: "#374151" }}
          >
            Forgot password?
          </motion.button>
          
          <div className="text-sm text-gray-600">
            {mode === 'login' ? (
              <>
                Don't have an account?{' '}
                <motion.button
                  onClick={() => setMode('signup')}
                  className="text-gray-900 font-medium hover:underline transition-colors duration-200"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Sign up
                </motion.button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <motion.button
                  onClick={() => setMode('login')}
                  className="text-gray-900 font-medium hover:underline transition-colors duration-200"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Log in
                </motion.button>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AuthLayout>
  )
}
