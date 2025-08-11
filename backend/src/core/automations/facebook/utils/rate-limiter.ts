
/**
 * Implementação de Token Bucket para rate limiting inteligente
 * Permite bursts de requisições enquanto mantém uma taxa média
 */
export class TokenBucket {
  private readonly capacity: number
  private readonly fillRatePerMs: number
  private tokens: number
  private lastRefill: number

  constructor(capacity: number = 10, fillRate: number = 5, fillIntervalSeconds: number = 60) {
    this.capacity = capacity
    this.tokens = capacity
    this.fillRatePerMs = fillRate / (fillIntervalSeconds * 1000)
    this.lastRefill = Date.now()
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    const tokensToAdd = elapsed * this.fillRatePerMs
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd)
      this.lastRefill = now
    }
  }

  async consume(tokensToTake: number = 1): Promise<void> {
    if (tokensToTake > this.capacity) {
      throw new Error(`Cannot take more tokens (${tokensToTake}) than bucket capacity (${this.capacity})`)
    }

    this.refill()

    if (this.tokens >= tokensToTake) {
      this.tokens -= tokensToTake
      return
    }

    // Calcular tempo de espera necessário
    const tokensNeeded = tokensToTake - this.tokens
    const timeToWaitMs = Math.ceil(tokensNeeded / this.fillRatePerMs)

    console.log(`[rate-limiter] Aguardando ${timeToWaitMs}ms para tokens suficientes`)
    
    await new Promise(resolve => setTimeout(resolve, timeToWaitMs))
    await this.consume(tokensToTake) // Recurse após esperar
  }

  getStatus(): { tokens: number; capacity: number; fillRate: number } {
    this.refill()
    return {
      tokens: Math.floor(this.tokens),
      capacity: this.capacity,
      fillRate: this.fillRatePerMs * 1000
    }
  }
}
