// backend/src/core/automations/facebook/utils/facebook-post-selectors.ts
// Seletores otimizados baseados na análise real do Facebook (2025)

export const FEED = '[role="feed"]';

// Blocos a EXCLUIR (comentários, reels, etc.)
export const EXCLUDE = [
  // Comentários específicos
  '[aria-label*="Comentário de"]', // "Comentário de Emma Taylor Há 16 minutos"
  '[aria-label*="Comment by"]',
  '[aria-label*="Comment from"]',
  '[aria-label*="Comentários"]',
  '[aria-label*="Comments"]',
  '[aria-label*="Responder"]',
  '[aria-label*="Write a comment"]',
  '[aria-label*="Escreva um comentário"]',
  
  // Elementos dentro da seção de comentários
  '[role="article"]:has([aria-label*="Curtir"][role="button"])',
  '[role="article"]:has([aria-label*="Reagir"][role="button"])',
  '[role="article"]:has([aria-label*="Responder"][role="button"])',
  
  // Outros elementos a excluir
  '[data-visualcompletion="ignore-dynamic"] [role="article"]',
  '[data-pagelet*="Stories"]',
  '[aria-label*="Stories"]',
  '[aria-label*="Reels"]',
  'div[role="dialog"] *',
].join(", ");

// Delimitadores do post (rodapé/ações) - MAIS ESPECÍFICOS
export const ACTIONS = [
  '[role="toolbar"]',
  '[aria-label*="Actions for this post"]',
  '[aria-label*="Ações da publicação"]',
  'div[role="group"]:has(button[aria-label*="Like"], button[aria-label*="Curtir"])',
  'div:has(> div[role="button"]:has-text("Like"))',
  'div:has(> div[role="button"]:has-text("Curtir"))',
  'div:has(> div[role="button"]:has-text("Comentar"))',
  'div:has(> div[role="button"]:has-text("Comment"))',
  'div:has(> div[role="button"]:has-text("Compartilhar"))',
  'div:has(> div[role="button"]:has-text("Share"))',
].join(", ");

// Candidatos de container do POST - FILTRADOS para excluir comentários
export const POST_CONTAINERS: string[] = [
  // Prioridade ALTA - Posts principais com role="article" e aria-posinset
  `${FEED} > div [role="article"][aria-posinset]`,
  `${FEED} [role="article"][aria-posinset]`,

  // Prioridade MÉDIA - Posts principais com data-ad-rendering-role (específico para posts)
  `${FEED} [role="article"]:has([data-ad-rendering-role="profile_name"])`,
  `${FEED} [role="article"]:has([data-ad-rendering-role="story_message"])`,
  
  // Prioridade BAIXA - Estruturas específicas de posts principais
  `${FEED} div:has([data-ad-comet-preview="message"]):has([data-ad-rendering-role])`,
  `${FEED} div:has(h3 a[aria-label][role="link"]):has([data-ad-rendering-role])`,
];

// Seletores de AUTOR - ATUALIZADOS baseado nas screenshots de 2025
export const AUTHOR: string[] = [
  // Prioridade ALTA - padrões vistos nas screenshots
  'h3 a[role="link"] span',
  'h3 a[role="link"]',
  'h4 a[role="link"] span', 
  'h4 a[role="link"]',
  
  // Seletores mais específicos para grupos
  'div[role="article"] h3 span',
  'div[role="article"] h4 span',
  'div[role="article"] strong',
  
  // Fallbacks estruturais
  'a[aria-label][role="link"] span',
  'a[aria-label][role="link"]',
  'a[role="link"][href*="/user/"] span',
  'a[role="link"][href*="/people/"] span',
  'a[role="link"][href*="/profile.php"] span',
  "h3 strong",
  "h4 strong",
  
  // Seletores genéricos como último recurso
  'a[href*="facebook.com"][role="link"] span',
  'a[href*="facebook.com"][role="link"]',
];

// Seletores de TEXTO - OTIMIZADOS para Comet
export const TEXT: string[] = [
  // Prioridade ALTA - padrões Comet que bateram
  '[data-ad-preview*="message"]',
  "[data-ad-comet-preview]",

  // Fallbacks estruturais
  "div[dir] div:not(:has(a,img,video,svg,button))",
  "div[lang] div:not(:has(a,img,video,svg,button))",
  '[data-testid*="post_message"]',
];

// Seletores de IMAGEM - REFINADOS
export const IMAGES: string[] = [
  // Prioridade ALTA - padrões que funcionam
  'img[src*="fbcdn"]',
  'img[src*="scontent"]',
  'img[src*="safe_image"]',

  // Estruturais
  'a[href*="photo"] img',
  'a[role="link"] img:not([src*="emoji"]):not([src*="static"]):not([src*="sprited"])',
];

// Seletores de PERMALINK
export const PERMALINK: string[] = [
  'a[href*="/posts/"]',
  'a[href*="/permalink/"]',
  "a[aria-label] abbr",
  '[data-testid*="story-subtitle"] a',
];

// Utilitários ---------------------------------------------------------------
export const pickFirst = async (root: any, selectors: string[]) => {
  for (const sel of selectors) {
    try {
      const el = await root.querySelector(sel);
      if (el) return el;
    } catch (err) {
      // Continua para próximo seletor
    }
  }
  return null;
};

export const findAllPosts = async (page: any) => {
  const results = [];

  // Tentar cada estratégia de detecção
  for (const selector of POST_CONTAINERS) {
    try {
      let loc = page.locator(selector);

      // Filtro para excluir comentários e elementos não-posts
      loc = loc.filter({ hasNot: page.locator(EXCLUDE) });
      
      // Filtro adicional: garantir que NÃO é um comentário verificando o aria-label
      loc = loc.filter({ hasNot: page.locator('[aria-label*="Comentário de"]') });
      loc = loc.filter({ hasNot: page.locator('[aria-label*="Comment by"]') });

      const count = await loc.count();
      console.log(
        `[findAllPosts] Seletor "${selector}" encontrou ${count} posts`,
      );

      if (count > 0) {
        // Limitar a 5 posts para evitar timeout
        const maxPosts = Math.min(count, 5);
        
        for (let i = 0; i < maxPosts; i++) {
          try {
            const postLoc = loc.nth(i);
            const isVisible = await postLoc.isVisible({ timeout: 3000 });
            if (isVisible) {
              // Validação adicional: verificar se realmente é um post principal
              const ariaLabel = await postLoc.getAttribute('aria-label').catch(() => '');
              if (ariaLabel && ariaLabel.includes('Comentário de')) {
                console.log(`[findAllPosts] ⚠️ Pulando comentário detectado: ${ariaLabel}`);
                continue;
              }

              const post = await postLoc.elementHandle();
              if (post) {
                results.push(post);
                console.log(`[findAllPosts] ✅ Post ${i} coletado com sucesso`);
              }
            }
          } catch (error) {
            console.log(`[findAllPosts] ⚠️ Erro ao coletar post ${i}:`, error.message);
            continue;
          }
        }
        
        if (results.length > 0) {
          console.log(`[findAllPosts] 🎯 Retornando ${results.length} posts para processamento`);
          break; // Se encontrou posts com este seletor, para aqui
        }
      }
    } catch (err) {
      console.log(`[findAllPosts] Erro no seletor "${selector}":`, err.message);
    }
  }

  return results;
};

export async function extractMetaFromPost(el: any) {
  console.log("[extractMeta] Iniciando extração de metadados do post...");

  // Garantir que o post esteja visível
  try {
    await el.scrollIntoViewIfNeeded?.();
    await new Promise(resolve => setTimeout(resolve, 500)); // Aguardar renderização
  } catch (error) {
    console.log("[extractMeta] ⚠️ Erro ao rolar para o post:", error.message);
  }

  // ESTRATÉGIA FOCADA: Pegar APENAS o autor do post principal (não dos comentários)
  let author: string | undefined;

  // Estratégia 1: Procurar autor com data-ad-rendering-role (específico para posts principais)
  try {
    console.log("[extractMeta] 🎯 Estratégia: Procurando autor do POST principal...");
    
    // Primeiro: tentar seletores específicos para posts principais
    const mainPostAuthorSelectors = [
      '[data-ad-rendering-role="profile_name"] span',
      '[data-ad-rendering-role="profile_name"] a',
      'h2:has([data-ad-rendering-role]) a span',
      'h2:has([data-ad-rendering-role]) a',
    ];

    for (const selector of mainPostAuthorSelectors) {
      const authorLoc = el.locator(selector).first();
      const count = await authorLoc.count();
      
      if (count > 0) {
        const text = await authorLoc.textContent().catch(() => '');
        const aria = await authorLoc.getAttribute('aria-label').catch(() => '');
        
        const potentialAuthor = (text || aria || '').trim();
        
        if (potentialAuthor && 
            potentialAuthor.length > 1 && 
            !potentialAuthor.match(/^\d+\s*(min|h|d|s|hora|dia)/) && 
            !potentialAuthor.match(/^(Like|Curtir|Comment|Comentar|Share|Compartilhar|Ver|See)$/i) &&
            !potentialAuthor.includes('facebook.com/hashtag')
           ) {
          author = potentialAuthor;
          console.log(`[extractMeta] ✅ Autor do post principal encontrado: "${author}"`);
          break;
        }
      }
    }

    // Fallback: Procurar links de perfil gerais mas validar posição
    if (!author) {
      const profileSelectors = [
        'a[role="link"][href*="/user/"]',
        'a[role="link"][href*="/people/"]', 
        'a[role="link"][href*="profile.php"]',
        'a[role="link"][aria-label]'
      ];

      for (const selector of profileSelectors) {
        const firstLink = el.locator(selector).first();
        const count = await firstLink.count();
        
        if (count > 0) {
          const href = await firstLink.getAttribute('href').catch(() => '');
          const text = await firstLink.textContent().catch(() => '');
          const aria = await firstLink.getAttribute('aria-label').catch(() => '');
          
          console.log(`[extractMeta] Primeiro link encontrado: href="${href}", text="${text}", aria="${aria}"`);
          
          // Usar texto do link ou aria-label
          const potentialAuthor = (text || aria || '').trim();
          
          // Validar se parece um nome (não é timestamp, ação, etc.)
          if (potentialAuthor && 
              potentialAuthor.length > 1 && 
              !potentialAuthor.match(/^\d+\s*(min|h|d|s|hora|dia)/) && // Não é timestamp
              !potentialAuthor.match(/^(Like|Curtir|Comment|Comentar|Share|Compartilhar|Ver|See)$/i) && // Não é ação
              !potentialAuthor.includes('facebook.com/hashtag') // Não é hashtag
             ) {
            author = potentialAuthor;
            console.log(`[extractMeta] ✅ PRIMEIRO autor encontrado: "${author}"`);
            break;
          }
        }
      }
    }
  } catch (err) {
    console.log("[extractMeta] Erro na estratégia do primeiro autor:", err.message);
  }

  // Estratégia 2: Fallback - H3/H4 com links (estrutura tradicional)
  if (!author) {
    console.log("[extractMeta] 🔄 Fallback: Procurando em estruturas H3/H4...");
    
    const headerSelectors = [
      'h3 a[role="link"] span',
      'h3 a[role="link"]', 
      'h4 a[role="link"] span',
      'h4 a[role="link"]',
      'h3 strong',
      'h4 strong'
    ];

    for (const sel of headerSelectors) {
      try {
        const authorLoc = el.locator(sel).first();
        const count = await authorLoc.count();
        
        if (count > 0) {
          const text = await authorLoc.textContent().catch(() => '');
          const aria = await authorLoc.getAttribute('aria-label').catch(() => '');
          
          const potentialAuthor = (aria || text || '').trim();
          if (potentialAuthor && potentialAuthor.length > 1) {
            author = potentialAuthor;
            console.log(`[extractMeta] ✅ Autor encontrado via fallback "${sel}": "${author}"`);
            break;
          }
        }
      } catch (err) {
        console.log(`[extractMeta] Erro no fallback "${sel}":`, err.message);
      }
    }
  }

  if (!author) {
    console.log("[extractMeta] ⚠️ Nenhum autor encontrado após todas as estratégias");
  }

  // Extrair texto APENAS do POST PRINCIPAL (não dos comentários)
  let text = "";
  
  console.log("[extractMeta] 🎯 Estratégia: Procurando texto APENAS do POST principal...");
  
  // Estratégia 1: Procurar contêiner de mensagem COM data-ad-rendering-role (específico para posts)
  const primaryTextSelectors = [
    '[data-ad-rendering-role="story_message"] [data-ad-preview*="message"]',
    '[data-ad-rendering-role="story_message"] [data-ad-comet-preview]',
    '[data-ad-rendering-role="story_message"]',
    '[data-ad-comet-preview="message"]:not([role="article"] [role="article"] *)', // Não dentro de comentários
    '[data-testid*="post_message"]:not([role="article"] [role="article"] *)'
  ];

  for (const sel of primaryTextSelectors) {
    try {
      const textLoc = el.locator(sel).first(); // Pegar apenas o PRIMEIRO (do post, não comentário)
      const count = await textLoc.count();
      
      if (count > 0) {
        const textContent = await textLoc.textContent().catch(() => '');
        if (textContent && textContent.trim().length > 5) {
          text = textContent.trim();
          console.log(`[extractMeta] ✅ Texto principal encontrado com "${sel}": "${text.substring(0, 50)}..."`);
          break;
        }
      }
    } catch (err) {
      console.log(`[extractMeta] Erro no seletor principal "${sel}":`, err.message);
    }
  }

  // Estratégia 2: Se não achou texto específico, procurar na estrutura geral MAS validar posição
  if (!text) {
    console.log("[extractMeta] 🔄 Fallback: Procurando texto na estrutura geral...");
    
    const structuralSelectors = [
      'div[dir="auto"]:not([role="button"])', // Evitar botões
      'p:not([role="button"])',
      'span[dir="auto"]:not([role="button"])',
      'div[lang]:not([role="button"])'
    ];

    for (const sel of structuralSelectors) {
      try {
        const blocks = el.locator(sel);
        const count = await blocks.count();
        
        if (count > 0) {
          // Pegar apenas o PRIMEIRO bloco (mais provável de ser o post principal)
          const firstBlock = blocks.first();
          const t = await firstBlock.textContent().catch(() => '');
          const trimmed = t.trim();
          
          // Validações mais rigorosas para evitar comentários/ações
          if (trimmed && 
              trimmed.length > 5 &&
              !trimmed.match(/^\d+\s*(min|h|d|s|hora|dia)/) && // Não é timestamp
              !trimmed.match(/^(Like|Curtir|Comment|Comentar|Share|Compartilhar|Ver|See|Responder|Reply)$/i) && // Não é ação
              !trimmed.includes('Escreva um comentário') && // Não é placeholder
              !trimmed.includes('Write a comment') &&
              !trimmed.match(/^\d+$/) && // Não é só número
              !trimmed.match(/^[0-9\s]*$/) // Não é só números e espaços
             ) {
            text = trimmed;
            console.log(`[extractMeta] ✅ Texto encontrado via fallback "${sel}": "${text.substring(0, 50)}..."`);
            break;
          }
        }
      } catch (err) {
        console.log(`[extractMeta] Erro no fallback de texto "${sel}":`, err.message);
      }
    }
  }

  if (!text) {
    console.log("[extractMeta] ⚠️ Nenhum texto encontrado");
  }

  // Extrair imagem usando Playwright Locator API
  let imageUrl: string | undefined;
  const imageSelectors = [
    'img[src*="fbcdn"]',
    'img[src*="scontent"]',
    'img[src*="safe_image"]',
    'a[href*="photo"] img',
    'img:not([src*="emoji"]):not([src*="static"]):not([src*="sprited"])',
  ];

  for (const sel of imageSelectors) {
    try {
      const imgs = el.locator(sel);
      const count = await imgs.count();
      for (let i = 0; i < count; i++) {
        const src = await imgs
          .nth(i)
          .getAttribute("src")
          .catch(() => null);
        if (!src) continue;

        const low = src.toLowerCase();
        if (
          low.includes("emoji") ||
          low.includes("static") ||
          low.includes("sprited")
        )
          continue;

        imageUrl = src;
        break;
      }
      if (imageUrl) break;
    } catch (err) {
      // Continua
    }
  }

  // Extrair URL do post usando Playwright Locator API
  let url: string | undefined;
  const permalinkSelectors = [
    'a[href*="/posts/"]',
    'a[href*="/permalink/"]',
    '[data-testid*="story-subtitle"] a',
  ];

  for (const sel of permalinkSelectors) {
    try {
      const linkLoc = el.locator(sel).first();
      const count = await linkLoc.count();
      if (count > 0) {
        url = await linkLoc.getAttribute("href").catch(() => null);
        if (url) break;
      }
    } catch (err) {
      // Continua
    }
  }

  const result = {
    author,
    text: text || undefined,
    image: imageUrl,
    url,
  };

  console.log("[extractMeta] Resultado final:", {
    author: author || "NÃO ENCONTRADO",
    textLength: text?.length || 0,
    hasImage: !!imageUrl,
    hasUrl: !!url,
  });

  return result;
}

// Screenshot do post com scroll inteligente e verificação de dimensões
export async function postClipBox(el: any, page?: any) {
  try {
    // Se el é um Locator, precisamos obter o ElementHandle primeiro
    let element = el;
    if (el.boundingBox === undefined && el.elementHandle) {
      element = await el.elementHandle();
    }

    // Garantir que o elemento esteja visível na viewport
    try {
      await element.scrollIntoViewIfNeeded();
      await page?.waitForTimeout?.(1000); // Aguardar renderização
    } catch (scrollError) {
      console.log("[postClipBox] ⚠️ Erro ao rolar para o elemento:", scrollError.message);
    }

    const postBox = await element.boundingBox();
    if (!postBox) {
      console.log("[postClipBox] ⚠️ Não foi possível obter boundingBox do post");
      return null;
    }

    // Verificar se o post tem dimensões válidas
    if (postBox.width <= 0 || postBox.height <= 0) {
      console.log("[postClipBox] ⚠️ Post tem dimensões inválidas:", postBox);
      return null;
    }

    // Obter dimensões da viewport
    let viewport = { width: 1200, height: 800 }; // Valores padrão
    if (page) {
      try {
        viewport = page.viewportSize() || viewport;
      } catch (error) {
        console.log("[postClipBox] ⚠️ Erro ao obter viewport, usando padrão");
      }
    }

    // Verificar se está fora da viewport e ajustar
    let adjustedBox = { ...postBox };
    
    // Ajustar X (horizontal)
    if (postBox.x < 0) {
      adjustedBox.x = 0;
      adjustedBox.width = Math.max(0, postBox.width + postBox.x);
    } else if (postBox.x + postBox.width > viewport.width) {
      adjustedBox.width = Math.max(0, viewport.width - postBox.x);
    }
    
    // Ajustar Y (vertical) - CRÍTICO para evitar height negativo
    if (postBox.y < 0) {
      adjustedBox.y = 0;
      adjustedBox.height = Math.max(0, postBox.height + postBox.y);
    } else if (postBox.y + postBox.height > viewport.height) {
      adjustedBox.height = Math.max(0, viewport.height - postBox.y);
    }

    // Verificação final de segurança
    if (adjustedBox.width <= 0 || adjustedBox.height <= 0) {
      console.log("[postClipBox] ⚠️ Dimensões ajustadas inválidas, usando screenshot da viewport");
      return {
        x: 0,
        y: 0,
        width: Math.min(viewport.width, 800),
        height: Math.min(viewport.height, 600)
      };
    }

    // Log do resultado
    if (postBox.x !== adjustedBox.x || postBox.y !== adjustedBox.y || 
        postBox.width !== adjustedBox.width || postBox.height !== adjustedBox.height) {
      console.log("[postClipBox] ✅ BoundingBox ajustado:", {
        original: postBox,
        adjusted: adjustedBox,
        viewport
      });
    } else {
      console.log("[postClipBox] ✅ Usando boundingBox original do post:", adjustedBox);
    }

    return adjustedBox;
  } catch (err) {
    console.log("[postClipBox] ❌ Erro ao calcular clip:", err.message);
    return null;
  }
}
