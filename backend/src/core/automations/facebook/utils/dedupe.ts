
import crypto from 'crypto'

export interface PostMeta {
  url?: string
  author?: string  
  text?: string
  timestamp?: string
  contentHash?: string
}

/**
 * Gera hash único para deduplicação de posts
 * Baseado em URL, autor, texto e timestamp para detectar edições
 */
export function generatePostHash(meta: PostMeta): string {
  const content = [
    meta.url || 'no-url',
    meta.author || 'no-author', 
    meta.text?.substring(0, 500) || 'no-text', // Primeiros 500 chars para performance
    meta.timestamp || 'no-timestamp'
  ].join('|').toLowerCase().trim()

  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16)
}

/**
 * Gerenciador de hashes processados em memória
 */
export class PostDeduplicator {
  private processedHashes = new Set<string>()
  private readonly maxSize: number

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize
  }

  isProcessed(hash: string): boolean {
    return this.processedHashes.has(hash)
  }

  markAsProcessed(hash: string): void {
    // Limpar cache se atingir limite
    if (this.processedHashes.size >= this.maxSize) {
      console.log(`[dedupe] Cache atingiu limite (${this.maxSize}), limpando 50%`)
      const hashes = Array.from(this.processedHashes)
      this.processedHashes.clear()
      
      // Manter apenas a segunda metade (mais recentes)
      hashes.slice(Math.floor(hashes.length / 2)).forEach(h => 
        this.processedHashes.add(h)
      )
    }
    
    this.processedHashes.add(hash)
  }

  getStats(): { processed: number; maxSize: number } {
    return {
      processed: this.processedHashes.size,
      maxSize: this.maxSize
    }
  }

  clear(): void {
    this.processedHashes.clear()
  }
}
