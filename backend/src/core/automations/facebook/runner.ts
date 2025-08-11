// Local: backend/src/fb_bot/runner.ts

import { BrowserContext, Page, chromium } from 'playwright'
import { supabase } from '../../../services/supabaseClient'
import { openContextForAccount } from './session/context'
import { monitorGroup } from './actions/monitorGroups'
import { actions } from './actions/actions'

/**
 * Config da orquestração
 */
export interface RunnerInput {
  userId: string
  accountId: string
  workflowId: string // Adicionado para controle
  groups: string[]
  n8nWebhookUrl?: string
  headless?: boolean
}

// Controle de workflows em execução
const running = new Map<string, boolean>()

async function sendToN8n(webhookUrl: string, payload: any): Promise<{ ok: boolean; reply?: string }> {
  if (!webhookUrl) return { ok: false }
  const res = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  if (!res.ok) return { ok: false }
  const data = await res.json().catch(() => ({}))
  const reply = data?.reply ?? data?.data?.reply ?? data?.comment
  return { ok: true, reply }
}

export async function runFacebookAutomation(input: RunnerInput): Promise<void> {
  const { userId, accountId, workflowId, groups, n8nWebhookUrl, headless } = input

  if (!running.has(workflowId)) {
    console.log(`[runner] Workflow ${workflowId} não está marcado para rodar. Encerrando.`);
    return;
  }
  
  const context = await openContextForAccount(userId, accountId, headless)
  const page = await context.newPage()

  for (const groupUrl of groups) {
    if (!running.has(workflowId)) {
      console.log(`[runner] ⏹️ Workflow ${workflowId} parado. Interrompendo monitoramento do grupo: ${groupUrl}`)
      break
    }

    console.log(`[runner] ▶️ Monitorando grupo: ${groupUrl}`)

    // Passa 'workflowId' e 'running' para dentro do monitor
    for await (const post of monitorGroup(page, { groupUrl, workflowId, running })) {
      if (!running.has(workflowId)) break

      console.log(`[runner] 📌 Novo post ${post.contentHash} de ${post.author ?? 'desconhecido'}`)

      let reply: string | undefined
      if (n8nWebhookUrl) {
        const { ok, reply: r } = await sendToN8n(n8nWebhookUrl, {
          kind: 'facebook_post',
          groupUrl,
          author: post.author,
          text: post.text,
          screenshotPath: post.screenshotPath,
          url: post.url,
          contentHash: post.contentHash
        })
        reply = ok ? r : undefined
      }

      if (reply) {
        const result = await actions.postComment(page, post.url, reply)
        console.log(result.ok ? `[runner] 💬 Comentário publicado` : `[runner] ⚠️ Falha ao comentar: ${result.error}`)
      }
    }
  }

  await context.close()
  running.delete(workflowId) // Limpa o estado ao finalizar
  console.log(`[runner] ✅ Finalizado workflow ${workflowId}`)
}

// Compatibilidade com a API antiga do worker
export type WorkflowConfig = {
  id: string
  account_id: string
  user_id: string
  nodes: { group_url: string }[]
  webhook_url?: string;
}

export async function startRunner(cfg: WorkflowConfig) {
  const workflowId = cfg.id;
  running.set(workflowId, true) // Marca o workflow como "rodando"

  const groups = (cfg.nodes ?? []).map(n => n.group_url).filter(Boolean)
  
  console.log(`[runner] Configuração do workflow ${workflowId}:`, {
    groups: groups.length,
    groupUrls: groups
  });
  
  if (groups.length === 0) {
    console.log(`[runner] ⚠️ Nenhum grupo encontrado para o workflow ${workflowId}. Finalizando.`);
    running.delete(workflowId);
    return;
  }

  await runFacebookAutomation({
    workflowId,
    userId: cfg.user_id,
    accountId: cfg.account_id,
    groups,
    n8nWebhookUrl: cfg.webhook_url || process.env.N8N_WEBHOOK_URL,
    headless: process.env.HEADLESS !== 'false',
  })
}

/**
 * Função para parar um workflow em execução.
 */
export function stopRunner(workflowId: string) {
  console.log(`[runner] 🛑 Solicitando parada para o workflow ${workflowId}...`)
  running.delete(workflowId)
}