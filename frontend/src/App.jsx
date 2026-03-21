import { useState } from "react";

// Endpoint do backend Node.js (proxy pelo Vite em dev, mesmo servidor em prod)
const API_URL = "/api/radar";

const steps = [
  "Conectando ao servidor...",
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

// ── Backend (Node.js + Gemini no servidor) ───────────────────────────────────
async function buscarBackend() {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: "conservador" })
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json?.error || `Erro HTTP ${res.status}. Verifique se o backend está rodando.`);
  }

  if (!json.acoes || !json.fiis) {
    throw new Error("Resposta inválida do servidor. Tente novamente.");
  }

  return json;
}

// ── App ─────────────────────────────────────────────────────────────────────
function App() {
  const [status, setStatus]       = useState("");
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState("");
  const [data, setData]           = useState(null);
  const [updatedAt, setUpdatedAt] = useState("");

  function exportarPdf() { if (data) window.print(); }

  async function buscar() {
    if (busy) return;

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
      const result = await buscarBackend();
      setData(result);
      setUpdatedAt(new Date().toLocaleString("pt-BR"));
      setStatus("Dados atualizados com sucesso.");
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
            Filtro reforcado com DY minimo de 10%, anti-dividend trap, leitura de historico e comparacao setorial. Analise via Gemini no servidor.
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
