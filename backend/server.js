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

function buildPromptAcoes() {
  return `Voce e um analista criterioso de acoes da B3, com foco em renda passiva conservadora. Data: ${hoje()}.
${SEARCH_ENABLED ? 'Use busca na web para validar dados reais e atuais antes de responder.' : ''}

OBJETIVO: Selecionar as 4 MELHORES acoes da B3 para renda passiva conservadora.
Pense como um comite seletivo. Entre varios ativos aprovados, escolha apenas os que voce defenderia com mais conviccao.

CRITERIOS MINIMOS OBRIGATORIOS:
- Dividend Yield >= 10%
- P/L < 15
- ROE >= 12%
- Payout < 90% (salvo excecoes muito bem justificadas)
- Divida/EBITDA < 3.0 quando aplicavel
- Ao menos 3 setores diferentes

APOS FILTRAR, faca uma segunda analise qualitativa e escolha SOMENTE as 4 melhores com base em:
- sustentabilidade dos dividendos
- previsibilidade de geracao de caixa/lucro
- historico de distribuicao
- forca operacional e resiliencia do setor
- valuation relativo e comparacao com pares
- risco de dividend trap

EVITE ativos com:
- DY elevado por distorcao temporaria ou evento pontual
- payout excessivamente pressionado
- lucro fragil ou inconsistente
- endividamento preocupante
- deterioracao operacional

CAMPOS: retorne exatamente estes campos para cada acao:
- ticker, nome, setor, preco, pl, roe, payout, margem_liquida, margem_ebitda, divida_ebitda, dy
- trap (risco de dividend trap: "Baixo", "Medio" ou "Alto")
- historico (historico de dividendos, 2-6 palavras)
- tendencia_receita, tendencia_lucro, tendencia_dividendos (2-4 palavras cada)
- comparativo_setorial (posicao vs pares, 3-8 palavras)
- score (0-100)
- score_breakdown (array de 3-4 strings curtas justificando o score)
- tese (por que entrou no radar, 1-2 frases curtas)
- pontos_de_atencao (riscos ou limitacoes, 1-2 frases curtas)

Se nao houver dado confiavel, use "N/A". Nunca invente numeros.
Retorne somente JSON puro, sem markdown e sem texto extra.

Formato exato:
{"acoes":[{"ticker":"XXXX3","nome":"Nome","setor":"Setor","preco":"R$ 00,00","pl":"0.0","roe":"00%","dy":"10%","payout":"00%","margem_liquida":"00%","margem_ebitda":"00%","divida_ebitda":"0.0","trap":"Baixo","historico":"Consistente 5 anos","tendencia_receita":"Crescente","tendencia_lucro":"Estavel","tendencia_dividendos":"Crescente","comparativo_setorial":"Melhor DY do setor","score":85,"score_breakdown":["DY sustentavel","Payout controlado","ROE alto"],"tese":"DY atrativo com previsibilidade e historico consistente.","pontos_de_atencao":"Setor regulado, crescimento limitado."}]}`;
}

function buildPromptFiis() {
  return `Voce e um analista criterioso de FIIs da B3, com foco em renda passiva conservadora. Data: ${hoje()}.
${SEARCH_ENABLED ? 'Use busca na web para validar dados reais e atuais antes de responder.' : ''}

OBJETIVO: Selecionar os 4 MELHORES FIIs da B3 para renda passiva conservadora.
Pense como um comite seletivo. Entre varios ativos aprovados, escolha apenas os que voce defenderia com mais conviccao.

CRITERIOS MINIMOS:
- Dividend Yield >= 10%
- P/VP < 1.2 (salvo excecoes bem justificadas)
- Vacancia < 12% quando aplicavel (FIIs de papel: vacancia = "Nao aplicavel")
- Preferir contratos defensivos e portfolios de qualidade
- Ao menos 3 segmentos diferentes

ATENCAO:
- Nao trate FIIs de papel/CRI como FIIs de tijolo.
- Para FIIs de papel, vacancia deve ser "Nao aplicavel".
- Para FIIs hibridos, interprete metricas com contexto.

APOS FILTRAR, faca uma segunda analise qualitativa e escolha SOMENTE os 4 melhores com base em:
- previsibilidade dos rendimentos
- qualidade do portfolio
- resiliencia da tese
- risco de armadilha de dividendo
- historico de distribuicao
- diversificacao e atratividade relativa frente aos pares

EVITE FIIs com:
- rendimento inflado por evento nao recorrente
- ativos fracos ou concentracao excessiva
- risco de deterioracao operacional
- historico ruim de previsibilidade

CAMPOS: retorne exatamente estes campos para cada FII:
- ticker, nome, segmento, preco, pvp, dy
- vacancia (ou "Nao aplicavel" para FIIs de papel)
- contrato (tipo de contrato: "Atipico", "Tipico", "Misto", "N/A")
- trap (risco de dividend trap: "Baixo", "Medio" ou "Alto")
- historico (historico de rendimentos, 2-6 palavras)
- qualidade (qualidade dos ativos, 2-6 palavras)
- tendencia_dividendos (2-4 palavras)
- comparativo_segmento (posicao vs pares, 3-8 palavras)
- score (0-100)
- score_breakdown (array de 3-4 strings curtas justificando o score)
- tese (por que entrou no radar, 1-2 frases curtas)
- pontos_de_atencao (riscos ou limitacoes, 1-2 frases curtas)

Se nao houver dado confiavel, use "N/A". Nunca invente numeros.
Para FIIs de papel, vacancia = "Nao aplicavel".
Retorne somente JSON puro, sem markdown e sem texto extra.

Formato exato:
{"fiis":[{"ticker":"XXXX11","nome":"Nome","segmento":"Segmento","preco":"R$ 00,00","pvp":"0.00","dy":"10%","vacancia":"3%","contrato":"Atipico","trap":"Baixo","historico":"Estavel e crescente","qualidade":"Galp. classe A bem localizados","tendencia_dividendos":"Estavel","comparativo_segmento":"Melhor DY do segmento","score":88,"score_breakdown":["Portfolio premium","Vacancia minima","Contratos atipicos"],"tese":"Portfolio premium com contratos defensivos e rendimento previsivel.","pontos_de_atencao":"Concentracao em SP, menor liquidez."}]}`;
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
  const prompt = groupKey === 'acoes' ? buildPromptAcoes() : buildPromptFiis();

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
