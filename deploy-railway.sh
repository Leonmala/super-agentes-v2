#!/bin/bash
# Script de Deploy Railway - Super Agentes v2_fast
# Execute este script no terminal

echo "=========================================="
echo "  DEPLOY SUPER AGENTES - RAILWAY"
echo "=========================================="

# Verificar se está na pasta correta
if [ ! -f "package.json" ]; then
    echo "ERRO: Execute este script na pasta teste6-railway_v2_fast/"
    exit 1
fi

echo ""
echo "1. Verificando Railway CLI..."
railway --version

echo ""
echo "2. Fazendo login no Railway..."
echo "   (Abrirá navegador para autenticação)"
railway login

echo ""
echo "3. Inicializando projeto..."
echo "   Escolha: 'Create New Project'"
railway init

echo ""
echo "4. Configurando variáveis de ambiente..."
echo "   Você precisa configurar:"
echo "   - GOOGLE_API_KEY"
echo "   - SUPABASE_URL"
echo "   - SUPABASE_SERVICE_KEY"
echo ""
read -p "Pressione ENTER para configurar variáveis..."

railway variables set GOOGLE_API_KEY="SUA_CHAVE_AQUI"
railway variables set GEMINI_MODEL="gemini-2.0-flash"
railway variables set GEMINI_MODEL_PSICO="gemini-2.5-flash"
railway variables set SUPABASE_URL="SUA_URL_AQUI"
railway variables set SUPABASE_SERVICE_KEY="SUA_CHAVE_AQUI"

echo ""
echo "5. Fazendo deploy..."
railway up

echo ""
echo "6. Verificando status..."
railway status

echo ""
echo "=========================================="
echo "  DEPLOY CONCLUÍDO!"
echo "=========================================="
echo ""
echo "Para ver logs:"
echo "  railway logs"
echo ""
echo "Para abrir no navegador:"
echo "  railway open"
echo ""
