import express from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { supabase } from '../../services/supabaseClient';
import { openLoginWindow } from '../../core/automations/facebook/session/login';
import { logoutFacebookAndDeleteSession } from '../../core/automations/facebook/session/logout';
import { checkAccountLimit } from '../../middleware/checkLimits';



const router = express.Router();

/* -------------------------------------------------------------------- */
/* GET /api/accounts – lista SOMENTE as contas do usuário autenticado   */
/* -------------------------------------------------------------------- */
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;

  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId);          // << filtro de segurança

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/* -------------------------------------------------------------------- */
/* POST /api/accounts – cria conta vinculada ao usuário autenticado     */
/* -------------------------------------------------------------------- */
router.post('/', requireAuth, checkAccountLimit, async (req, res) => {
  const userId = req.user.id;
  const { name } = req.body;

  // Validação
  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'Account name is required' });
  }

  if (name.length > 100) {
    return res.status(400).json({ error: 'Account name too long (max 100 characters)' });
  }

  try {
    const { data, error } = await supabase
      .from('accounts')
      .insert([{ name: name.trim(), status: 'not_ready', user_id: userId }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error('Error creating account:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* -------------------------------------------------------------------- */
/* POST /api/accounts/:id/login  – altera status se a conta é do user   */
/* -------------------------------------------------------------------- */
router.post('/:id/login', requireAuth, async (req, res) => {
  const userId = req.user.id
  const accountId = req.params.id

  // marca como "logging_in"
  await supabase
    .from('accounts')
    .update({ status: 'logging_in' })
    .eq('id', accountId)
    .eq('user_id', userId)

  // responde imediatamente
  res.json({ msg: 'Abrindo janela de login… Faça login e feche a janela quando terminar.' })

  // processo em background
  openLoginWindow(userId, accountId)
    .then(async ({ userDataDir, isLogged, storageStatePath, fbUserId }) => {
      // Remove a verificação de conflito - permite múltiplas contas do mesmo usuário
      // usarem a mesma conta do Facebook
      // A verificação de conflito seria apenas entre usuários diferentes do sistema,
      // mas isso não é necessário implementar agora

      // grava sessão independente de ter logado ou não
      const payload = {
        status: isLogged ? 'ready' : 'not_ready',
        fb_user_id: fbUserId || null,
        session_data: {
          userDataDir,
          storageStatePath,
          fb_user_id: fbUserId || null,
          last_login_at: new Date().toISOString()
        }
      }

      const { error: updErr } = await supabase
        .from('accounts')
        .update(payload)
        .eq('id', accountId)
        .eq('user_id', userId)

      if (updErr) {
        console.error('update accounts error', updErr)
        // Se for erro de constraint única no fb_user_id, ainda considera como sucesso
        // pois o login foi realizado, apenas não conseguiu salvar o fb_user_id
        if (updErr.code === '23505' && updErr.message.includes('fb_user_id')) {
          console.log('[login] fb_user_id já existe, salvando sem o fb_user_id')
          const payloadWithoutFbUserId = {
            status: isLogged ? 'ready' : 'not_ready',
            session_data: {
              userDataDir,
              storageStatePath,
              fb_user_id: fbUserId || null,
              last_login_at: new Date().toISOString()
            }
          }
          
          const { error: updErr2 } = await supabase
            .from('accounts')
            .update(payloadWithoutFbUserId)
            .eq('id', accountId)
            .eq('user_id', userId)
            
          if (updErr2) console.error('second update accounts error', updErr2)
        }
      }
    })
    .catch(async err => {
      console.error('login window error', err)
      await supabase
        .from('accounts')
        .update({ status: 'error', session_data: { error: String(err) } })
        .eq('id', accountId)
        .eq('user_id', userId)
    })
})

// GET /api/accounts/:id/debug-session  (auditoria)
router.get('/:id/debug-session', requireAuth, async (req, res) => {
  const userId = req.user.id
  const accountId = req.params.id

  const { data, error } = await supabase
    .from('accounts')
    .select('id, name, status, user_id, fb_user_id, session_data, created_at, updated_at')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single()

  if (error) return res.status(404).json({ error: error.message })
  res.json(data)
})


/* -------------------------------------------------------------------- */
/* POST /api/accounts/:id/logout – logout completo do Facebook e limpa sessão */
/* -------------------------------------------------------------------- */
router.post('/:id/logout', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const accountId = req.params.id;

  try {
    // Verifica se a conta existe e pertence ao usuário
    const { data: account, error: fetchError } = await supabase
      .from('accounts')
      .select('id, status')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Marca como fazendo logout
    await supabase
      .from('accounts')
      .update({ status: 'logging_out' })
      .eq('id', accountId)
      .eq('user_id', userId);

    // Resposta imediata para o frontend
    res.json({ msg: 'Fazendo logout do Facebook e removendo sessão...' });

    // Processo em background
    try {
      // Faz logout completo do Facebook e remove sessão
      await logoutFacebookAndDeleteSession(userId, accountId);
      
      // Atualiza status para not_ready e limpa dados da sessão
      await supabase
        .from('accounts')
        .update({ 
          status: 'not_ready',
          fb_user_id: null,
          session_data: null 
        })
        .eq('id', accountId)
        .eq('user_id', userId);

      console.log(`[logout] Logout completo realizado para conta ${accountId}`);
    } catch (logoutError) {
      console.error('[logout] Erro durante logout:', logoutError);
      
      // Mesmo se der erro no logout do Facebook, limpa os dados locais
      await supabase
        .from('accounts')
        .update({ 
          status: 'not_ready',
          fb_user_id: null,
          session_data: { error: String(logoutError) }
        })
        .eq('id', accountId)
        .eq('user_id', userId);
    }
  } catch (error) {
    console.error('Error during logout process:', error);
    
    // Em caso de erro, pelo menos reseta o status
    await supabase
      .from('accounts')
      .update({ status: 'error' })
      .eq('id', accountId)
      .eq('user_id', userId);
  }
});


// GET /api/accounts/:id
router.get('/:id', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const accountId = req.params.id;
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (error || !data)
      return res.status(404).json({ error: 'Account not found' });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});


// DELETE /api/accounts/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const accountId = req.params.id;

  try {
    // Verifica se a conta existe e pertence ao usuário
    const { data: account, error: fetchError } = await supabase
      .from('accounts')
      .select('id')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Deleta a conta
    const { error: deleteError } = await supabase
      .from('accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Error deleting account:', deleteError);
      return res.status(500).json({ error: 'Failed to delete account' });
    }

    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error during account deletion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/accounts/stats
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('status')
      .eq('user_id', userId);

    if (error) throw error;

    const stats = accounts.reduce((acc, account) => {
      acc.total++;
      switch (account.status) {
        case 'ready':
          acc.connected++;
          break;
        case 'not_ready':
          acc.disconnected++;
          break;
        case 'error':
        case 'conflict':
          acc.error++;
          break;
      }
      return acc;
    }, { total: 0, connected: 0, disconnected: 0, error: 0 });

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching account stats:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

export default router;