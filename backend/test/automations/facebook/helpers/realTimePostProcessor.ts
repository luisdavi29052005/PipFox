

import { PostData } from '../selectorTester';

// =============================================================================
// REAL-TIME POST PROCESSOR HELPER
// =============================================================================

export class RealTimePostProcessor {
  private static instance: RealTimePostProcessor;
  private isCurrentlyProcessing: boolean = false;
  private processor: any = null;

  static getInstance(): RealTimePostProcessor {
    if (!RealTimePostProcessor.instance) {
      RealTimePostProcessor.instance = new RealTimePostProcessor();
    }
    return RealTimePostProcessor.instance;
  }

  setProcessor(processor: any): void {
    this.processor = processor;
    this.isCurrentlyProcessing = true;
    console.log('[REAL-TIME-PROCESSOR] 🎯 Processador em tempo real ativado');
  }

  stopProcessor(): void {
    this.isCurrentlyProcessing = false;
    this.processor = null;
    console.log('[REAL-TIME-PROCESSOR] 🏁 Processador em tempo real desativado');
  }

  async processPostInRealTime(post: PostData & { groupUrl: string }): Promise<void> {
    if (this.isCurrentlyProcessing && this.processor) {
      await this.processor.processPostInRealTime(post);
    }
  }

  isProcessing(): boolean {
    return this.isCurrentlyProcessing;
  }
}
