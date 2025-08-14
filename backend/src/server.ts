// server.ts completo corrigido
import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import cookieParser from 'cookie-parser';
import path from 'path';
import authRouter from './api/routes/auth';
import leadsRouter from './api/routes/leads';
import accountsRouter from './api/routes/accounts';
import workflowsRouter from './api/routes/workflows';
import workflowNodesRouter from './api/routes/workflow-nodes';
import workflowNodesRoutes from './api/routes/workflow-nodes.js';
import statsRouter from './api/routes/stats';
import dashboardRouter from './api/routes/dashboard';
import plansRouter from './api/routes/plans';

config({ path: path.resolve(process.cwd(), '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://0.0.0.0:5173',
      'http://0.0.0.0:3000'
    ];
    if (origin.includes('replit.dev') || origin.includes('repl.co') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));
app.use(cookieParser());
app.use((req, res, next) => {
  if (req.originalUrl === '/api/plans/webhook') return next();
  return express.json()(req, res, next);
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.use('/api/accounts', accountsRouter);
app.use('/api/auth', authRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/workflows', workflowsRouter);
app.use('/api/workflow-nodes', workflowNodesRouter);
app.use('/api/workflow-nodes', workflowNodesRoutes);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/plans', plansRouter);
app.use('/api', statsRouter);

// Correção do redirecionamento /plans
app.get('/plans', (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl) {
    return res.status(500).send('FRONTEND_URL não configurada');
  }
  const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  res.redirect(`${frontendUrl}/plans${qs}`);
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Health check: http://0.0.0.0:${PORT}/health`);
});

export default app;