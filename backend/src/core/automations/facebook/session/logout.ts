import { supabase } from '../../../../services/supabaseClient';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { BrowserContext } from 'playwright';
import { openContextForAccount } from './context';

/**
 * Faz logout real no Facebook (tentando diferentes UIs) e remove a sessão do Supabase.
 * Fluxo:
 * 1) Abre contexto com sessão do Supabase
 * 2) Tenta logout via UI web padrão (www) e fallback via m.facebook.com
 * 3) Fecha contexto
 * 4) Remove storage-state.json do bucket 'sessions'
 */
export async function logoutFacebookAndDeleteSession(userId: string, accountId: string) {
  const context: BrowserContext = await openContextForAccount(userId, accountId, false);
  const page = await context.newPage();

  // Helper para verificar se cookie c_user ainda existe
  async function hasCUserCookie(): Promise<boolean> {
    const cookies = await context.cookies();
    return cookies.some(c => c.name === 'c_user');
  }

  try {
    // Tenta pela UI desktop
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });

    // Abre o menu de conta (tenta vários nomes/idiomas)
    const menuCandidates = [
      // getByRole name candidates
      { type: 'role' as const, role: 'button', name: /conta|account|perfil|profile|account controls|your profile/i },
      // generic aria-label
      { type: 'selector' as const, selector: '[aria-label="Conta"]' },
      { type: 'selector' as const, selector: '[aria-label="Account"]' },
      { type: 'selector' as const, selector: '[aria-label*="Conta"]' },
      { type: 'selector' as const, selector: '[aria-label*="Account"]' },
    ];

    let openedMenu = false;
    for (const m of menuCandidates) {
      try {
        if (m.type === 'role') {
          await page.getByRole(m.role as any, { name: m.name }).click({ timeout: 3000 });
        } else {
          await page.click(m.selector, { timeout: 3000 });
        }
        openedMenu = true;
        break;
      } catch {}
    }

    if (!openedMenu) {
      throw new Error('Não foi possível abrir o menu de conta pela UI desktop.');
    }

    // Clica em "Sair" (múltiplos idiomas)
    const logoutTexts = /sair|log out|salir|cerrar sesión/i;
    try {
      await page.getByText(logoutTexts, { exact: false }).click({ timeout: 3000 });
    } catch {
      // fallback por seletor de texto
      await page.click(`text=/(${logoutTexts.source})/i`, { timeout: 3000 });
    }

    await page.waitForLoadState('networkidle', { timeout: 8000 });

    // Verifica se realmente deslogou (sem c_user)
    if (await hasCUserCookie()) {
      throw new Error('Cookie c_user ainda presente após tentativa de logout desktop.');
    }

    console.log('[logout] Logout realizado via UI desktop.');
  } catch (desktopErr) {
    console.warn('[logout] Fallback para m.facebook.com:', desktopErr);
    // Fallback via m.facebook.com (UI mais simples)
    try {
      await page.goto('https://m.facebook.com/menu', { waitUntil: 'domcontentloaded' });
      await page.getByText(/sair|log out|salir|cerrar sesión/i, { exact: false }).click({ timeout: 5000 });
      await page.waitForLoadState('networkidle', { timeout: 8000 });

      if (await hasCUserCookie()) {
        throw new Error('Cookie c_user ainda presente após tentativa de logout mobile.');
      }

      console.log('[logout] Logout realizado via UI mobile.');
    } catch (mobileErr) {
      console.warn('[logout] Falha no logout via mobile:', mobileErr);
    }
  }

  await context.close();

  // Remove storage-state.json do Supabase
  const storagePath = `${userId}/${accountId}/storage-state.json`;
  const { error } = await supabase.storage
    .from('sessions')
    .remove([storagePath]);

  if (error) {
    throw new Error(`Falha ao apagar sessão do Storage: ${error.message}`);
  }

  // Remove possível temp file
  try {
    const tempSessionPath = path.join(os.tmpdir(), `pipefox_session_${accountId}.json`);
    await fs.remove(tempSessionPath);
  } catch {}

  console.log('[logout] Sessão removida do Supabase Storage!');
}