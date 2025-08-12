
import { Page } from 'playwright'
import {
  FEED,
  findAllPosts,
  extractMetaFromPost,
  extractDataFromPostModal,
  openPostModalFromArticle,
  closePostModal
} from '../utils/facebook-post-selectors'

export type MonitorOptions = {
  maxPosts?: number
  delayBetween?: number
  useGraphQLTap?: boolean
}

export type ExtractedPost = {
  url: string | null
  author: string
  text: string
  images: string[]
  timestamp: string
  extractedFromModal: boolean
}

export async function* monitorGroup(
  page: Page,
  groupUrl: string,
  workflowId: string,
  running: Map<string, boolean>
) {
  console.log('[monitorGroup] Iniciando monitoramento:', { groupUrl, workflowId })

  try {
    // Navegar para o grupo
    await page.goto(String(groupUrl), { waitUntil: 'domcontentloaded' })
    
    // Aguardar feed aparecer
    await page.waitForSelector(FEED, { timeout: 15000 })
    console.log('[monitorGroup] Feed carregado com sucesso')
    
    // Aguardar um pouco mais para garantir que os posts carregaram
    await page.waitForTimeout(3000)
    
    let processedPosts = new Set<string>()
    
    // Loop principal de monitoramento
    while (running.get(workflowId)) {
      try {
        console.log('[monitorGroup] Buscando novos posts...')
        
        // Buscar posts no feed
        let posts = await findAllPosts(page)
        console.log(`[monitorGroup] Encontrados ${posts.length} posts`)
        
        // Se não encontrou posts, tentar scroll
        if (posts.length === 0) {
          console.log('[monitorGroup] Tentando scroll para carregar posts...')
          await page.evaluate(() => window.scrollBy(0, 500))
          await page.waitForTimeout(2000)
          posts = await findAllPosts(page)
          console.log(`[monitorGroup] Após scroll: ${posts.length} posts`)
        }
        
        // Processar cada post
        for (let i = 0; i < Math.min(posts.length, 5); i++) {
          if (!running.get(workflowId)) break
          
          const post = posts[i]
          console.log(`[monitorGroup] Processando post ${i + 1}/${posts.length}`)
          
          try {
            // Extrair metadados básicos primeiro
            const meta = await extractMetaFromPost(post)
            if (!meta?.url) {
              console.log('[monitorGroup] Post sem URL, pulando...')
              continue
            }
            
            // Verificar se já foi processado
            const postId = meta.url.split('/').pop() || meta.url
            if (processedPosts.has(postId)) {
              console.log('[monitorGroup] Post já processado, pulando...')
              continue
            }
            
            // Tentar abrir o post
            const opened = await openPostModalFromArticle(post, page)
            if (!opened) {
              console.log('[monitorGroup] Não conseguiu abrir post, pulando...')
              continue
            }
            
            // Extrair dados detalhados
            const detailed = await extractDataFromPostModal(page)
            if (!detailed) {
              console.log('[monitorGroup] Falha na extração detalhada, fechando...')
              await closePostModal(page)
              continue
            }
            
            // Marcar como processado
            processedPosts.add(postId)
            
            // Retornar dados do post
            const extractedPost: ExtractedPost = {
              url: meta.url,
              author: detailed.author || meta.author || 'Desconhecido',
              text: detailed.text || meta.text || '',
              images: detailed.images || (meta.image ? [meta.image] : []),
              timestamp: detailed.timestamp,
              extractedFromModal: true
            }
            
            console.log(`[monitorGroup] Post extraído: ${extractedPost.author} - ${extractedPost.text.substring(0, 50)}...`)
            
            yield {
              success: true,
              post: extractedPost,
              timestamp: new Date().toISOString(),
              groupUrl: String(groupUrl),
              workflowId
            }
            
            // Fechar modal/voltar
            await closePostModal(page)
            await page.waitForTimeout(1000)
            
          } catch (postError) {
            console.error(`[monitorGroup] Erro ao processar post ${i}:`, postError)
            await closePostModal(page).catch(() => {})
            continue
          }
        }
        
        // Aguardar antes da próxima verificação
        console.log('[monitorGroup] Aguardando próxima verificação...')
        await page.waitForTimeout(30000) // 30 segundos
        
        // Fazer scroll para ver se há posts novos
        await page.evaluate(() => window.scrollBy(0, 300))
        await page.waitForTimeout(2000)
        
      } catch (loopError) {
        console.error('[monitorGroup] Erro no loop de monitoramento:', loopError)
        yield {
          success: false,
          error: loopError instanceof Error ? loopError.message : String(loopError),
          timestamp: new Date().toISOString(),
          groupUrl: String(groupUrl),
          workflowId
        }
        
        // Aguardar antes de tentar novamente
        await page.waitForTimeout(10000)
      }
    }
    
  } catch (error) {
    console.error('[monitorGroup] Erro fatal:', error)
    yield {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      groupUrl: String(groupUrl),
      workflowId
    }
  }
  
  console.log('[monitorGroup] Monitoramento finalizado')
}

export default monitorGroup
