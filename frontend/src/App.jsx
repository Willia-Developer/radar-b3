import { useState } from "react";

const steps = [
  "Conectando à API...",
  "Buscando dados em tempo real...",
  "Aplicando filtro anti-dividend trap...",
  "Normalizando por setor e segmento...",
  "Lendo historico e tendencia...",
  "Montando o painel final..."
];

function scoreClass(score) {
  if (score >= 90) return "good";
  if (score >= 75) return "warn";
  return "bad";
}

function parseNumber(value) {
  const normalized = String(value || "").replace(/[^\d,.-]/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function metricClass(value, kind) {
  const n = parseNumber(value);
  if (n === null) return "";
  if (kind === "pl")       return n < 10  ? "good" : n < 15  ? "warn" : "bad";
  if (kind === "pvp-fii")  return n < 0.9 ? "good" : n < 1.2 ? "warn" : "bad";
  if (kind === "vacancia") return n < 5   ? "good" : n < 12  ? "warn" : "bad";
  if (kind === "dy")       return n >= 10 ? "good" : "bad";
  if (kind === "roe")      return n >= 15 ? "good" : n >= 10 ? "warn" : "bad";
  if (kind === "margin")   return n >= 15 ? "good" : n >= 8  ? "warn" : "bad";
  if (kind === "debt")     return n <= 1.5 ? "good" : n <= 3 ? "warn" : "bad";
  if (kind === "payout")   return n <= 80 ? "good" : n <= 100 ? "warn" : "bad";
  return "";
}

function trapClass(value) {
  const v = String(value || "").toLowerCase();
  if (v.includes("baixo")) return "good";
  if (v.includes("medio")) return "warn";
  if (v.includes("alto"))  return "bad";
  return "";
}

function extrairJSON(txt) {
  const cands = [];
  let depth = 0, start = -1;
  for (let i = 0; i < txt.length; i++) {
    if (txt[i] === "{") { if (depth === 0) start = i; depth++; }
    else if (txt[i] === "}") { depth--; if (depth === 0 && start >= 0) { cands.push(txt.slice(start, i + 1)); start = -1; } }
  }
  cands.sort((a, b) => b.length - a.length);
  for (const c of cands) {
    try { const p = JSON.parse(c); if (Array.isArray(p.acoes) && Array.isArray(p.fiis)) return p; } catch {}
  }
  return null;
}

const PROMPT = `Você é analista de renda variável da B3, perfil CONSERVADOR. Data: ${new Date().toLocaleDateString("pt-BR")}.
Selecione 4 AÇÕES e 4 FIIs da B3 com DY mínimo de 10%, anti-dividend trap, perfil conservador.
Critérios ações: DY>=10%, P/VP<1.5, P/L<15, ROE>=12%, payout<90%, dívida/EBITDA<3.
Critérios FIIs: DY>=10%, P/VP<1.2, vacância<12%, contratos atípicos preferíveis.
Garanta ao menos 3 setores diferentes nas ações e 3 segmentos diferentes nos FIIs.
Responda SOMENTE com JSON puro, sem markdown, sem texto antes ou depois:
{"acoes":[{"ticker":"TAEE11","nome":"Taesa S.A.","setor":"Utilidades Básicas","preco":"R$ 35,00","pl":"7.5","roe":"25%","dy":"11.5%","margem_liquida":"35%","margem_ebitda":"70%","divida_ebitda":"1.8","payout":"85%","risco_dividend_trap":"Baixo","historico_dividendos":"Crescente 3 anos","tendencia_receita":"Estável","tendencia_lucro":"Estável","tendencia_dividendos":"Crescente","comparacao_setorial":"DY acima da média","score":88,"motivo":"Receita regulada com dividendos crescentes."},{"ticker":"BBAS3","nome":"Banco do Brasil","setor":"Financeiro","preco":"R$ 25,00","pl":"5.0","roe":"22%","dy":"10.5%","margem_liquida":"28%","margem_ebitda":"N/A","divida_ebitda":"N/A","payout":"45%","risco_dividend_trap":"Baixo","historico_dividendos":"Consistente","tendencia_receita":"Crescente","tendencia_lucro":"Crescente","tendencia_dividendos":"Crescente","comparacao_setorial":"Melhor DY entre bancos","score":85,"motivo":"Banco estatal sólido com alto ROE."},{"ticker":"CPLE6","nome":"Copel","setor":"Energia Elétrica","preco":"R$ 10,00","pl":"8.0","roe":"15%","dy":"10.0%","margem_liquida":"20%","margem_ebitda":"40%","divida_ebitda":"2.5","payout":"80%","risco_dividend_trap":"Medio","historico_dividendos":"Estável","tendencia_receita":"Estável","tendencia_lucro":"Estável","tendencia_dividendos":"Estável","comparacao_setorial":"Em linha com setor","score":80,"motivo":"Distribuidora de energia com DY consistente."},{"ticker":"VALE3","nome":"Vale S.A.","setor":"Mineração","preco":"R$ 62,00","pl":"6.0","roe":"18%","dy":"10.5%","margem_liquida":"28%","margem_ebitda":"45%","divida_ebitda":"1.2","payout":"60%","risco_dividend_trap":"Baixo","historico_dividendos":"Consistente","tendencia_receita":"Estável","tendencia_lucro":"Estável","tendencia_dividendos":"Estável","comparacao_setorial":"DY atrativo no setor","score":82,"motivo":"Mineradora líder com geração de caixa robusta."}],"fiis":[{"ticker":"HGLG11","nome":"Pátria Logística","segmento":"Logístico","preco":"R$ 155,00","pvp":"0.95","dy":"10.5%","vacancia":"3%","tipo_contrato":"Atípico","risco_dividend_trap":"Baixo","historico_rendimentos":"Estável e crescente","qualidade_ativos":"Galpões classe A","tendencia_dividendos":"Estável","comparacao_segmento":"DY acima do segmento","score":91,"motivo":"Portfólio premium com contratos atípicos."},{"ticker":"XPML11","nome":"XP Malls","segmento":"Shoppings","preco":"R$ 90,00","pvp":"0.88","dy":"10.2%","vacancia":"5%","tipo_contrato":"Típico","risco_dividend_trap":"Baixo","historico_rendimentos":"Crescente","qualidade_ativos":"Shoppings premium","tendencia_dividendos":"Crescente","comparacao_segmento":"Melhor DY do segmento","score":88,"motivo":"Shoppings de alto padrão com desconto."},{"ticker":"BTLG11","nome":"BTG Logística","segmento":"Logístico","preco":"R$ 100,00","pvp":"0.92","dy":"10.0%","vacancia":"2%","tipo_contrato":"Atípico","risco_dividend_trap":"Baixo","historico_rendimentos":"Estável","qualidade_ativos":"Portfólio diversificado","tendencia_dividendos":"Estável","comparacao_segmento":"Em linha com segmento","score":85,"motivo":"Baixa vacância e gestão sólida."},{"ticker":"KNRI11","nome":"Kinea Renda Imobiliária","segmento":"Híbrido","preco":"R$ 130,00","pvp":"0.90","dy":"10.3%","vacancia":"4%","tipo_contrato":"Misto","risco_dividend_trap":"Baixo","historico_rendimentos":"Crescente","qualidade_ativos":"Lajes e galpões prime","tendencia_dividendos":"Crescente","comparacao_segmento":"DY acima do segmento","score":87,"motivo":"FII híbrido de alta qualidade com gestão ativa."}]}
Substitua TODOS os valores acima por dados reais e atuais da B3.`;

// ── Anthropic (pago) ────────────────────────────────────────────────────────
async function buscarAnthropic(apiKey) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey.trim(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      messages: [{ role: "user", content: PROMPT }]
    })
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("Chave Anthropic inválida. Verifique em console.anthropic.com → API Keys.");
    if (res.status === 429) throw new Error("Limite de requisições Anthropic atingido. Aguarde.");
    throw new Error(`Erro Anthropic HTTP ${res.status}.`);
  }

  const json = await res.json();
  const txt = (json.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  const data = extrairJSON(txt);
  if (!data) throw new Error("Resposta Anthropic inválida. Tente novamente.");
  return data;
}

// ── Gemini (gratuito) ───────────────────────────────────────────────────────
async function buscarGemini(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 400 || res.status === 403) throw new Error("Chave Gemini inválida. Verifique em aistudio.google.com → API Keys.");
    if (res.status === 429) throw new Error("Limite de requisições Gemini atingido. Aguarde.");
    throw new Error(err?.error?.message || `Erro Gemini HTTP ${res.status}.`);
  }

  const json = await res.json();
  const txt = (json.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  const data = extrairJSON(txt);
  if (!data) throw new Error("Resposta Gemini inválida. Tente novamente.");
  return data;
}

// ── App ─────────────────────────────────────────────────────────────────────
function App() {
  const [status, setStatus]       = useState("");
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState("");
  const [data, setData]           = useState(null);
  const [updatedAt, setUpdatedAt] = useState("");
  const [provider, setProvider]   = useState("gemini");   // "gemini" | "anthropic"
  const [apiKey, setApiKey]       = useState("");
  const [keyOk, setKeyOk]         = useState(false);

  const isGemini = provider === "gemini";

  function exportarPdf() { if (data) window.print(); }

  async function buscar() {
    if (busy) return;
    if (!apiKey.trim()) {
      setError(`Informe sua chave de API ${isGemini ? "Gemini" : "Anthropic"} antes de buscar.`);
      return;
    }

    setBusy(true);
    setError("");
    setData(null);

    let stepIndex = 0;
    setStatus(steps[stepIndex]);
    const timer = window.setInterval(() => {
      stepIndex += 1;
      if (stepIndex < steps.length) setStatus(steps[stepIndex]);
    }, 1500);

    try {
      const result = isGemini ? await buscarGemini(apiKey) : await buscarAnthropic(apiKey);
      setData(result);
      setUpdatedAt(new Date().toLocaleString("pt-BR"));
      setStatus("Dados atualizados com sucesso.");
      setKeyOk(true);
    } catch (e) {
      setError(e.message || "Erro desconhecido. Tente novamente.");
      setStatus("");
    } finally {
      window.clearInterval(timer);
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="grid-bg" />
      <div className="glow" />

      <section className="shell">
        <header className="hero">
          <h1>Radar em tempo real<span> para a B3</span></h1>
          <p className="subtitle">
            Filtro reforcado com DY minimo de 10%, anti-dividend trap, leitura de historico e comparacao setorial.
          </p>
          <div className="badges">
            <span className="badge">DY minimo 10%</span>
            <span className="badge">Dividend Trap</span>
            <span className="badge">Setor x Pares</span>
            <span className="badge">Historico</span>
            <span className="badge">Tendencia</span>
            <span className="badge">Score por classe</span>
          </div>
        </header>

        {/* ── Seletor de provedor + chave ── */}
        <section className="api-key-section">

          {/* Toggle Gemini / Anthropic */}
          <div className="provider-toggle">
            <button
              className={`provider-btn ${isGemini ? "active" : ""}`}
              onClick={() => { setProvider("gemini"); setApiKey(""); setKeyOk(false); setError(""); }}
            >
              <span className="provider-badge free">GRÁTIS</span>
              Google Gemini
            </button>
            <button
              className={`provider-btn ${!isGemini ? "active" : ""}`}
              onClick={() => { setProvider("anthropic"); setApiKey(""); setKeyOk(false); setError(""); }}
            >
              <span className="provider-badge paid">PAGO</span>
              Anthropic Claude
            </button>
          </div>

          {/* Info do provedor */}
          <p className="provider-info">
            {isGemini
              ? <>Chave gratuita em <strong>aistudio.google.com</strong> → Get API Key</>
              : <>Chave paga em <strong>console.anthropic.com</strong> → API Keys</>
            }
          </p>

          {/* Input da chave */}
          <label className="api-key-label">
            Chave de API {isGemini ? "Gemini" : "Anthropic"}
            {keyOk && <span className="api-key-ok"> ✓ Ativa</span>}
          </label>
          <div className={`api-key-wrap ${apiKey ? "filled" : ""}`}>
            <span className="api-key-icon">🔑</span>
            <input
              type="password"
              className="api-key-input"
              placeholder={isGemini ? "AIzaSy..." : "sk-ant-api03-..."}
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setKeyOk(false); }}
            />
            {apiKey && (
              <button className="api-key-clear" onClick={() => { setApiKey(""); setKeyOk(false); setError(""); }}>✕</button>
            )}
          </div>
          <p className="api-key-hint">
            Fica só na memória do browser, nunca enviada a outros servidores.
          </p>
        </section>

        {/* ── Botão ── */}
        <section className="control">
          <button className={`scan-button ${busy ? "loading" : ""}`} onClick={buscar}>
            <span>{busy ? "..." : "Buscar agora"}</span>
          </button>

          <div className="status-row">
            {status ? <span className="dot" /> : null}
            <span>{status}</span>
          </div>

          {error && (
            <div className="error-box">
              <div>Erro: {error}</div>
            </div>
          )}
        </section>

        {/* ── Resultados ── */}
        {data && (
          <section className="results">
            <div className="results-actions no-print">
              <button className="secondary-button" onClick={exportarPdf}>Salvar em PDF</button>
            </div>

            <div className="section-head">
              <div>
                <div className="section-label section-label-stock">Acoes</div>
                <h2>Top 4 oportunidades por setor com DY minimo de 10%</h2>
              </div>
            </div>

            <div className="card-grid">
              {data.acoes.map(item => (
                <article className="card stock" key={item.ticker}>
                  <div className="card-top-line" />
                  <div className="ticker">{item.ticker}</div>
                  <div className="name">{item.nome}<small>{item.setor}</small></div>
                  <div className="metrics">
                    <div className="metric"><span className="metric-label">Preco</span><span>{item.preco}</span></div>
                    <div className="metric"><span className="metric-label">P/L</span><span className={metricClass(item.pl,"pl")}>{item.pl}</span></div>
                    <div className="metric"><span className="metric-label">ROE</span><span className={metricClass(item.roe,"roe")}>{item.roe}</span></div>
                    <div className="metric"><span className="metric-label">DY</span><span className={metricClass(item.dy,"dy")}>{item.dy}</span></div>
                    <div className="metric"><span className="metric-label">Payout</span><span className={metricClass(item.payout,"payout")}>{item.payout||"-"}</span></div>
                    <div className="metric"><span className="metric-label">Margem Liq.</span><span className={metricClass(item.margem_liquida,"margin")}>{item.margem_liquida||"-"}</span></div>
                    <div className="metric"><span className="metric-label">Margem EBITDA</span><span className={metricClass(item.margem_ebitda,"margin")}>{item.margem_ebitda||"-"}</span></div>
                    <div className="metric"><span className="metric-label">Divida/EBITDA</span><span className={metricClass(item.divida_ebitda,"debt")}>{item.divida_ebitda||"-"}</span></div>
                    <div className="metric"><span className="metric-label">Trap</span><span className={trapClass(item.risco_dividend_trap)}>{item.risco_dividend_trap||"-"}</span></div>
                    <div className="metric metric-stack"><span className="metric-label">Historico</span><span>{item.historico_dividendos||"-"}</span></div>
                    <div className="metric metric-stack"><span className="metric-label">Tend. Receita</span><span>{item.tendencia_receita||"-"}</span></div>
                    <div className="metric metric-stack"><span className="metric-label">Tend. Lucro</span><span>{item.tendencia_lucro||"-"}</span></div>
                    <div className="metric metric-stack"><span className="metric-label">Tend. Dividendos</span><span>{item.tendencia_dividendos||"-"}</span></div>
                    <div className="metric metric-stack"><span className="metric-label">Comp. Setorial</span><span>{item.comparacao_setorial||"-"}</span></div>
                  </div>
                  <div className="score-track">
                    <div className={`score-fill ${scoreClass(item.score)}`} style={{width:`${item.score}%`}} />
                  </div>
                  <div className="score-row"><span>Score</span><span>{item.score}/100</span></div>
                  <p className="reason">{item.motivo}</p>
                </article>
              ))}
            </div>

            <div className="section-head fii-head">
              <div>
                <div className="section-label section-label-fii">FIIs</div>
                <h2>Top 4 oportunidades por segmento com DY minimo de 10%</h2>
              </div>
            </div>

            <div className="card-grid">
              {data.fiis.map(item => (
                <article className="card fii" key={item.ticker}>
                  <div className="card-top-line" />
                  <div className="ticker">{item.ticker}</div>
                  <div className="name">{item.nome}<small>{item.segmento}</small></div>
                  <div className="metrics">
                    <div className="metric"><span className="metric-label">Preco</span><span>{item.preco}</span></div>
                    <div className="metric"><span className="metric-label">P/VP</span><span className={metricClass(item.pvp,"pvp-fii")}>{item.pvp}</span></div>
                    <div className="metric"><span className="metric-label">DY</span><span className={metricClass(item.dy,"dy")}>{item.dy}</span></div>
                    <div className="metric"><span className="metric-label">Vacancia</span><span className={metricClass(item.vacancia,"vacancia")}>{item.vacancia}</span></div>
                    <div className="metric"><span className="metric-label">Contrato</span><span>{item.tipo_contrato||"-"}</span></div>
                    <div className="metric"><span className="metric-label">Trap</span><span className={trapClass(item.risco_dividend_trap)}>{item.risco_dividend_trap||"-"}</span></div>
                    <div className="metric metric-stack"><span className="metric-label">Historico</span><span>{item.historico_rendimentos||"-"}</span></div>
                    <div className="metric metric-stack"><span className="metric-label">Qualidade</span><span>{item.qualidade_ativos||"-"}</span></div>
                    <div className="metric metric-stack"><span className="metric-label">Tend. Dividendos</span><span>{item.tendencia_dividendos||"-"}</span></div>
                    <div className="metric metric-stack"><span className="metric-label">Comp. Segmento</span><span>{item.comparacao_segmento||"-"}</span></div>
                  </div>
                  <div className="score-track">
                    <div className={`score-fill ${scoreClass(item.score)}`} style={{width:`${item.score}%`}} />
                  </div>
                  <div className="score-row"><span>Score</span><span>{item.score}/100</span></div>
                  <p className="reason">{item.motivo}</p>
                </article>
              ))}
            </div>

            <footer className="footnote">
              <p>Atualizado em {updatedAt}.</p>
              <p>Filtro fixo: nenhum resultado com dividend yield abaixo de 10%.</p>
              <p>Score separado por classe, comparacao setorial e historico incluidos.</p>
              <p>Analise informativa. Nao constitui recomendacao de investimento.</p>
            </footer>
          </section>
        )}
      </section>
    </main>
  );
}

export default App;
