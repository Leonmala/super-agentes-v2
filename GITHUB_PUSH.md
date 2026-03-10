# Comandos Git para Push Manual

## **PASSO 1: Você cria o repositório**

Acesse: https://github.com/new

**Configurações:**
- Repository name: `super-agentes-v2`
- Description: `Sistema multi-agente educacional com Router Inteligente`
- Public ✓
- ✅ Initialize with README (opcional)

Clique em **"Create repository"**

---

## **PASSO 2: Copiar URL do repo**

Após criar, copie a URL (exemplo):
```
https://github.com/SEU_USUARIO/super-agentes-v2.git
```

---

## **PASSO 3: Executar estes comandos no terminal**

```bash
# Entrar na pasta do projeto
cd "H:/Trabalho/PENSA-AI/PROJETOS/SUPER_AGENTES/Aprimoramento_SuperAgentes/teste6-railway_v2_fast"

# Adicionar remote origin (substitua SUA_URL)
git remote add origin https://github.com/SEU_USUARIO/super-agentes-v2.git

# Verificar remote
git remote -v

# Push para main
git push -u origin main
```

---

## **PASSO 4: Verificar no GitHub**

Acesse: `https://github.com/SEU_USUARIO/super-agentes-v2`

Deve aparecer todos os arquivos do v2_fast.

---

## **Próximo Passo: Conectar Railway**

Após o push, vamos conectar o Railway ao repositório.

---

**Status:** ⏳ Aguardando você criar o repositório
