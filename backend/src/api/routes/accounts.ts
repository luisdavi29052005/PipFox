import express from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { supabase } from '../../services/supabaseClient';
import { openLoginWindow } from '../../core/automations/facebook/session/login';
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
      // checa colisão só dentro do MESMO usuário do sistema
      if (isLogged && fbUserId) {
        const { data: others, error: qErr } = await supabase
          .from('accounts')
          .select('id, fb_user_id')
          .eq('user_id', userId)
          .neq('id', accountId)

        const hasClash = !qErr && others?.some(a => a.fb_user_id === fbUserId)
        if (hasClash) {
          await supabase
            .from('accounts')
            .update({
              status: 'conflict',
              fb_user_id: fbUserId,
              session_data: {
                userDataDir,
                storageStatePath,
                fb_user_id: fbUserId,
                last_login_at: new Date().toISOString(),
                reason: 'same_fb_user_as_other_account'
              }
            })
            .eq('id', accountId)
            .eq('user_id', userId)
          console.warn(`[login] conflito: ${accountId} usa mesmo fb_user_id ${fbUserId}`)
          return
        }
      }

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

      if (updErr) console.error('update accounts error', updErr)
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
/* POST /api/accounts/:id/logout – volta status se a conta é do user    */
/* -------------------------------------------------------------------- */
router.post('/:id/logout', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const accountId = req.params.id;

  const { error } = await supabase                     // basta tentar update
    .from('accounts')
    .update({ status: 'not_ready' })
    .eq('id', accountId)
    .eq('user_id', userId);

  if (error) return res.status(404).json({ error: 'Account not found' });
  res.json({ msg: 'Session status reset.' });
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