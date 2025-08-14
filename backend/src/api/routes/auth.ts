import { Router } from 'express'
import { signUp, signIn, signWithGoogle, sendReset, deleteUser } from '../../services/auth.service'
import { requireAuth } from '../../middleware/requireAuth'
import { supabase, supabaseAnon } from '../../services/supabaseClient'

const COOKIE = {
  name: 'auth',
  opts: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}

const router = Router()

router.post('/signup', async (req, res) => {
  const { email, password } = req.body
  const { data: user, error } = await signUp(email, password);

  if (error) {
    console.error('Signup error:', error);
    return res.status(400).json({ success: false, error: error.message });
  }

  // Automatically assign Free plan to new user
  if (user?.user?.id) {
    try {
      // Get Free plan
      const { data: freePlan, error: planError } = await supabase
        .from('plans')
        .select('*')
        .eq('name', 'Free')
        .single();

      if (freePlan && !planError) {
        // Create subscription for Free plan
        await supabase
          .from('subscriptions')
          .insert({
            user_id: user.user.id,
            plan_id: freePlan.id,
            status: 'active',
            start_date: new Date().toISOString()
          });

        console.log(`Assigned Free plan to user ${user.user.id}`);
      }
    } catch (error) {
      console.error('Error assigning Free plan:', error);
      // Don't fail registration if plan assignment fails
    }
  }

  res.json({ success: true, data: { user } });
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  const { data, error } = await signIn(email, password)
  if (error) return res.status(401).json({ error: error.message })
  res.cookie(COOKIE.name, data.session.access_token, COOKIE.opts)
  res.json({ user: data.user })
})

router.get('/google', async (req, res) => {
  try {
    const { data, error } = await signWithGoogle()
    if (error) {
      console.error('Google OAuth error:', error)
      return res.status(500).json({ error: 'Failed to initialize Google OAuth' })
    }
    res.redirect(data.url)
  } catch (err) {
    console.error('Google OAuth route error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/callback', async (req, res) => {
  try {
    const { code, error, access_token, refresh_token } = req.query

    if (error) {
      console.error('OAuth error:', error)
      return res.redirect('/login?error=oauth_failed')
    }

    let sessionData = null;
    let userData = null;

    // Try PKCE flow first (preferred)
    if (code) {
      console.log('Processing PKCE flow with code...')
      const { data, error: sessionError } = await supabaseAnon.auth.exchangeCodeForSession(code as string)
      
      if (sessionError || !data.session) {
        console.error('Code exchange error:', sessionError)
        return res.redirect('/login?error=oauth_failed')
      }

      sessionData = data.session;
      userData = data.user;
    }
    // Fallback to implicit flow (temporary compatibility)
    else if (access_token) {
      console.log('Processing implicit flow with access_token...')
      const { data, error: userError } = await supabaseAnon.auth.getUser(access_token as string)
      
      if (userError || !data.user) {
        console.error('Token validation error:', userError)
        return res.redirect('/login?error=oauth_failed')
      }

      // Create a session-like object for compatibility
      sessionData = { 
        access_token: access_token as string,
        refresh_token: refresh_token as string || null
      };
      userData = data.user;
    }
    else {
      console.error('No code or access_token provided')
      return res.redirect('/login?error=oauth_failed')
    }

    // Set cookie with access token
    res.cookie(COOKIE.name, sessionData.access_token, COOKIE.opts)
    
    // Check if user needs Free plan assignment (for new users)
    if (userData?.id) {
      try {
        const { data: freePlan, error: planError } = await supabase
          .from('plans')
          .select('*')
          .eq('name', 'Free')
          .single();

        if (freePlan && !planError) {
          // Check if user already has a subscription
          const { data: existingSub } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', userData.id)
            .single();

          if (!existingSub) {
            await supabase
              .from('subscriptions')
              .insert({
                user_id: userData.id,
                plan_id: freePlan.id,
                status: 'active',
                start_date: new Date().toISOString()
              });
            console.log(`Assigned Free plan to user ${userData.id}`);
          }
        }
      } catch (error) {
        console.error('Error assigning Free plan:', error);
        // Don't fail login if plan assignment fails
      }
    }

    res.redirect('/oauth/callback')
  } catch (err) {
    console.error('OAuth callback error:', err)
    res.redirect('/login?error=oauth_failed')
  }
})

router.post('/session', async (req, res) => {
  try {
    const { access_token, refresh_token } = req.body

    if (!access_token) {
      return res.status(400).json({ error: 'Access token required' })
    }

    // Validar token com Supabase
    const { data, error } = await supabaseAnon.auth.getUser(access_token)
    
    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    // Set cookie com access token
    res.cookie(COOKIE.name, access_token, COOKIE.opts)
    
    // Verificar se usuário precisa do plano Free
    if (data.user?.id) {
      try {
        const { data: freePlan, error: planError } = await supabase
          .from('plans')
          .select('*')
          .eq('name', 'Free')
          .single()

        if (freePlan && !planError) {
          const { data: existingSub } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', data.user.id)
            .single()

          if (!existingSub) {
            await supabase
              .from('subscriptions')
              .insert({
                user_id: data.user.id,
                plan_id: freePlan.id,
                status: 'active',
                start_date: new Date().toISOString()
              })
            console.log(`Assigned Free plan to user ${data.user.id}`)
          }
        }
      } catch (error) {
        console.error('Error assigning Free plan:', error)
      }
    }

    res.json({ user: data.user })
  } catch (err) {
    console.error('Session creation error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/logout', requireAuth, (req, res) => {
  res.clearCookie(COOKIE.name, COOKIE.opts)
  res.json({ ok: true })
})

router.post('/reset', async (req, res) => {
  const { email } = req.body
  const { error } = await sendReset(email, `${process.env.PUBLIC_URL}/reset`)
  if (error) return res.status(400).json({ error: error.message })
  res.json({ ok: true })
})

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }))

router.delete('/account', requireAuth, async (req, res) => {
  await deleteUser(req.user.id)
  res.clearCookie(COOKIE.name, COOKIE.opts)
  res.json({ ok: true })
})

export default router