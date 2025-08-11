import { BrowserContext, Page, chromium } from 'playwright'
import { openContextForAccount } from './session/context'
import { monitorGroup } from './actions/monitorGroups'
import { actions } from './actions/actions'

/**
 * Config da orquestração
 */
export interface RunnerInput {
  userId: string
  accountId: string
  groups: string[]            // URLs dos grupos
  n8nWebhookUrl?: string      // opcional — se for usado no fluxo
  headless?: boolean
}

async function sendToN8n(webhookUrl: string, payload: any): Promise<{ ok: boolean; reply?: string }> {
  if (!webhookUrl) return { ok: false }
  const res = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  if (!res.ok) return { ok: false }
  const data = await res.json().catch(() => ({}))
  // Adapte o caminho do texto retornado pela sua automação
  const reply = data?.reply ?? data?.data?.reply ?? data?.comment
  return { ok: true, reply }
}

export async function runFacebookAutomation(input: RunnerInput): Promise<void> {
  const { userId, accountId, groups, n8nWebhookUrl, headless } = input

  const context = await openContextForAccount(userId, accountId, headless)
  const page = await context.newPage()

  for (const groupUrl of groups) {
    console.log(`[runner] ▶️ Monitorando grupo: ${groupUrl}`)

    for await (const post of monitorGroup(page, { groupUrl })) {
      console.log(`[runner] 📌 Novo post ${post.contentHash} de ${post.author ?? 'desconhecido'}`)

      // 1) Envia para N8N (se configurado) para gerar a resposta
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

      // 2) Se houver resposta, comenta no post
      if (reply) {
        const result = await actions.postComment({ page, post: post.element, message: reply })
        console.log(result.ok ? `[runner] 💬 Comentário publicado` : `[runner] ⚠️ Falha ao comentar: ${result.error}`)
      }

      // 3) Continua o loop — o monitorGroup faz o scroll progressivo
    }
  }

  await context.close()
}

// Compat: manter API antiga para o worker
export type WorkflowConfig = {
  id: string
  account_id: string
  nodes: { group_url: string }[]
}

/** Redireciona o contrato antigo para o novo orquestrador */
export async function startRunner(cfg: WorkflowConfig) {
  const groups = (cfg.nodes ?? []).map(n => n.group_url).filter(Boolean)

  // userId: pegue do env ou ajuste para buscar no banco, se preferir
  const userId = process.env.USER_ID || ''
  if (!userId) {
    console.warn('[runner] USER_ID não definido no ambiente, defina para abrir o contexto da conta correta')
  }

  // accountId vem do cfg antigo
  const accountId = cfg.account_id

  // chame seu orquestrador novo aqui
  await runFacebookAutomation({
    userId,
    accountId,
    groups,
    n8nWebhookUrl: process.env.N8N_WEBHOOK_URL,
    headless: process.env.HEADLESS !== 'false',
  })
}
