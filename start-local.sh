#!/bin/bash
# ═══════════════════════════════════════════════════════
#  RADAR-B3 — Rodar localmente (desenvolvimento)
#  Inicia o backend Node.js + frontend Vite em paralelo
#
#  Como usar:
#    chmod +x start-local.sh
#    ./start-local.sh
# ═══════════════════════════════════════════════════════

VERDE="\033[0;32m"
AMARELO="\033[1;33m"
RESET="\033[0m"

PROJ_DIR="$(cd "$(dirname "$0")" && pwd)"

# Verificar .env
if [ ! -f "$PROJ_DIR/backend/.env" ]; then
    echo -e "${AMARELO}Criando backend/.env a partir do .env.example...${RESET}"
    cp "$PROJ_DIR/backend/.env.example" "$PROJ_DIR/backend/.env"
    echo ""
    echo -e "${AMARELO}⚠  Configure sua chave Gemini em backend/.env antes de continuar${RESET}"
    echo "   Abra o arquivo e substitua 'cole_sua_chave_aqui' pela sua chave real."
    echo "   Obtenha em: https://aistudio.google.com/app/apikey"
    echo ""
    exit 1
fi

echo ""
echo -e "${VERDE}╔══════════════════════════════════════╗${RESET}"
echo -e "${VERDE}║   RADAR-B3 — Modo Desenvolvimento    ║${RESET}"
echo -e "${VERDE}╚══════════════════════════════════════╝${RESET}"
echo ""
echo "  Backend  → http://localhost:3001"
echo "  Frontend → http://localhost:5173"
echo ""
echo "  Pressione Ctrl+C para encerrar tudo."
echo ""

# Função para matar processos filhos ao sair
cleanup() {
    echo ""
    echo "Encerrando..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

# Iniciar backend
cd "$PROJ_DIR/backend"
node --watch server.js &
BACKEND_PID=$!

# Aguardar 2s para o backend subir antes do frontend
sleep 2

# Iniciar frontend
cd "$PROJ_DIR/frontend"
npx vite &
FRONTEND_PID=$!

# Aguardar os dois processos
wait $BACKEND_PID $FRONTEND_PID
