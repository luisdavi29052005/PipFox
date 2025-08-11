import { Request, Response, NextFunction } from 'express';
import { supabaseAnon } from '../services/supabaseClient';

interface AuthenticatedRequest extends Request {
  user?: any;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    // Try to get token from cookie first, then from authorization header
    const token = req.cookies.auth || req.headers.authorization?.substring(7);

    if (!token) {
      return res.status(401).json({ error: 'Missing authentication token' });
    }

    const { data: { user }, error } = await supabaseAnon.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}