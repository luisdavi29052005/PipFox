
# Testes de Automação do Facebook

Esta pasta contém testes integrados para validar o sistema de automação do Facebook do PipeFox.

## Estrutura

```
facebook/
├── testLogin.ts      # Testa login usando sessões salvas
├── selectorTester.ts # Testa extração de posts com seletores
├── testRunner.ts     # Executor principal de todos os testes
└── README.md         # Esta documentação
```

## Arquivos

### testLogin.ts
Testa se a sessão salva do Facebook ainda está válida e se consegue acessar grupos.

**Uso:**
```bash
cd backend
npx tsx test/automations/facebook/testLogin.ts [userId] [accountId] [--headless]
```

### selectorTester.ts
Versão completa do código que você enviou, integrada com o sistema oficial do projeto. Testa a extração de dados de posts usando os seletores mais avançados.

**Funcionalidades:**
- Usa a sessão oficial do projeto (`openContextForAccount`)
- Extrai dados completos dos posts (autor, texto, imagens, timestamps)
- Envia dados para webhook (opcional)
- Gerencia modais e navegação
- Tratamento robusto de erros

### testRunner.ts
Executor principal que combina todos os testes em uma única bateria.

**Uso:**
```bash
cd backend

# Executar todos os testes (IDs automáticos)
npx tsx test/automations/facebook/testRunner.ts

# Ou explicitamente usar IDs automáticos
npx tsx test/automations/facebook/testRunner.ts auto auto

# Listar contas disponíveis
npx tsx test/automations/facebook/testRunner.ts --list-accounts

# Executar com IDs específicos
npx tsx test/automations/facebook/testRunner.ts [userId] [accountId] [groupUrl]

# Executar testes específicos
npx tsx test/automations/facebook/testRunner.ts --only-login
npx tsx test/automations/facebook/testRunner.ts --only-health  
npx tsx test/automations/facebook/testRunner.ts --only-selectors

# Configurar número máximo de posts para teste
npx tsx test/automations/facebook/testRunner.ts --max-posts=10
```

## Integração com o Sistema

Os testes usam os mesmos componentes do sistema oficial:

- **Sessões**: `openContextForAccount()` para usar sessões salvas no Supabase
- **Health Check**: `runHealthCheck()` para validar seletores
- **Configurações**: Respeita variáveis de ambiente como `HEADLESS`, `WEBHOOK_URL`

## Exemplos de Uso

### Teste Rápido de Login (IDs automáticos)
```bash
npx tsx test/automations/facebook/testLogin.ts
```

### Ver Contas Disponíveis
```bash
npx tsx test/automations/facebook/testRunner.ts --list-accounts
```

### Teste Completo com Webhook (IDs automáticos)
```bash
export WEBHOOK_URL=https://hooks.n8n.cloud/webhook/your-webhook-id
npx tsx test/automations/facebook/testRunner.ts
```

### Teste de Seletores com Poucos Posts
```bash
npx tsx test/automations/facebook/testRunner.ts --max-posts=3countId] [groupUrl] \
  --only-selectors --max-posts=3
```

## Variáveis de Ambiente

- `HEADLESS`: Define modo headless (padrão: false para testes)
- `WEBHOOK_URL`: URL do webhook para enviar dados extraídos
- `FB_PROFILE_DIR`: Diretório do perfil (não usado, usa sessão oficial)

## Resultados

Os testes fornecem:

1. **Status de cada teste** (✅/❌)
2. **Logs detalhados** de cada etapa
3. **Estatísticas** (posts processados, taxa de sucesso)
4. **Relatório final** consolidado

## Troubleshooting

### Login falha
- Verifique se a sessão está salva no Supabase
- Execute login manual se necessário
- Verifique permissões de grupo

### Seletores falham
- Execute health check primeiro
- Verifique se o Facebook mudou a estrutura
- Teste com headless=false para debug visual

### Webhook falha
- Verifique se a URL está correta
- Teste conectividade manual
- Verifique logs do n8n/webhook
