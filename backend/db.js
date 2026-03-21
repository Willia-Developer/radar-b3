/**
 * ═══════════════════════════════════════════════════════
 *  RADAR-B3 — Módulo de Banco de Dados (SQLite via sql.js)
 *  Persistência de análises para rastreabilidade e histórico
 * ═══════════════════════════════════════════════════════
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const DB_PATH = join(__dirname, 'data', 'radar.db');

let db = null;

/** Inicializa o banco e cria tabelas se não existirem */
export async function initDB() {
  const SQL = await initSqlJs();

  // Garante que o diretório data/ exista
  const dataDir = dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Carrega banco existente ou cria novo
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Cria tabelas
  db.run(`
    CREATE TABLE IF NOT EXISTS analysis_runs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      asset_type    TEXT NOT NULL,
      ticker        TEXT NOT NULL,
      nome          TEXT,
      setor_segmento TEXT,
      preco         TEXT,
      dy            TEXT,
      pvp           TEXT,
      pl            TEXT,
      roe           TEXT,
      payout        TEXT,
      vacancia      TEXT,
      trap          TEXT,
      historico     TEXT,
      score         INTEGER,
      tese          TEXT,
      pontos_de_atencao TEXT,
      score_breakdown TEXT,
      raw_json      TEXT,
      model         TEXT,
      prompt_version TEXT DEFAULT 'v2',
      source        TEXT DEFAULT 'manual'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker      TEXT NOT NULL,
      captured_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      preco       TEXT,
      dy          TEXT,
      pvp         TEXT,
      pl          TEXT,
      roe         TEXT,
      payout      TEXT,
      vacancia    TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS performance_tracking (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      analysis_run_id INTEGER,
      ticker          TEXT NOT NULL,
      price_d0        TEXT,
      price_d7        TEXT,
      price_d30       TEXT,
      price_d90       TEXT,
      result_d7       TEXT,
      result_d30      TEXT,
      result_d90      TEXT,
      FOREIGN KEY (analysis_run_id) REFERENCES analysis_runs(id)
    )
  `);

  // Índices para consultas rápidas
  db.run(`CREATE INDEX IF NOT EXISTS idx_runs_created ON analysis_runs(created_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_runs_ticker ON analysis_runs(ticker)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_snapshots_ticker ON snapshots(ticker)`);

  salvar();
  console.log('📦 Banco SQLite inicializado em', DB_PATH);
  return db;
}

/** Salva o banco em disco */
function salvar() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/** Salva uma rodada completa de análise (ações + FIIs) */
export function salvarAnalise(acoes, fiis, model, source = 'manual') {
  if (!db) return null;

  const createdAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const runIds = [];

  const insertRun = db.prepare(`
    INSERT INTO analysis_runs
    (created_at, asset_type, ticker, nome, setor_segmento, preco, dy, pvp, pl, roe, payout, vacancia, trap, historico, score, tese, pontos_de_atencao, score_breakdown, raw_json, model, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of (acoes || [])) {
    insertRun.run([
      createdAt, 'acao', item.ticker, item.nome, item.setor,
      item.preco, item.dy, null, item.pl, item.roe, item.payout, null,
      item.trap, item.historico, item.score,
      item.tese || null, item.pontos_de_atencao || null,
      JSON.stringify(item.score_breakdown || []),
      JSON.stringify(item), model, source
    ]);
  }

  for (const item of (fiis || [])) {
    insertRun.run([
      createdAt, 'fii', item.ticker, item.nome, item.segmento,
      item.preco, item.dy, item.pvp, null, null, null, item.vacancia,
      item.trap, item.historico, item.score,
      item.tese || null, item.pontos_de_atencao || null,
      JSON.stringify(item.score_breakdown || []),
      JSON.stringify(item), model, source
    ]);
  }

  insertRun.free();
  salvar();

  return createdAt;
}

/** Lista todas as rodadas (agrupadas por created_at) */
export function listarRodadas(limit = 50) {
  if (!db) return [];

  const rows = db.exec(`
    SELECT
      created_at,
      source,
      model,
      COUNT(*) as total_ativos,
      SUM(CASE WHEN asset_type = 'acao' THEN 1 ELSE 0 END) as total_acoes,
      SUM(CASE WHEN asset_type = 'fii' THEN 1 ELSE 0 END) as total_fiis,
      ROUND(AVG(score), 1) as score_medio
    FROM analysis_runs
    GROUP BY created_at
    ORDER BY created_at DESC
    LIMIT ?
  `, [limit]);

  if (!rows.length) return [];

  const cols = rows[0].columns;
  return rows[0].values.map(row => {
    const obj = {};
    cols.forEach((c, i) => obj[c] = row[i]);
    return obj;
  });
}

/** Busca todos os ativos de uma rodada específica */
export function buscarRodada(createdAt) {
  if (!db) return null;

  const rows = db.exec(`
    SELECT * FROM analysis_runs
    WHERE created_at = ?
    ORDER BY asset_type, score DESC
  `, [createdAt]);

  if (!rows.length) return null;

  const cols = rows[0].columns;
  const items = rows[0].values.map(row => {
    const obj = {};
    cols.forEach((c, i) => obj[c] = row[i]);
    // Parse score_breakdown e raw_json
    try { obj.score_breakdown = JSON.parse(obj.score_breakdown); } catch { obj.score_breakdown = []; }
    try { obj.raw_json = JSON.parse(obj.raw_json); } catch { obj.raw_json = {}; }
    return obj;
  });

  const acoes = items.filter(i => i.asset_type === 'acao').map(i => i.raw_json);
  const fiis  = items.filter(i => i.asset_type === 'fii').map(i => i.raw_json);

  return {
    created_at: createdAt,
    model: items[0]?.model,
    source: items[0]?.source,
    acoes,
    fiis,
    resumo: items.map(i => ({
      ticker: i.ticker,
      nome: i.nome,
      asset_type: i.asset_type,
      score: i.score,
      dy: i.dy,
      tese: i.tese
    }))
  };
}

/** Busca histórico de um ticker específico */
export function historicoTicker(ticker) {
  if (!db) return [];

  const rows = db.exec(`
    SELECT created_at, score, dy, preco, tese, pontos_de_atencao, model
    FROM analysis_runs
    WHERE ticker = ?
    ORDER BY created_at DESC
    LIMIT 30
  `, [ticker.toUpperCase()]);

  if (!rows.length) return [];

  const cols = rows[0].columns;
  return rows[0].values.map(row => {
    const obj = {};
    cols.forEach((c, i) => obj[c] = row[i]);
    return obj;
  });
}

/** Estatísticas gerais do banco */
export function estatisticas() {
  if (!db) return {};

  const total = db.exec(`SELECT COUNT(*) as c FROM analysis_runs`);
  const rodadas = db.exec(`SELECT COUNT(DISTINCT created_at) as c FROM analysis_runs`);
  const primeira = db.exec(`SELECT MIN(created_at) as d FROM analysis_runs`);
  const ultima = db.exec(`SELECT MAX(created_at) as d FROM analysis_runs`);
  const topAcoes = db.exec(`
    SELECT ticker, COUNT(*) as vezes, ROUND(AVG(score),1) as score_medio
    FROM analysis_runs WHERE asset_type='acao'
    GROUP BY ticker ORDER BY vezes DESC LIMIT 5
  `);
  const topFiis = db.exec(`
    SELECT ticker, COUNT(*) as vezes, ROUND(AVG(score),1) as score_medio
    FROM analysis_runs WHERE asset_type='fii'
    GROUP BY ticker ORDER BY vezes DESC LIMIT 5
  `);

  const parseRows = (result) => {
    if (!result.length) return [];
    const cols = result[0].columns;
    return result[0].values.map(row => {
      const obj = {};
      cols.forEach((c, i) => obj[c] = row[i]);
      return obj;
    });
  };

  return {
    total_registros: total[0]?.values[0]?.[0] || 0,
    total_rodadas: rodadas[0]?.values[0]?.[0] || 0,
    primeira_analise: primeira[0]?.values[0]?.[0] || null,
    ultima_analise: ultima[0]?.values[0]?.[0] || null,
    top_acoes: parseRows(topAcoes),
    top_fiis: parseRows(topFiis)
  };
}
