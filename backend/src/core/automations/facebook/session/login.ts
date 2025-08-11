import { chromium } from 'playwright';
import { supabase } from '../../../../services/supabaseClient';

type LoginResult = {
  isLogged: boolean;
  fbUserId: string | null;
};

async function getFbUserIdFromCookies(context: any): Promise<string | null> {
  try {
    const cookies = await context.cookies();
    const cUser = cookies.find((c: any) => c.name === 'c_user');
    return cUser?.value || null;
  } catch {
    return null;
  }
}

export async function openLoginWindow(userId: string, accountId: string): Promise<LoginResult> {
  const headless = String(process.env.HEADLESS || 'false').toLowerCase() === 'true';

  // Browser + contexto não persistente (salvamos o storageState manualmente)
  const browser = await chromium.launch({
    headless,
    args: [
      '--disable-notifications',
      '--disable-infobars',
      '--disable-dev-shm-usage',
    ],
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });

  let fbUserId: string | null = null;
  let isLogged = false;

  try {
    // Espera login (cookie c_user) OU fechamento da aba/navegador OU timeout
    await new Promise<void>((resolve) => {
      const MAX_WAIT_MS = 10 * 60 * 1000; // 10 minutos
      const timeout = setTimeout(() => {
        clearInterval(interval);
        resolve();
      }, MAX_WAIT_MS);

      const interval = setInterval(async () => {
        const id = await getFbUserIdFromCookies(context);
        if (id) {
          fbUserId = id;
          isLogged = true;
          clearInterval(interval);
          clearTimeout(timeout);
          resolve();
        }
      }, 1000);

      page.on('close', () => {
        clearInterval(interval);
        clearTimeout(timeout);
        resolve();
      });

      // forma correta para detectar fechamento do browser
      browser.on('disconnected', () => {
        clearInterval(interval);
        clearTimeout(timeout);
        resolve();
      });
    });
  } catch (err) {
    console.error('[login] Erro durante a espera do login:', err);
  }

  // Se logou, salva storageState no Supabase Storage
  if (isLogged) {
    try {
      const storageState = await context.storageState();
      const storageStateString = JSON.stringify(storageState, null, 2);
      const storagePath = `${userId}/${accountId}/storage-state.json`;

      const { error } = await supabase.storage
        .from('sessions')
        .upload(storagePath, Buffer.from(storageStateString, 'utf-8'), {
          contentType: 'application/json',
          upsert: true,
        });

      if (error) {
        throw new Error(`Falha ao salvar sessão no storage: ${error.message}`);
      }
      console.log(`[login] Sessão salva com sucesso em: ${storagePath}`);
    } catch (err) {
      console.error('[login] Falha ao salvar sessão:', err);
      isLogged = false; // se não conseguiu salvar, considera não logado
    }
  }

  await context.close();
  await browser.close();

  return { isLogged, fbUserId };
}

export type { LoginResult };