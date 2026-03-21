# 🚀 Deploy RADAR-B3 na VPS com Tailscale

---

## 🧠 Como o Tailscale resolve o acesso remoto

O Tailscale cria uma rede privada virtual (mesh VPN) entre seus dispositivos. Ou seja:

- Seu celular vira "como se estivesse na mesma rede da sua VPS"
- Não importa se você está no Wi-Fi de casa, no 4G na rua ou no Wi-Fi de um shopping

👉 Ele sempre cria um túnel seguro direto com a VPS.

### 📡 Fluxo real de acesso (fora de casa)

```
Seu celular (4G/5G)
       ↓
App Tailscale ativo
       ↓
Rede privada criptografada
       ↓
Sua VPS (com Tailscale)
       ↓
Seu app (React + Node)
```

🔒 Resultado:
- ninguém fora da sua rede entra
- seu app continua privado
- você acessa de qualquer lugar
- sua API key Gemini fica protegida no servidor

---

## 📐 Arquitetura completa do projeto

```
Seu celular / PC (com Tailscale ativo)
        ↓  rede privada criptografada (WireGuard)
VPS Ubuntu (com Tailscale)
        ↓
Nginx (porta 80 / 443)
   ├── /          → frontend React (arquivos estáticos)
   └── /api/      → backend Node.js (porta 3001)
                          ↓
               API Gemini (chave no .env, nunca exposta)
```

---

## PARTE 1 — Preparar a VPS

### 1.1 Instalar Node.js 20 (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # deve mostrar v20.x.x
```

### 1.2 Instalar Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 1.3 Instalar PM2 (mantém o Node rodando em background)

```bash
sudo npm install -g pm2
```

---

## PARTE 2 — Subir o código para a VPS

### Opção A — Via Git (recomendado)

```bash
# Na VPS:
cd ~
git clone https://github.com/SEU_USUARIO/RADAR-B3.git
cd RADAR-B3
```

### Opção B — Via SCP (upload direto)

```bash
# No seu computador:
scp -r ./RADAR-B3 usuario@IP_DA_VPS:~/
```

---

## PARTE 3 — Configurar o Backend

```bash
cd ~/RADAR-B3/backend

# Instalar dependências
npm install

# Criar o arquivo .env com sua chave
cp .env.example .env
nano .env
```

Dentro do `.env`, preencha:

```env
GEMINI_API_KEY=AIzaSy_SUA_CHAVE_REAL_AQUI
GEMINI_MODEL=gemini-2.5-flash
PORT=3001
SEARCH_ENABLED=true
```

Salve com `Ctrl+O`, `Enter`, `Ctrl+X`.

### Testar o backend

```bash
node server.js
```

Deve aparecer:
```
🚀 RADAR-B3 Backend rodando na porta 3001
   Modelo : gemini-2.5-flash
   API Key: ✓ configurada
```

Pressione `Ctrl+C` para parar.

### Iniciar com PM2

```bash
cd ~/RADAR-B3/backend
pm2 start server.js --name radar-b3
pm2 save
pm2 startup   # siga as instruções que aparecerem
```

Comandos úteis:
```bash
pm2 status           # ver se está rodando
pm2 logs radar-b3    # ver logs em tempo real
pm2 restart radar-b3
pm2 stop radar-b3
```

---

## PARTE 4 — Build do Frontend

```bash
cd ~/RADAR-B3/frontend
npm install
npm run build
```

Os arquivos ficam em `~/RADAR-B3/frontend/dist/`.

---

## PARTE 5 — Configurar o Nginx

```bash
sudo nano /etc/nginx/sites-available/radar-b3
```

Cole o conteúdo abaixo:

```nginx
server {
    listen 80;
    server_name _;   # aceita o IP do Tailscale diretamente

    root /root/RADAR-B3/frontend/dist;
    index index.html;

    # Proxy para o backend Node.js
    location /api/ {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }

    # Frontend React (SPA fallback)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Salve e ative:

```bash
sudo ln -s /etc/nginx/sites-available/radar-b3 /etc/nginx/sites-enabled/
sudo nginx -t            # verifica se a config está correta
sudo systemctl reload nginx
```

---

## PARTE 6 — Instalar Tailscale na VPS

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Acesse o link que aparecer no terminal, faça login com Google (o mesmo que usará no celular).

Ver o IP do Tailscale da VPS:

```bash
tailscale ip -4
# ex: 100.101.102.103
```

---

## 📱 PARTE 7 — Instalar Tailscale no Celular (passo a passo)

### 1. Instalar o app

- **Android**: Play Store → Tailscale
- **iPhone**: App Store → Tailscale

### 2. Login

Você loga com:
- Google (mais fácil)
- ou outro provedor

👉 Use o **mesmo login** que usou na VPS.

### 3. Conectar

Abra o app e ative:

```
[ ON ] Connected
```

Pronto. Seu celular já está dentro da rede privada.

### 4. Acessar o app

Quando o Tailscale está instalado na VPS, ela ganha um IP tipo:

```
100.101.102.103
```

Ou um hostname tipo:

```
radar-b3.tailnet-name.ts.net
```

---

## PARTE 8 — Acessar o App no Celular

### Opção A — Porta 80 com Nginx (recomendado)

Com o Nginx configurado, acesse direto no Chrome:

```
http://100.x.x.x
```

Não precisa digitar porta. Acessa como um site normal.

### Opção B — HTTPS com domínio interno do Tailscale

O Tailscale permite SSL automático. Na VPS:

```bash
sudo tailscale cert $(tailscale status --json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Self']['DNSName'].strip('.'))")
```

Aí você acessa com HTTPS e certificado válido:

```
https://radar-b3.tailnet.ts.net
```

👉 Isso já vem com certificado válido. Zero exposição pública.

---

## 🔒 Por que isso é seguro

- Criptografia ponta a ponta (WireGuard)
- Conexão direta P2P quando possível
- Fallback via relay seguro se necessário
- Cada dispositivo precisa ser autenticado
- A porta 80 da VPS **não precisa ser aberta** para a internet

Você pode manter a VPS **100% fechada para o mundo** e acessar tudo via Tailscale.

---

## 🔄 Como atualizar o app

```bash
cd ~/RADAR-B3
git pull

# Rebuild do frontend (se mudou algo no React)
cd frontend && npm run build && cd ..

# Reiniciar backend (se mudou algo no Node)
pm2 restart radar-b3
```

---

## ✅ Checklist completo

- [ ] Node.js instalado (`node -v` → v20.x.x)
- [ ] PM2 instalado (`pm2 -v`)
- [ ] Código clonado na VPS
- [ ] Backend: `npm install` feito em `backend/`
- [ ] `.env` com `GEMINI_API_KEY` preenchida
- [ ] Backend rodando via PM2 (`pm2 status`)
- [ ] Frontend: `npm run build` feito em `frontend/`
- [ ] Nginx configurado e rodando (`sudo nginx -t`)
- [ ] Tailscale instalado e ativo na VPS (`tailscale status`)
- [ ] Tailscale instalado e ativo no celular
- [ ] App abrindo no Chrome pelo IP do Tailscale (`http://100.x.x.x`)

---

## 🛠️ Troubleshooting

| Problema | Causa provável | Solução |
|---|---|---|
| App não abre no celular | Tailscale desligado | Ativar Tailscale no celular |
| Página em branco | Frontend sem build | `cd frontend && npm run build` |
| "Backend offline" | PM2 parado | `pm2 restart radar-b3` |
| Erro ao buscar dados | `.env` sem chave | Editar `.env` + `pm2 restart radar-b3` |
| Nginx dá erro 502 | Node crashou | `pm2 logs radar-b3` para ver o erro |
| Não consigo acessar de fora | Tailscale desconectado na VPS | `sudo tailscale up` na VPS |
