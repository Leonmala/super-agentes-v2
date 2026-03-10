# Setup GitHub + Railway - Super Agentes
## Deploy Automático com CI/CD

---

## **VISÃO GERAL**

```
GitHub Repo → Railway Deploy Automático
     ↓
main branch → Production (railway.app)
develop branch → Staging (opcional)
```

**Vantagens:**
- ✅ Push para GitHub → deploy automático
- ✅ Versionamento completo
- ✅ Rollback fácil (voltar commits)
- ✅ Branches para testes
- ✅ Sem login manual no Railway

---

## **PASSO 1: Criar Repositório GitHub**

### Aprovação necessária: [ ] Criar repo `super-agentes-v2`

**Comando:**
```bash
# Na pasta teste6-railway_v2_fast/
git init
git add .
git commit -m "Initial commit - v2_fast ready for Railway"
gh repo create super-agentes-v2 --public --source=. --push
```

**Arquivos incluídos:**
- src/ (backend)
- personas/ (prompts)
- public/ (interface)
- package.json
- tsconfig.json
- .env.example (sem credenciais reais)
- .gitignore

---

## **PASSO 2: Configurar Railway**

### Aprovação necessária: [ ] Conectar Railway ao GitHub

**Passos no Railway Dashboard:**
1. Acesse https://railway.app
2. New Project → Deploy from GitHub repo
3. Selecione `super-agentes-v2`
4. Railway detecta automaticamente (Node.js)

---

## **PASSO 3: Variáveis de Ambiente**

### Aprovação necessária: [ ] Configurar secrets no Railway

**No Railway Dashboard → Variables:**
```
GOOGLE_API_KEY=xxx
GEMINI_MODEL=gemini-2.0-flash
GEMINI_MODEL_PSICO=gemini-2.5-flash
SUPABASE_URL=xxx
SUPABASE_SERVICE_KEY=xxx
PORT=3000
```

**IMPORTANTE:** Essas variáveis NÃO vão no GitHub (segurança)

---

## **PASSO 4: Deploy Automático**

### Aprovação necessária: [ ] Habilitar auto-deploy

**Comportamento:**
- Cada push para `main` → deploy automático
- Railway mostra: building → deploying → live
- URL gerada: `super-agentes-v2-production.up.railway.app`

---

## **PASSO 5: Testar Deploy**

### Aprovação necessária: [ ] Testar URL Railway

**Testes:**
```bash
# Health check
curl https://<url>.railway.app/api/health

# Teste simples
curl -X POST https://<url>.railway.app/api/message \
  -H "Content-Type: application/json" \
  -d '{"aluno_id": "TESTE001", "mensagem": "oi"}'
```

---

## **WORKFLOW DE DESENVOLVIMENTO**

### Dia a dia:
```bash
# 1. Fazer alterações no código
# 2. Testar localmente
npm run dev

# 3. Commit e push
git add .
git commit -m "feat: router inteligente otimizado"
git push origin main

# 4. Railway deploya automaticamente!
```

### Se precisar rollback:
```bash
# Voltar para versão anterior
git revert HEAD
git push origin main
# Railway faz rollback automatico!
```

---

## **ESTRUTURA DE BRANCHES (Opcional)**

```
main         → Production (Railway)
develop      → Staging (opcional)
feature/xxx  → Testes locais
```

---

## **CHECKLIST FINAL**

- [ ] Repo criado no GitHub
- [ ] Railway conectado ao repo
- [ ] Variáveis configuradas
- [ ] Auto-deploy habilitado
- [ ] URL testada e funcionando
- [ ] Documento Verdade atualizado com URL

---

## **PRÓXIMOS DEPLOYS (Automáticos)**

Após setup inicial, cada push no GitHub:
1. Build → TypeScript compila
2. Deploy → Railway atualiza
3. Teste → Scripts validam
4. Live → URL atualizada

**Você só precisa:**
- Desenvolver localmente
- Commitar e pushar
- Ver resultado em ~2 minutos

---

**Status:** 🚀 Aguardando aprovação para iniciar
