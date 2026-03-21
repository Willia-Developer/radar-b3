import { useState, useEffect } from "react";

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

// ── Componente: Card de Ação ─────────────────────────────────────────────────
function CardAcao({ item }) {
  return (
    <article className="card stock">
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
        <div className="metric"><span className="metric-label">Trap</span><span className={trapClass(item.trap)}>{item.trap||"-"}</span></div>
        <div className="metric metric-stack"><span className="metric-label">Historico</span><span>{item.historico||"-"}</span></div>
        <div className="metric metric-stack"><span className="metric-label">Tend. Receita</span><span>{item.tendencia_receita||"-"}</span></div>
        <div className="metric metric-stack"><span className="metric-label">Tend. Lucro</span><span>{item.tendencia_lucro||"-"}</span></div>
        <div className="metric metric-stack"><span className="metric-label">Tend. Dividendos</span><span>{item.tendencia_dividendos||"-"}</span></div>
        <div className="metric metric-stack"><span className="metric-label">Comp. Setorial</span><span>{item.comparativo_setorial||"-"}</span></div>
      </div>
      <div className="score-track">
        <div className={`score-fill ${scoreClass(item.score)}`} style={{width:`${item.score}%`}} />
      </div>
      <div className="score-row"><span>Score</span><span>{item.score}/100</span></div>
      {item.score_breakdown && Array.isArray(item.score_breakdown) && (
        <div className="score-breakdown">
          {item.score_breakdown.map((r, i) => <span key={i} className="score-tag">{r}</span>)}
        </div>
      )}
      <div className="card-insight tese-block">
        <div className="insight-label">Por que entrou no radar</div>
        <p>{item.tese || item.motivo || "-"}</p>
      </div>
      <div className="card-insight atencao-block">
        <div className="insight-label">Pontos de atencao</div>
        <p>{item.pontos_de_atencao || "-"}</p>
      </div>
    </article>
  );
}

// ── Componente: Card de FII ──────────────────────────────────────────────────
function CardFii({ item }) {
  return (
    <article className="card fii">
      <div className="card-top-line" />
      <div className="ticker">{item.ticker}</div>
      <div className="name">{item.nome}<small>{item.segmento}</small></div>
      <div className="metrics">
        <div className="metric"><span className="metric-label">Preco</span><span>{item.preco}</span></div>
        <div className="metric"><span className="metric-label">P/VP</span><span className={metricClass(item.pvp,"pvp-fii")}>{item.pvp}</span></div>
        <div className="metric"><span className="metric-label">DY</span><span className={metricClass(item.dy,"dy")}>{item.dy}</span></div>
        <div className="metric"><span className="metric-label">Vacancia</span><span className={metricClass(item.vacancia,"vacancia")}>{item.vacancia}</span></div>
        <div className="metric"><span className="metric-label">Contrato</span><span>{item.contrato||"-"}</span></div>
        <div className="metric"><span className="metric-label">Trap</span><span className={trapClass(item.trap)}>{item.trap||"-"}</span></div>
        <div className="metric metric-stack"><span className="metric-label">Historico</span><span>{item.historico||"-"}</span></div>
        <div className="metric metric-stack"><span className="metric-label">Qualidade</span><span>{item.qualidade||"-"}</span></div>
        <div className="metric metric-stack"><span className="metric-label">Tend. Dividendos</span><span>{item.tendencia_dividendos||"-"}</span></div>
        <div className="metric metric-stack"><span className="metric-label">Comp. Segmento</span><span>{item.comparativo_segmento||"-"}</span></div>
      </div>
      <div className="score-track">
        <div className={`score-fill ${scoreClass(item.score)}`} style={{width:`${item.score}%`}} />
      </div>
      <div className="score-row"><span>Score</span><span>{item.score}/100</span></div>
      {item.score_breakdown && Array.isArray(item.score_breakdown) && (
        <div className="score-breakdown">
          {item.score_breakdown.map((r, i) => <span key={i} className="score-tag">{r}</span>)}
        </div>
      )}
      <div className="card-insight tese-block">
        <div className="insight-label">Por que entrou no radar</div>
        <p>{item.tese || item.motivo || "-"}</p>
      </div>
      <div className="card-insight atencao-block">
        <div className="insight-label">Pontos de atencao</div>
        <p>{item.pontos_de_atencao || "-"}</p>
      </div>
    </article>
  );
}

// ── Tela: Radar (principal) ──────────────────────────────────────────────────
function TelaRadar() {
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
      setStatus(result.salvo_em ? "Dados atualizados e salvos no historico." : "Dados atualizados com sucesso.");
    } catch (e) {
      setError(e.message || "Erro desconhecido. Tente novamente.");
      setStatus("");
    } finally {
      window.clearInterval(timer);
      setBusy(false);
    }
  }

  return (
    <>
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
            {data.acoes.map(item => <CardAcao key={item.ticker} item={item} />)}
          </div>

          <div className="section-head fii-head">
            <div>
              <div className="section-label section-label-fii">FIIs</div>
              <h2>Top 4 oportunidades por segmento com DY minimo de 10%</h2>
            </div>
          </div>
          <div className="card-grid">
            {data.fiis.map(item => <CardFii key={item.ticker} item={item} />)}
          </div>

          <footer className="footnote">
            <p>Atualizado em {updatedAt}. {data.salvo_em && `Salvo no historico: ${data.salvo_em}`}</p>
            <p>Filtro fixo: nenhum resultado com dividend yield abaixo de 10%.</p>
            <p>Score separado por classe, comparacao setorial e historico incluidos.</p>
            <p>Analise informativa. Nao constitui recomendacao de investimento.</p>
          </footer>
        </section>
      )}
    </>
  );
}

// ── Tela: Histórico ──────────────────────────────────────────────────────────
function TelaHistorico() {
  const [rodadas, setRodadas]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [detalhe, setDetalhe]     = useState(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);

  useEffect(() => {
    fetch("/api/historico")
      .then(r => r.json())
      .then(d => { setRodadas(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function abrirRodada(timestamp) {
    setLoadingDetalhe(true);
    try {
      const res = await fetch(`/api/historico/${encodeURIComponent(timestamp)}`);
      const data = await res.json();
      setDetalhe(data);
    } catch {
      setDetalhe(null);
    }
    setLoadingDetalhe(false);
  }

  function voltar() {
    setDetalhe(null);
  }

  if (loading) {
    return <div className="hist-loading">Carregando historico...</div>;
  }

  // Detalhe de uma rodada
  if (detalhe) {
    return (
      <div className="hist-detalhe">
        <button className="secondary-button hist-voltar" onClick={voltar}>Voltar ao historico</button>

        <div className="hist-detalhe-header">
          <h2>Analise de {detalhe.created_at}</h2>
          <div className="hist-meta">
            <span className="hist-meta-tag">{detalhe.source === 'cron' ? 'Automatica' : 'Manual'}</span>
            <span className="hist-meta-tag">{detalhe.model}</span>
          </div>
        </div>

        {detalhe.acoes?.length > 0 && (
          <>
            <div className="section-head">
              <div>
                <div className="section-label section-label-stock">Acoes</div>
              </div>
            </div>
            <div className="card-grid">
              {detalhe.acoes.map(item => <CardAcao key={item.ticker} item={item} />)}
            </div>
          </>
        )}

        {detalhe.fiis?.length > 0 && (
          <>
            <div className="section-head fii-head">
              <div>
                <div className="section-label section-label-fii">FIIs</div>
              </div>
            </div>
            <div className="card-grid">
              {detalhe.fiis.map(item => <CardFii key={item.ticker} item={item} />)}
            </div>
          </>
        )}
      </div>
    );
  }

  // Lista de rodadas
  return (
    <div className="hist-lista">
      {rodadas.length === 0 ? (
        <div className="hist-vazio">
          <p>Nenhuma analise salva ainda.</p>
          <p>Use o botao "Buscar agora" na aba Radar para gerar a primeira analise.</p>
        </div>
      ) : (
        <>
          <div className="hist-resumo">
            <span>{rodadas.length} rodada{rodadas.length > 1 ? 's' : ''} salva{rodadas.length > 1 ? 's' : ''}</span>
          </div>
          <div className="hist-table-wrap">
            <table className="hist-table">
              <thead>
                <tr>
                  <th>Data / Hora</th>
                  <th>Origem</th>
                  <th>Modelo</th>
                  <th>Acoes</th>
                  <th>FIIs</th>
                  <th>Score Medio</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rodadas.map(r => (
                  <tr key={r.created_at}>
                    <td className="hist-date">{r.created_at}</td>
                    <td>
                      <span className={`hist-origin-tag ${r.source === 'cron' ? 'hist-origin-cron' : 'hist-origin-manual'}`}>
                        {r.source === 'cron' ? 'Auto' : 'Manual'}
                      </span>
                    </td>
                    <td className="hist-model">{r.model}</td>
                    <td className="hist-count">{r.total_acoes}</td>
                    <td className="hist-count">{r.total_fiis}</td>
                    <td>
                      <span className={`hist-score ${scoreClass(r.score_medio)}`}>{r.score_medio}</span>
                    </td>
                    <td>
                      <button
                        className="hist-btn-ver"
                        onClick={() => abrirRodada(r.created_at)}
                        disabled={loadingDetalhe}
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tela: Estatísticas ───────────────────────────────────────────────────────
function TelaStats() {
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="hist-loading">Carregando estatisticas...</div>;
  if (!stats) return <div className="hist-vazio">Erro ao carregar estatisticas.</div>;

  return (
    <div className="stats-page">
      <div className="stats-grid">
        <div className="stats-card">
          <div className="stats-number">{stats.total_rodadas}</div>
          <div className="stats-label">Rodadas</div>
        </div>
        <div className="stats-card">
          <div className="stats-number">{stats.total_registros}</div>
          <div className="stats-label">Registros</div>
        </div>
        <div className="stats-card">
          <div className="stats-number stats-date">{stats.primeira_analise || '-'}</div>
          <div className="stats-label">Primeira analise</div>
        </div>
        <div className="stats-card">
          <div className="stats-number stats-date">{stats.ultima_analise || '-'}</div>
          <div className="stats-label">Ultima analise</div>
        </div>
      </div>

      {stats.top_acoes?.length > 0 && (
        <div className="stats-section">
          <h3>Acoes mais frequentes</h3>
          <div className="stats-ranking">
            {stats.top_acoes.map((t, i) => (
              <div key={t.ticker} className="stats-rank-item">
                <span className="stats-rank-pos">#{i + 1}</span>
                <span className="stats-rank-ticker">{t.ticker}</span>
                <span className="stats-rank-info">{t.vezes}x &middot; Score medio: <span className={scoreClass(t.score_medio)}>{t.score_medio}</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.top_fiis?.length > 0 && (
        <div className="stats-section">
          <h3>FIIs mais frequentes</h3>
          <div className="stats-ranking">
            {stats.top_fiis.map((t, i) => (
              <div key={t.ticker} className="stats-rank-item">
                <span className="stats-rank-pos">#{i + 1}</span>
                <span className="stats-rank-ticker">{t.ticker}</span>
                <span className="stats-rank-info">{t.vezes}x &middot; Score medio: <span className={scoreClass(t.score_medio)}>{t.score_medio}</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.total_rodadas === 0 && (
        <div className="hist-vazio" style={{ marginTop: 24 }}>
          <p>Nenhum dado ainda. Execute a primeira analise para comecar a acumular estatisticas.</p>
        </div>
      )}
    </div>
  );
}

// ── App principal com navegação ──────────────────────────────────────────────
function App() {
  const [tab, setTab] = useState("radar");

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

        {/* ── Navegação ── */}
        <nav className="nav-tabs no-print">
          <button className={`nav-tab ${tab === 'radar' ? 'nav-tab-active' : ''}`} onClick={() => setTab('radar')}>
            Radar
          </button>
          <button className={`nav-tab ${tab === 'historico' ? 'nav-tab-active' : ''}`} onClick={() => setTab('historico')}>
            Historico
          </button>
          <button className={`nav-tab ${tab === 'stats' ? 'nav-tab-active' : ''}`} onClick={() => setTab('stats')}>
            Estatisticas
          </button>
        </nav>

        {/* ── Conteúdo ── */}
        {tab === 'radar' && <TelaRadar />}
        {tab === 'historico' && <TelaHistorico />}
        {tab === 'stats' && <TelaStats />}
      </section>
    </main>
  );
}

export default App;
