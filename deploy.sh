#!/bin/bash
# ═══════════════════════════════════════════════════════
#  RADAR-B3 — Script de Deploy Automático na VPS
#  Execute UMA VEZ na VPS Ubuntu para instalar tudo
#
#  Como usar:
#    chmod +x deploy.sh
#    ./deploy.sh
# ═══════════════════════════════════════════════════════

set -e  # Para imediatamente se der qualquer erro

VERDE="\033[0;32m"
AMARELO="\033[1;33m"
VERMELHO="\033[0;31m"
RESET="\033[0m"

ok()   { echo -e "${VERDE}✓ $1${RESET}"; }
info() { echo -e "${AMARELO}→ $1${RESET}"; }
erro() { echo -e "${VERMELHO}✗ $1${RESET}"; exit 1; }

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   RADAR-B3 — Deploy Automático       ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Verificar Node.js ─────────────────────────────────────────────────────
info "Verificando Node.js..."
if ! command -v node &> /dev/null; then
    info "Instalando Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi
NODE_VER=$(node -v)
ok "Node.js $NODE_VER"

# ── 2. Verificar/Instalar Nginx ──────────────────────────────────────────────
info "Verificando Nginx..."
if ! command -v nginx &> /dev/null; then
    info "Instalando Nginx..."
    sudo apt install -y nginx
    sudo systemctl enable nginx
fi
ok "Nginx instalado"

# ── 3. Instalar PM2 ──────────────────────────────────────────────────────────
info "Verificando PM2..."
if ! command -v pm2 &> /dev/null; then
    info "Instalando PM2..."
    sudo npm install -g pm2
fi
ok "PM2 instalado"

# ── 4. Instalar dependências do backend ──────────────────────────────────────
info "Instalando dependências do backend..."
cd "$(dirname "$0")/backend"
npm install --production
ok "Backend: dependências instaladas"

# ── 5. Configurar .env ───────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo ""
    echo -e "${AMARELO}════════════════════════════════════════════${RESET}"
    echo -e "${AMARELO}  AÇÃO NECESSÁRIA: Configure sua API Key     ${RESET}"
    echo -e "${AMARELO}════════════════════════════════════════════${RESET}"
    echo ""
    echo "  Edite o arquivo backend/.env e cole sua chave Gemini:"
    echo ""
    echo "    nano backend/.env"
    echo ""
    echo "  Obtenha a chave em: https://aistudio.google.com/app/apikey"
    echo ""
    read -p "  Pressione ENTER após configurar o .env para continuar..."
fi

# Verificar se a chave foi preenchida
GEMINI_KEY=$(grep "GEMINI_API_KEY=" .env | cut -d'=' -f2 | tr -d ' ')
if [ "$GEMINI_KEY" = "cole_sua_chave_aqui" ] || [ -z "$GEMINI_KEY" ]; then
    erro "A GEMINI_API_KEY não foi configurada no .env. Edite backend/.env e tente novamente."
fi
ok "API Key configurada"

# ── 6. Build do frontend ─────────────────────────────────────────────────────
info "Buildando o frontend React..."
cd "$(dirname "$0")/frontend"
npm install
npm run build
ok "Frontend buildado em frontend/dist/"

# ── 7. Configurar Nginx ──────────────────────────────────────────────────────
info "Configurando Nginx..."
PROJ_DIR="$(cd "$(dirname "$0")" && pwd)"

sudo tee /etc/nginx/sites-available/radar-b3 > /dev/null <<EOF
server {
    listen 80;
    server_name _;

    root ${PROJ_DIR}/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 120s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

# Ativar site
sudo ln -sf /etc/nginx/sites-available/radar-b3 /etc/nginx/sites-enabled/radar-b3

# Remover site default se existir
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl reload nginx
ok "Nginx configurado"

# ── 8. Iniciar backend com PM2 ───────────────────────────────────────────────
info "Iniciando backend com PM2..."
cd "$(dirname "$0")/backend"

pm2 delete radar-b3 2>/dev/null || true
pm2 start server.js --name radar-b3
pm2 save
pm2 startup 2>/dev/null | grep "sudo" | bash 2>/dev/null || true
ok "Backend rodando via PM2"

# ── 9. Instalar Tailscale ────────────────────────────────────────────────────
info "Verificando Tailscale..."
if ! command -v tailscale &> /dev/null; then
    info "Instalando Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh
fi
ok "Tailscale instalado"

# ── Resumo final ─────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   ✓  Deploy concluído com sucesso!                   ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                      ║"
echo "║   PRÓXIMO PASSO — Ativar Tailscale:                  ║"
echo "║                                                      ║"
echo "║     sudo tailscale up                                ║"
echo "║                                                      ║"
echo "║   Depois veja o IP da VPS:                           ║"
echo "║                                                      ║"
echo "║     tailscale ip -4                                  ║"
echo "║                                                      ║"
echo "║   No celular (com Tailscale ativo), acesse:          ║"
echo "║                                                      ║"
echo "║     http://IP_DO_TAILSCALE                           ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Status final
pm2 status
