# Teste 6 — Super Agentes em Railway + Supabase

Sistema multi-agente educacional validado, agora em código TypeScript deployável.

## Arquitetura

```
Aluno → HTTP POST /api/message → Servidor Express
                                      ↓
                    [Código] Busca contexto (Supabase)
                                      ↓
                    [Código] Decide persona (router.ts)
                                      ↓
                    [Código] Monta payload (context.ts)
                                      ↓
                    [Código] Chama LLM (Kimi K2.5)
                                      ↓
                    Resposta → Aluno (imediato)
                                      ↓
                    [Background] Persiste (Supabase)
```

## Setup

### 1. Banco de Dados (Supabase)

1. Acesse seu projeto no Supabase
2. Vá em SQL Editor → New Query
3. Cole o conteúdo de `supabase/schema.sql`
4. Execute

Verifique: tabelas `alunos`, `sessoes`, `turnos` criadas com aluno TESTE001.

### 2. Variáveis de Ambiente

```bash
cp .env.example .env
# Edite .env com suas credenciais
```

Variáveis necessárias:
- `SUPABASE_URL` — URL do projeto
- `SUPABASE_KEY` — Service Role Key
- `LLM_API_URL` — Endpoint OpenAI-compatible
- `LLM_API_KEY` — Sua chave de API

### 3. Instalar e Rodar Local

```bash
# Instalar dependências
npm install

# Desenvolvimento (hot reload)
npm run dev

# Build
npm run build

# Produção local
npm start
```

### 4. Testar

Abra `http://localhost:3000` no navegador.

Ou via curl:
```bash
curl -X POST http://localhost:3000/api/message \
  -H "Content-Type: application/json" \
  -d '{"aluno_id": "TESTE001", "mensagem": "Oi!"}'
```

## Deploy no Railway

### 1. Preparar

```bash
# Certifique-se de que o build funciona
npm run build
```

### 2. Criar projeto no Railway

1. Acesse railway.app
2. New Project → Deploy from GitHub repo
3. Selecione este repositório

### 3. Configurar variáveis

No dashboard do Railway, vá em Variables e adicione:
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `LLM_API_URL`
- `LLM_API_KEY`
- `LLM_MODEL=kimi-k2.5`
- `PORT=3000` (Railway sobrescreve, mas deixe como fallback)

### 4. Gerar domínio

Settings → Generate Domain

### 5. Testar deploy

```bash
curl -X POST https://seu-app.railway.app/api/message \
  -H "Content-Type: application/json" \
  -d '{"aluno_id": "TESTE001", "mensagem": "Oi!"}'
```

## Estrutura

```
teste6-railway/
├── src/
│   ├── index.ts         # Servidor Express
│   ├── supabase.ts      # Cliente Supabase + tipos
│   ├── router.ts        # Decisão de persona
│   ├── context.ts       # Montagem de payload
│   ├── llm.ts           # Chamada à API LLM
│   └── persistence.ts   # Leitura/escrita Supabase
├── personas/
│   ├── PSICOPEDAGOGICO.md
│   ├── CALCULUS.md
│   └── VERBETA.md
├── public/
│   └── index.html       # Chat mínimo
├── supabase/
│   └── schema.sql       # DDL do banco
├── .env.example
├── package.json
└── tsconfig.json
```

## Fluxo de Mensagem

1. **Recebe** POST /api/message com aluno_id e mensagem
2. **Busca** sessão ativa (ou cria nova) + dados do aluno + últimos turnos
3. **Decide** persona via keyword matching (router.ts)
4. **Carrega** system prompt da persona (.md)
5. **Monta** contexto com dados do aluno + histórico
6. **Chama** LLM com system prompt + contexto + mensagem
7. **Retorna** resposta ao aluno (imediato, <3s)
8. **Persiste** em background (turno + sessão atualizada)

## Testes Esperados

| Cenário | Entrada | Esperado |
|---------|---------|----------|
| Saudação | "Oi" | PSICOPEDAGOGICO responde |
| Matemática | "Não sei somar frações" | CALCULUS responde |
| Troca de tema | "Agora quero português" | PSICOPEDAGOGICO (primeira vez) |
| Continuidade | "Entendi, e depois?" | Mesmo herói continua |
| Pausa | "Tenho que sair" | Status PAUSA registrado |

## Diferenças do Teste 5 (Antigravity)

| Antes (prompt) | Agora (código) |
|----------------|----------------|
| Modelo decidía persona | Código decide (router.ts) |
| Modelo lia arquivos | Código busca Supabase |
| Modelo registrava | Código persiste |
| Modelo montava contexto | Código monta |
| Resposta + persistência juntas | Resposta imediata, persistência async |

## Troubleshooting

**Erro: Persona não encontrada**
- Verifique se arquivo .md existe em `personas/`
- Nome deve ser exatamente (ex: `CALCULUS.md`)

**Erro: Conexão Supabase**
- Verifique SUPABASE_URL e SUPABASE_KEY
- Use Service Role Key, não Anon Key

**Erro: LLM não responde**
- Verifique LLM_API_URL e LLM_API_KEY
- Teste endpoint diretamente com curl

**Latência alta**
- Verifique logs: tempo de resposta deve ser <3s
- Persistência rola em background, não bloqueia

## Status

✅ Estrutura criada
⏳ Aguardando execução do schema.sql no Supabase
⏳ Aguardando testes locais
⏳ Aguardando deploy Railway

---

**Versão**: 1.0 — Teste 6
**Data**: 06/03/2026
