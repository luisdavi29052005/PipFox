import { createClient } from '@supabase/supabase-js'
import { supabaseAnon, supabaseAdmin } from './supabaseClient' // reaproveita

export const signUp  = (e: string, p: string) =>
  supabaseAnon.auth.signUp({ email: e, password: p })

export const signIn  = (e: string, p: string) =>
  supabaseAnon.auth.signInWithPassword({ email: e, password: p })

export const signWithGoogle = async (redirect: string) => {
  try {
    return await supabaseAnon.auth.signInWithOAuth({ 
      provider: 'google', 
      options: { redirectTo: redirect } 
    })
  } catch (error) {
    console.error('Google OAuth service error:', error)
    return { data: null, error }
  }
}

export const sendReset = (email: string, redirect: string) =>
  supabaseAnon.auth.resetPasswordForEmail(email, { redirectTo: redirect })

export const deleteUser = (uid: string) =>
  supabaseAdmin.auth.admin.deleteUser(uid)
