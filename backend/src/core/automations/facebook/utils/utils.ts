import { v4 as uuid } from 'uuid';

/* ----------------------------------------------------- */
/*  VALIDADORES                                          */
/* ----------------------------------------------------- */
export function validateGroupUrl(url: string): boolean {
  return /^https:\/\/www\.facebook\.com\/groups\/\d+/.test(url);
}

export function validateWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

/* Sanitiza a lista (máx. 20) */
export function sanitizeKeywords(keywords: string[] = []): string[] {
  return keywords
    .filter(k => k && k.trim())
    .map(k => k.trim().toLowerCase())
    .slice(0, 20);
}

/* Gera UUID válido */
export function generateWorkflowId(): string {
  return uuid();
}
