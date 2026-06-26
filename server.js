const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const SHEET_CSV =
  'https://docs.google.com/spreadsheets/d/e/' +
  '2PACX-1vQ2ueu0_JdK4xTlvucWIsQw3HYQysnIuxXGutW2K5XxTfjQdyNvTiybwsxBf80M3zjQzTIom0SJ2-Aq' +
  '/pub?output=csv';

let cache = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000;

function toNum(str) {
  if (!str) return NaN;
  let s = str.replace(/\s/g, '').replace(/[R$US%"]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  return parseFloat(s);
}

function parseCSVRow(row) {
  const cells = [];
  let cur = '', inQ = false;
  for (const ch of row) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  cells.push(cur.trim());
  return cells;
}

function fmtDate(d) {
  return d.toLocaleDateString('pt-BR');
}

function parseCsv(text) {
  const rows = text
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .trim().split('\n')
    .map(parseCSVRow);

  console.log('[Parser] Total de linhas:', rows.length);
  rows.slice(0, 5).forEach((r, i) => console.log(`  row[${i}]:`, r.join(' | ')));

  const dados = [];

  for (const row of rows) {
    let data = null, sn = null, usd = null;

    for (const cell of row) {
      const dateMatch = cell.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
      if (dateMatch) {
        const [, d, m, y] = dateMatch;
        data = new Date(`${y}-${m}-${d}T12:00:00`);
      }
      const n = toNum(cell);

      if (sn === null && n > 5000 && n < 500000) {
        sn = n;
      }

      if (usd === null && n >= 4 && n <= 10) {
        usd = n;
      }
    }

    // Se houver data e estanho, adiciona mesmo sem dólar.
    // Quando não houver cotação, o dólar fica 0.
    if (data && sn !== null) {
      if (usd === null) usd = 0;

      dados.push({ data, sn, usd });

      console.log(
        `  [OK] ${fmtDate(data)} | Sn=${sn} | USD=${usd === 0 ? 'SEM COTAÇÃO' : usd}`
      );
    }
  }

  if (!dados.length) {
    console.error('[Parser] Nenhuma linha válida encontrada!');
    return null;
  }

  dados.sort((a, b) => b.data - a.data);

  const hoje = dados[0];
  const agora = new Date();

  const semanaInicio = new Date(agora);
  semanaInicio.setDate(agora.getDate() - 7);
  const mesInicio = new Date(agora.getFullYear(), agora.getMonth(), 1);

  const dadosSemana = dados.filter(d => d.data >= semanaInicio);
  const dadosMes = dados.filter(d => d.data >= mesInicio);

  const dadosSemanaValidos = dadosSemana.filter(d => d.usd > 0);
  const dadosMesValidos = dadosMes.filter(d => d.usd > 0);

  function media(arr, campo) {
    let soma = 0;
    let qtd = 0;

    for (const item of arr) {
      // Ignora dias sem cotação
      if (item.usd === 0) continue;

      soma += item[campo];
      qtd++;
    }

    return qtd ? soma / qtd : 0;
  }

  function periodo(arr) {
    if (!arr.length) return { dataInicio: null, dataFim: null };
    const sorted = [...arr].sort((a, b) => a.data - b.data);
    return {
      dataInicio: fmtDate(sorted[0].data),
      dataFim: fmtDate(sorted[sorted.length - 1].data)
    };
  }

  const perSemana = periodo(dadosSemana);
  const perMes = periodo(dadosMes);

  return {
    hoje: {
      estanho: hoje.sn,
      dolar: hoje.usd,
      data: fmtDate(hoje.data)
    },
    semana: {
      estanho: media(dadosSemanaValidos, 'sn'),
      dolar: media(dadosSemanaValidos, 'usd'),
      registros: dadosSemanaValidos.length,
      dataInicio: perSemana.dataInicio,
      dataFim: perSemana.dataFim
    },
    mes: {
      estanho: media(dadosMesValidos, 'sn'),
      dolar: media(dadosMesValidos, 'usd'),
      registros: dadosMesValidos.length,
      dataInicio: perMes.dataInicio,
      dataFim: perMes.dataFim
    },
    // histórico completo para o seletor de datas
    historico: dados.map(d => ({
      data: fmtDate(d.data),
      estanho: d.sn,
      dolar: d.usd
    }))
  };
}

app.get('/api/cotacoes', async (req, res) => {
  if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
    return res.json({ ...cache.data, cached: true });
  }

  try {
    console.log('[API] Buscando planilha...');

    let fetchFn;
    try { fetchFn = fetch; }
    catch { fetchFn = (...a) => import('node-fetch').then(({ default: f }) => f(...a)); }

    const resp = await fetchFn(SHEET_CSV, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const text = await resp.text();
    const result = parseCsv(text);

    if (!result) {
      return res.status(422).json({
        error: 'Não foi possível extrair dados da planilha.',
        rawSample: text.substring(0, 500)
      });
    }

    cache = { data: result, ts: Date.now() };
    res.json(result);

  } catch (err) {
    console.error('[API] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cotacoes/refresh', async (req, res) => {
  cache = { data: null, ts: 0 };
  res.redirect('/api/cotacoes');
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`\n✅  Servidor rodando em http://localhost:${PORT}`);
  console.log(`📊  API: http://localhost:${PORT}/api/cotacoes\n`);
});