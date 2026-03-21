/**
 * ═══════════════════════════════════════════════════════
 *  RADAR-B3 — Backend Node.js
 *  API Gemini integrada no servidor (chave nunca exposta)
 * ═══════════════════════════════════════════════════════
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const app            = express();
const PORT           = process.env.PORT           || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL   = process.env.GEMINI_MODEL   || 'gemini-2.5-flash';
const SEARCH_ENABLED = process.env.SEARCH_ENABLED !== 'false';

app.use(express.json());
app.use(cors());

// ── Serve o frontend React (produção) ───────────────────────────────────────
app.use(express.static(join(__dirname, '../frontend/dist')));

// ── Helpers ─────────────────────────────────────────────────────────────────
function hoje() {
  return new Date().toLocaleDateString('pt-BR');
}

function buildPrompt(groupKey) {
  const isAcoes     = groupKey === 'acoes';
  const targetLabel = isAcoes ? 'acoes' : 'FIIs';
  const targetLine  = isAcoes
    ? 'Retorne exatamente 4 acoes da B3 com DY >= 10%.'
    : 'Retorne exatamente 4 FIIs da B3 com DY >= 10%.';
  const diversityLine = isAcoes
    ? 'Garanta ao menos 3 setores diferentes.'
    : 'Garanta ao menos 3 segmentos diferentes.';
  const format = isAcoes
    ? '{"acoes":[{"ticker":"XXXX3","nome":"Nome","setor":"Setor","preco":"R$ 00,00","pl":"0.0","roe":"00%","dy":"10%","margem_liquida":"00%","margem_ebitda":"00%","divida_ebitda":"0.0","payout":"00%","historico_dividendos":"Estavel","tendencia_receita":"Alta","tendencia_lucro":"Estavel","tendencia_dividendos":"Alta","risco_dividend_trap":"Baixo","comparacao_setorial":"Melhor que pares","score":85,"motivo":"Justificativa curta"}]}'
    : '{"fiis":[{"ticker":"XXXX11","nome":"Nome","segmento":"Segmento","preco":"R$ 00,00","pvp":"0.00","dy":"10%","vacancia":"0%","tipo_contrato":"Atipico","historico_rendimentos":"Estavel","qualidade_ativos":"Ativos fortes","tendencia_dividendos":"Estavel","risco_dividend_trap":"Baixo","comparacao_segmento":"Melhor que pares","score":85,"motivo":"Justificativa curta"}]}';

  return `Analise ${targetLabel} da B3 em ${hoje()} para perfil conservador.
${SEARCH_ENABLED ? 'Valide com dados online atuais antes de responder.' : ''}
${targetLine}
Elimine dividend trap, payout insustentavel, eventos nao recorrentes e deterioracao operacional.
${diversityLine}
Considere historico e tendencia, nao so a fotografia atual.
Use score de 0 a 100 por classe.
Motivo curto e objetivo (maximo 60 caracteres).
Campos textuais devem ser extremamente curtos, de preferencia 2 a 6 palavras.
Quando um indicador nao se aplicar, use "N/A".
Retorne somente JSON puro, sem markdown e sem texto extra.

Formato exato:
${format}`;
}

function limparTextoJSON(texto) {
  return String(texto || '')
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function repararJSON(candidato) {
  return candidato
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/\u00A0/g, ' ')
    .trim();
}

function validarGrupo(groupKey, dados) {
  if (!dados || typeof dados !== 'object') return null;

  if (groupKey === 'acoes' && Array.isArray(dados.acoes)) {
    return { acoes: dados.acoes };
  }

  if (groupKey === 'fiis' && Array.isArray(dados.fiis)) {
    return { fiis: dados.fiis };
  }

  return null;
}

function extrairJSON(texto, groupKey) {
  const textoLimpo = limparTextoJSON(texto);
  const candidatos = [];
  let depth = 0, inicio = -1;
  for (let i = 0; i < textoLimpo.length; i++) {
    if (textoLimpo[i] === '{') { if (depth === 0) inicio = i; depth++; }
    else if (textoLimpo[i] === '}') {
      depth--;
      if (depth === 0 && inicio >= 0) {
        candidatos.push(textoLimpo.slice(inicio, i + 1));
        inicio = -1;
      }
    }
  }
  candidatos.sort((a, b) => b.length - a.length);
  for (const c of candidatos) {
    try {
      const p = JSON.parse(c);
      const validado = validarGrupo(groupKey, p);
      if (validado) return validado;
    } catch {}
    try {
      const p = JSON.parse(repararJSON(c));
      const validado = validarGrupo(groupKey, p);
      if (validado) return validado;
    } catch {}
  }
  return null;
}

async function chamarGemini(prompt, comBusca = true) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
  };

  if (comBusca) {
    body.tools = [{ google_search: {} }];
  }

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(90_000)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini HTTP ${res.status}`);
  }

  const json = await res.json();
  return (json.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
}

async function buscarGrupo(groupKey) {
  const prompt = buildPrompt(groupKey);

  // Tenta com busca na web; se falhar, tenta sem
  const texto = await chamarGemini(prompt, SEARCH_ENABLED)
    .catch(() => chamarGemini(prompt, false));

  let dados = extrairJSON(texto, groupKey);
  if (dados) return dados;

  const promptCorrecao = `${prompt}

ATENCAO FINAL:
- responda com JSON valido
- nao use markdown
- nao use bloco \`\`\`
- nao escreva explicacoes
- nao deixe virgula sobrando
- a raiz deve conter apenas a chave "${groupKey}"`;

  const textoCorrigido = await chamarGemini(promptCorrecao, false);
  dados = extrairJSON(textoCorrigido, groupKey);
  if (!dados) throw new Error(`JSON invalido para ${groupKey}`);
  return dados;
}

// ── Rotas ────────────────────────────────────────────────────────────────────

// Health check
app.get('/api/radar', (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY nao configurada no servidor.' });
  }
  res.json({ ok: true, message: 'Backend online. Use POST para buscar dados.', model: GEMINI_MODEL });
});

// Busca principal
app.post('/api/radar', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY nao configurada. Edite o arquivo .env.' });
  }

  try {
    // Busca acoes e FIIs em paralelo
    const [dadosAcoes, dadosFiis] = await Promise.all([
      buscarGrupo('acoes'),
      buscarGrupo('fiis')
    ]);

    if (!dadosAcoes.acoes || !dadosFiis.fiis) {
      return res.status(502).json({ error: 'Resposta invalida da IA. Tente novamente.' });
    }

    res.json({
      acoes: dadosAcoes.acoes,
      fiis:  dadosFiis.fiis
    });

  } catch (e) {
    console.error('[RADAR] Erro:', e.message);
    res.status(502).json({ error: e.message || 'Erro ao consultar a API Gemini.' });
  }
});

// SPA fallback (React Router)
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../frontend/dist/index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 RADAR-B3 Backend rodando na porta ${PORT}`);
  console.log(`   Modelo : ${GEMINI_MODEL}`);
  console.log(`   API Key: ${GEMINI_API_KEY ? '✓ configurada' : '✗ FALTANDO — edite o .env'}`);
  console.log(`   Busca  : ${SEARCH_ENABLED ? 'ativada' : 'desativada'}\n`);
});
