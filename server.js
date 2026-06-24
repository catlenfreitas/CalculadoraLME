const express = require('express');
const fetch   = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
const path    = require('path');

const app  = express();
const PORT = 3000;

// ── Configuração ─────────────────────────────────────────────────────────────
const SHEET_CSV =
  'https://docs.google.com/spreadsheets/d/e/' +
  '2PACX-1vQ2ueu0_JdK4xTlvucWIsQw3HYQysnIuxXGutW2K5XxTfjQdyNvTiybwsxBf80M3zjQzTIom0SJ2-Aq' +
  '/pub?output=csv';

// Cache em memória — evita bater na planilha a cada request
let cache = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Converte string para número, aceita formatos BR (54.000,00) e US (54000.00) */
function toNum(str) {
  if (!str) return NaN;
  let s = str.replace(/\s/g, '').replace(/[R$US%]/g, '');
  if (s.includes(',') && s.includes('.')) {
    // 54.000,00 → separador de milhar é ponto, decimal é vírgula
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    // 5,1244 → decimal com vírgula
    s = s.replace(',', '.');
  }
  return parseFloat(s);
}

/** Faz o parse do CSV e extrai Estanho, Dólar e Data */
function parseCsv(text) {
  const rows = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .split('\n')
    .map(row => {
      // parse células respeitando aspas
      const cells = [];
      let cur = '', inQ = false;
      for (const ch of row) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
      cells.push(cur.trim());
      return cells;
    });

  let snValue = null, usdValue = null, dateValue = null;
  const debugRows = rows.slice(0, 10).map((r, i) => `row[${i}]: ${r.join(' | ')}`);

  // Estratégia 1 — procurar por palavras-chave
  for (const row of rows) {
    const rowStr = row.join(' ').toLowerCase();

    // Data
    const dateMatch = rowStr.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})/);
    if (dateMatch && !dateValue) dateValue = dateMatch[0];

    // Estanho
    if (!snValue && (rowStr.includes('estanho') || rowStr.includes('tin') || / sn[\s,]/.test(rowStr))) {
      for (const cell of row) {
        const n = toNum(cell);
        if (n > 5000 && n < 500000) { snValue = n; break; }
      }
    }

    // Dólar
    if (!usdValue && (rowStr.includes('dólar') || rowStr.includes('dolar') ||
        rowStr.includes('usd') || rowStr.includes('câmbio') || rowStr.includes('ptax'))) {
      for (const cell of row) {
        const n = toNum(cell);
        if (n > 3 && n < 30) { usdValue = n; break; }
      }
    }
  }

  // Estratégia 2 — scan geral de valores plausíveis
  if (!snValue || !usdValue) {
    for (const row of rows) {
      for (const cell of row) {
        const n = toNum(cell);
        if (!snValue  && n > 5000  && n < 500000) snValue  = n;
        if (!usdValue && n > 3     && n < 30)     usdValue = n;
      }
    }
  }

  return { snValue, usdValue, dateValue, debugRows };
}

// ── Rota da API ───────────────────────────────────────────────────────────────
app.get('/api/cotacoes', async (req, res) => {
  // Retorna cache se ainda válido
  if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
    return res.json({ ...cache.data, cached: true });
  }

  try {
    console.log('[API] Buscando planilha...');
    const resp = await fetch(SHEET_CSV, { timeout: 10000 });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const text = await resp.text();
    const { snValue, usdValue, dateValue, debugRows } = parseCsv(text);

    console.log(`[API] Sn=${snValue} | USD=${usdValue} | Data=${dateValue}`);

    if (!snValue || !usdValue) {
      // Retorna debug para facilitar diagnóstico
      return res.status(422).json({
        error: 'Não foi possível extrair Estanho e/ou Dólar da planilha.',
        debug: debugRows,
        rawSample: text.substring(0, 600),
      });
    }

    const result = {
      estanho: snValue,
      dolar:   usdValue,
      data:    dateValue || new Date().toLocaleDateString('pt-BR'),
      fetchedAt: new Date().toISOString(),
      cached: false,
    };

    cache = { data: result, ts: Date.now() };
    res.json(result);

  } catch (err) {
    console.error('[API] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Força atualização do cache
app.get('/api/cotacoes/refresh', async (req, res) => {
  cache = { data: null, ts: 0 };
  res.redirect('/api/cotacoes');
});

// ── Serve o frontend ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`\n✅  Servidor rodando em http://localhost:${PORT}`);
  console.log(`📊  API disponível em http://localhost:${PORT}/api/cotacoes\n`);
});
