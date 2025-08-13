
# 🧪 GUIA COMPLETO DOS TESTES DE AUTOMAÇÃO

## Visão Geral

Este sistema de testes valida a automação do Facebook do PipeFox. Inclui testes de login, health check dos seletores e extração completa de posts.

## 📋 Comandos Principais

### Ajuda e Listagens
```bash
# Mostra ajuda completa
npx tsx testRunner.ts --help
npm run help

# Lista contas disponíveis
npx tsx testRunner.ts --list-accounts
npm run accounts
```

### Execução Simples (Recomendado)
```bash
# Auto discovery completo - mais fácil
npx tsx testRunner.ts

# Teste rápido de login apenas
npx tsx testRunner.ts --max-posts=3 --only-login

# Execução headless (sem interface)
npx tsx testRunner.ts --headless
```

### Execução com Parâmetros
```bash
# Com IDs específicos
npx tsx testRunner.ts userId accountId groupUrl

# Auto discovery com grupo específico
npx tsx testRunner.ts auto auto https://facebook.com/groups/123456
```

## 🧪 Tipos de Teste Detalhados

### 1. LOGIN TEST (`testLogin.ts`)

**O que faz:**
- Abre contexto de browser com sessão salva
- Navega para grupo especificado
- Verifica se usuário está logado
- Testa acesso ao feed do grupo

**Indicadores:**
- ✅ `Feed do grupo carregado!` = Login perfeito
- ⚠️ `Logado mas feed não carrega` = Login OK, problema no grupo
- ❌ `Não está logado ou sessão expirou` = Precisa re-login

**Execução isolada:**
```bash
npx tsx testLogin.ts --help
npx tsx testLogin.ts auto auto
npx tsx testLogin.ts userId accountId groupUrl --headless
```

### 2. HEALTH CHECK (`health-check.ts`)

**O que faz:**
- Testa 5 estratégias diferentes de seleção de posts
- Avalia robustez dos seletores CSS/XPath
- Coleta estatísticas do DOM
- Não precisa de login (usa página pública)

**Estratégias testadas:**
1. **ARIA Semântico** (alta confiabilidade)
   - `//div[@role='feed']//div[@role='article' and not(ancestor::div[@role='article'])]`
   
2. **Filtragem Estrutural** (alta confiabilidade)
   - `[role='feed'] [role='article']:not([role='article'] [role='article'])`
   
3. **Data-TestID Fallback** (média confiabilidade)
   - `[data-testid*='story'], [data-testid*='post']`
   
4. **Atributos Compostos** (média confiabilidade)
   - `div[data-pagelet*='FeedUnit'], div[class*='story']`
   
5. **Heurística Visual** (baixa confiabilidade)
   - `div:has(> div > div > div > span > h3 > span > strong > a)`

**Execução:**
```bash
npx tsx testRunner.ts --only-health
npm run test:health
```

### 3. SELECTOR TEST (`selectorTester.ts`)

**O que faz:**
- Execução completa de extração de posts reais
- Navega por posts do grupo logado
- Extrai dados estruturados de cada post
- Gerencia modais e navegação
- Envia dados para webhook (opcional)

**Dados extraídos:**
```typescript
{
  postId: string,           // ID único do post
  permalink: string,        // URL permanente
  authorName: string,       // Nome do autor
  authorUrl: string,        // Perfil do autor
  timeISO: string,         // Timestamp ISO
  timeText: string,        // Texto do tempo ("2h", "ontem")
  text: string,            // Conteúdo completo do post
  imageUrls: string[]      // URLs das imagens
}
```

**Execução:**
```bash
npx tsx testRunner.ts --only-selectors --max-posts=10
WEBHOOK_URL=https://hooks.n8n.cloud/webhook/abc123 npx tsx testRunner.ts --only-selectors
```

## ⚙️ Opções Avançadas

### Controle de Volume
```bash
--max-posts=N         # Limita posts processados (padrão: 5)
--max-posts=3         # Teste rápido
--max-posts=50        # Teste extenso
```

### Modos de Execução
```bash
--headless           # Sem interface gráfica (mais rápido)
--only-login         # Apenas validação de sessão
--only-health        # Apenas health check dos seletores  
--only-selectors     # Apenas extração de posts
```

### Auto Discovery
```bash
# Sistema busca automaticamente a primeira conta válida
npx tsx testRunner.ts
npx tsx testRunner.ts --max-posts=3 --only-login

# Força usar conta específica mesmo com auto discovery
npx tsx testRunner.ts userId específico accountId específico
```

## 📊 Interpretando Resultados

### Status dos Testes
- ✅ **SUCESSO**: Teste passou completamente
- ❌ **FALHA**: Teste falhou, veja logs para detalhes
- ⚠️ **PARCIAL**: Funcionou mas com limitações

### Logs Importantes
```
[testLogin] ✅ Login bem-sucedido!
[health] ✅ Estratégia "ARIA Semântico": 15 elementos
[selectorTester] ✅ Finalizado. Posts processados: 10
```

### Relatório Final
```
📊 RELATÓRIO FINAL
==================
✅ LOGIN
✅ HEALTH  
❌ SELECTORS

Testes executados: 3
Sucessos: 2
Falhas: 1
Taxa de sucesso: 67%
Status geral: ❌ ALGUMAS FALHAS
```

## 🔧 Scripts NPM

```bash
npm run help           # Ajuda completa
npm run test:all       # Todos os testes
npm run test:login     # Só login
npm run test:health    # Só health check
npm run test:selectors # Só extração  
npm run test:quick     # Rápido (3 posts, só login)
npm run test:headless  # Modo headless
npm run test:dev       # Desenvolvimento (2 posts)
npm run accounts       # Lista contas disponíveis
npm run docs           # Alias para help
```

## 🌐 Variáveis de Ambiente

```bash
# Modo headless permanente
export HEADLESS=true

# Webhook para receber dados extraídos
export WEBHOOK_URL=https://hooks.n8n.cloud/webhook/abc123

# Diretório de perfil (não usado, mantido por compatibilidade)
export FB_PROFILE_DIR=/path/to/profiles
```

## 🆘 Troubleshooting

### Login Sempre Falha
```bash
# 1. Veja contas disponíveis
npm run accounts

# 2. Teste sem headless para debug visual
npx tsx testRunner.ts --only-login

# 3. Verifique se sessão existe no Supabase
# (consulte logs do console para detalhes)
```

### Seletores Não Funcionam
```bash
# 1. Execute health check primeiro
npm run test:health

# 2. Se health check falha, Facebook mudou estrutura
# (veja seletores em src/core/automations/facebook/utils/selectors.json)

# 3. Teste com poucos posts para debug
npx tsx testRunner.ts --max-posts=2 --only-selectors
```

### Webhook Falha
```bash
# 1. Teste conectividade
curl -X POST $WEBHOOK_URL -H "Content-Type: application/json" -d '{"test": true}'

# 2. Verifique formato esperado pelo webhook
# (dados seguem interface PostData)

# 3. Execute sem webhook primeiro
unset WEBHOOK_URL
npm run test:selectors
```

## 💡 Dicas Avançadas

### Para Desenvolvimento
```bash
# Combo ideal para debug rápido
npx tsx testRunner.ts --max-posts=2 --only-login

# Debug visual completo
npx tsx testRunner.ts --max-posts=5

# Teste de produção
npx tsx testRunner.ts --headless --max-posts=25
```

### Para Monitoramento
```bash
# Execução automática com webhook
WEBHOOK_URL=https://... npx tsx testRunner.ts --headless

# Logs para arquivo
npx tsx testRunner.ts --headless > test-results.log 2>&1

# Exit codes para scripts
npx tsx testRunner.ts --headless && echo "Sucesso" || echo "Falha"
```

### Para Debug de Seletores
1. Execute sem `--headless` para ver browser
2. Use `--max-posts=1` para focar em um post
3. Pause execução com `debugger;` se necessário
4. Examine estrutura HTML no DevTools
5. Teste seletores manualmente no console

## 📁 Estrutura de Arquivos

```
facebook/
├── testRunner.ts         # 🎯 Executor principal
├── testLogin.ts          # 🔑 Teste de login isolado  
├── selectorTester.ts     # 📊 Extração completa
├── helpers/
│   └── getTestIds.ts     # 🔍 Auto discovery de IDs
├── package.json          # 📦 Scripts npm
├── README.md             # 📚 Documentação básica
└── HELP.md              # 📖 Este arquivo
```

## 🔗 Integração com Sistema

- **Sessões**: Usa `openContextForAccount()` do core
- **Health Check**: Usa `runHealthCheck()` oficial  
- **Seletores**: Mesmos do `core/automations/facebook/`
- **Database**: Integrado com Supabase do projeto
- **Configurações**: Respeita env vars do sistema principal

---

**💡 Lembre-se**: Este sistema testa a automação real do PipeFox. Use com responsabilidade e respeite os limites de rate do Facebook.
# 🔧 Sistema de Testes do Facebook - Guia Completo

Este é o sistema de testes integrados para validar a automação do Facebook no PipeFox.

## 🚀 Comandos Disponíveis

### Testes Principais
```bash
# Executar todos os testes (recomendado)
npm run test:all

# Testar apenas login
npm run test:login

# Testar apenas seletores (extração de posts)
npm run test:selectors

# Testar apenas health check
npm run test:health

# Teste rápido (apenas 3 posts + login)
npm run test:quick

# Modo headless (sem interface gráfica)
npm run test:headless
```

### Testes Standalone
```bash
# Seletores apenas (sem relatório)
npm run test:selectors-only

# Ver contas disponíveis
npm run accounts
```

### Help e Documentação
```bash
# Ver este help
npm run help
npm run docs
```

## 📋 O que cada teste faz

### 🔑 `test:login`
- Verifica se a sessão salva ainda é válida
- Testa acesso ao grupo configurado
- Confirma que o feed carrega corretamente

### 🎯 `test:selectors` 
- **PRINCIPAL**: Testa a extração completa de dados dos posts
- Encontra posts no feed
- **Clica nos timestamps** (1h, 2min, etc.) para abrir o post
- Extrai dados: autor, texto, imagens, links
- Envia para webhook (se configurado)
- **É o teste mais importante!**

### 🏥 `test:health`
- Health check básico do sistema
- Verifica se as dependências estão funcionando
- Testa conexões básicas

### ⚡ `test:quick`
- Versão rápida: apenas 3 posts + login
- Ideal para desenvolvimento e debugging

## 🔍 Funcionalidades dos Seletores

O sistema de seletores (`test:selectors`) é o mais avançado e faz:

1. **Encontra articles no feed** usando `div[role="article"]`
2. **Procura timestamps clicáveis** com múltiplas estratégias:
   - `a[href*="/posts/"]:has(time)`
   - `a:has(time)`
   - Links que contêm elementos `<b>` com tempo (1h, 2min, etc.)
3. **Clica no timestamp** para abrir o post (modal ou página nova)
4. **Extrai dados completos**:
   - ID do post
   - Nome do autor
   - URL do autor
   - Texto completo
   - Todas as imagens
   - Timestamp em ISO e texto
5. **Envia para webhook** (se `WEBHOOK_URL` estiver configurado)

## 🎛️ Opções Avançadas

### Variáveis de Ambiente
```bash
WEBHOOK_URL=https://sua-url.com/webhook  # Para receber dados extraídos
```

### Argumentos de Linha de Comando
```bash
# IDs específicos
npx tsx testRunner.ts userId accountId

# Auto-discovery (recomendado)
npx tsx testRunner.ts auto auto

# Opções extras
npx tsx testRunner.ts auto auto --headless --max-posts=10
```

### Parâmetros Disponíveis
- `--headless`: Executar sem interface gráfica
- `--max-posts=N`: Processar no máximo N posts
- `--only-login`: Apenas teste de login
- `--only-selectors`: Apenas teste de seletores
- `--only-health`: Apenas health check
- `--list-accounts`: Listar contas disponíveis

## 🐛 Debugging e Logs

O sistema produz logs detalhados mostrando:
- Quantos articles foram encontrados
- Se conseguiu clicar nos timestamps
- Dados extraídos de cada post
- Erros e warnings

### Exemplo de Log Típico:
```
[selectorTester] Encontrados 15 articles na página
[selectorTester] Processando post 1/5: 1314762363331918
[selectorTester] Clicando no timestamp do post 1314762363331918
[selectorTester] Post 1314762363331918: Aberto via modal
[selectorTester] Dados extraídos: {
  postId: "1314762363331918",
  author: "Nome do Autor",
  textLength: 145,
  images: 2
}
```

## 📁 Arquivos do Sistema

- `testRunner.ts`: Executor principal (orquestra todos os testes)
- `selectorTester.ts`: **CORE** - Sistema de extração de posts
- `testLogin.ts`: Validação de login/sessão
- `helpers/getTestIds.ts`: Auto-discovery de contas
- `package.json`: Comandos npm disponíveis

## 🔧 Solução de Problemas

### "Login falhou"
- Execute apenas: `npm run test:login`
- Faça login manualmente quando solicitado
- O sistema aguarda até 3 minutos

### "Não encontra timestamps"
- Os seletores foram otimizados para encontrar timestamps como "1h", "2min"
- Se ainda falhar, execute com `--max-posts=1` para debug

### "Webhook não funciona"
- Verifique se `WEBHOOK_URL` está configurada no `.env`
- Teste o webhook separadamente

### "Timeout errors"
- Use `--headless` para executar mais rápido
- Reduza `--max-posts` para testes menores

## 💡 Dicas de Uso

1. **Para desenvolvimento**: `npm run test:dev` (2 posts apenas)
2. **Para production**: `npm run test:all` (teste completo)
3. **Para debugging**: `npm run test:selectors` + logs detalhados
4. **Para CI/CD**: `npm run test:headless`

## 🎯 Foco Principal: Timestamps

O sistema agora está otimizado para encontrar e clicar especificamente nos **timestamps como "1h", "18 min", "2 dias"** que aparecem nos posts do Facebook, exatamente como você mostrou na imagem.
