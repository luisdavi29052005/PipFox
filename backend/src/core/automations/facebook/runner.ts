// Local: backend/src/fb_bot/runner.ts

import { BrowserContext, Page, chromium } from 'playwright'
import { supabase } from '../../../services/supabaseClient'
import { openContextForAccount } from './session/context'
import { monitorGroup } from './actions/monitorGroups'
import { actions } from './actions/actions'
// Importa a nova função de extração
import { extractDataFromPostModal } from './utils/facebook-post-selectors'

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

// Controle global de posts já processados para evitar logs repetidos
const processedPostsGlobal = new Set<string>()

// Função sleep para pausas
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Atualiza a função sendToN8n para aceitar mais dados
const sendToN8n = async (webhookUrl: string, data: any) => {
  if (!webhookUrl) {
    // Webhook não configurado - silencioso
    return
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      timeout: 5000 // 5 segundos de timeout
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    // Log sucesso apenas em debug
    // console.log('[runner] ✅ Dados enviados para N8n')
  } catch (error) {
    console.error('[runner] ❌ N8n erro:', error.message)
    // Não propagar o erro para não quebrar o workflow
    return
  }
}

export async function runFacebookAutomation(input: RunnerInput): Promise<void> {
  const { userId, accountId, workflowId, groups, n8nWebhookUrl, headless } = input

  if (!running.has(workflowId)) {
    console.log(`[runner] Workflow ${workflowId} não está marcado para rodar. Encerrando.`);
    return;
  }

  const context = await openContextForAccount(userId, accountId, headless)

  // Processar todos os grupos em paralelo
  const groupMonitors = groups.map(async (groupUrl) => {
    if (!running.has(workflowId)) return
    if (!context.browser()?.isConnected()) {
      console.log(`[runner] ❌ Contexto do browser foi desconectado, encerrando workflow`)
      return
    }

    console.log(`[runner] ▶️ Monitorando grupo: ${groupUrl}`)

    // Criar uma nova página para cada grupo
    const groupPage = await context.newPage()

    try {
      const monitor = monitorGroup(groupPage, groupUrl, workflowId, running)
      for await (const post of monitor) {
        if (!running.has(workflowId)) break

        // Log apenas uma vez por post único, não para cada node
        const postKey = `${post.contentHash}-${groupUrl}`;
        if (!processedPostsGlobal.has(postKey)) {
          processedPostsGlobal.add(postKey);
          console.log(`[runner] 📌 Novo post encontrado: ${post.author ?? 'Autor desconhecido'} (ID: ${post.contentHash})`);
        }

        // Enviar dados estruturados para o n8n
        if (n8nWebhookUrl) {
          const payload = {
            kind: 'facebook_post_analysis',
            post: {
              url: post.url,
              author: post.author,
              text: post.text,
              images: post.images || [],
              timestamp: post.timestamp,
              contentHash: post.contentHash,
              extractedFromModal: post.extractedFromModal
            },
            source: {
              groupUrl: groupUrl,
              groupName: `Grupo ${groupUrl.split('/').pop()}` // Extrair nome simples do grupo
            },
            workflowId: workflowId
          }

          await sendToN8n(n8nWebhookUrl, payload)
        }

        // Lógica antiga de comentário direto foi removida,
        // pois agora depende do webhook.
      }
    } catch (monitorError) {
      console.error(`[runner] ❌ Erro no monitoramento do grupo ${groupUrl}:`, monitorError.message)
      if (monitorError.message.includes('Target page, context or browser has been closed')) {
        console.log(`[runner] 🔄 Contexto do browser foi fechado para ${groupUrl}, finalizando monitoramento`)
      } else {
        console.log(`[runner] 🔄 Erro recuperável em ${groupUrl}, aguardando 5s e continuando...`)
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    } finally {
      // Fechar a página específica do grupo
      await groupPage.close().catch(() => {})
    }
  })

  // Executar todos os monitores em paralelo
  await Promise.allSettled(groupMonitors)

  await context.close()
  running.delete(workflowId)
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