
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabaseClient';

interface RequestWithUser extends Request {
  user: {
    id: string;
  };
}

export const checkWorkflowLimit = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const userId = req.user.id;

    // Buscar plano ativo do usuário
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select(`
        plans!inner(limits)
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (!subscription) {
      return res.status(403).json({ error: 'Nenhum plano ativo encontrado' });
    }

    const limits = subscription.plans.limits as any;
    
    // Se limite é -1, é ilimitado
    if (limits.workflows === -1) {
      return next();
    }

    // Contar workflows ativos
    const { count } = await supabase
      .from('workflows')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'running');

    if (count >= limits.workflows) {
      return res.status(403).json({ 
        error: `Limite de workflows atingido. Seu plano permite ${limits.workflows} workflows ativos.`
      });
    }

    next();
  } catch (error) {
    console.error('Error checking workflow limit:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const checkAccountLimit = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const userId = req.user.id;

    // Buscar plano ativo do usuário
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select(`
        plans!inner(limits)
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (!subscription) {
      return res.status(403).json({ error: 'Nenhum plano ativo encontrado' });
    }

    const limits = subscription.plans.limits as any;
    
    // Se limite é -1, é ilimitado
    if (limits.facebook_accounts === -1) {
      return next();
    }

    // Contar contas Facebook
    const { count } = await supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (count >= limits.facebook_accounts) {
      return res.status(403).json({ 
        error: `Limite de contas Facebook atingido. Seu plano permite ${limits.facebook_accounts} contas.`
      });
    }

    next();
  } catch (error) {
    console.error('Error checking account limit:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
