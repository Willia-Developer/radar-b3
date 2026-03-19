# Deploy B3 Radar → Hostinger (public_html)

## Como funciona (arquitetura)

```
Visitante
   │
   ▼
Frontend React  (index.html + assets/)
   │  chama
   ▼
api/radar.php   ← PHP no servidor da Hostinger
   │  usa SUA chave (salva em config.php, invisível ao visitante)
   ▼
Google Gemini API  ← busca dados reais na web e analisa
```

A chave fica **100% no servidor**, nunca exposta ao navegador.

---

## PASSO 1 — Obter chave Gemini (gratuita)

1. Acesse https://aistudio.google.com/app/apikey
2. Clique em **"Create API key"**
3. Copie a chave gerada (começa com `AIza...`)

---

## PASSO 2 — Preencher a chave no config.php

Abra o arquivo **`frontend/public/api/config.php`** e substitua:

```php
'gemini_api_key' => 'COLE_SUA_CHAVE_AQUI',
```

por sua chave real:

```php
'gemini_api_key' => 'AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
```

Salve o arquivo.

---

## PASSO 3 — Fazer o build

Abra o terminal na pasta `frontend/` e rode:

```bash
npm install
npm run build
```

Isso gera a pasta **`frontend/dist/`** com todos os arquivos prontos.

---

## PASSO 4 — Subir para o public_html

Envie **todo o conteúdo** de `frontend/dist/` para a raiz do `public_html`:

```
public_html/
├── .htaccess          ← obrigatório
├── index.html
├── assets/
│   ├── index-XXXX.js
│   ├── vendor-XXXX.js
│   └── index-XXXX.css
└── api/
    ├── radar.php      ← backend (não editar)
    └── config.php     ← SUA CHAVE está aqui
```

### Como subir — File Manager da Hostinger
1. hPanel → **File Manager** → entre em `public_html/`
2. Faça upload de: `.htaccess`, `index.html`, pasta `assets/`, pasta `api/`

### Como subir — FTP (FileZilla, WinSCP)
1. Conecte com as credenciais FTP da Hostinger
2. Arraste o conteúdo de `dist/` para `public_html/`

---

## PASSO 5 — Verificar

1. Acesse `https://seudominio.com`
2. Clique em **"Buscar agora"**
3. Deve retornar as oportunidades em ~10–20 segundos

---

## Resolver problemas comuns

| Erro                          | Causa provável                       | Solução                                      |
|-------------------------------|--------------------------------------|----------------------------------------------|
| `502 Bad Gateway`             | Chave Gemini não configurada         | Verificar `config.php` na pasta `api/`       |
| `Configure a chave da API...` | `config.php` com chave placeholder   | Substituir `COLE_SUA_CHAVE_AQUI` pela chave  |
| `403 Forbidden`               | `.htaccess` não subiu                | Fazer upload do `.htaccess` para `public_html/` |
| Tela em branco                | Arquivos em subpasta errada          | Verificar se `index.html` está na raiz de `public_html/` |

---

## Notas importantes

- O arquivo `config.php` já está no `.gitignore` — não será enviado ao GitHub por engano
- O modelo `gemini-2.5-flash` é gratuito com generoso limite de uso mensal
- Para rebuild após alterações no frontend: edite, rode `npm run build`, suba apenas `assets/` e `index.html` novamente
- O `api/radar.php` e `api/config.php` só precisam ser enviados uma vez
