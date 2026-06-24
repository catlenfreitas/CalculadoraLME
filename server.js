const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const SHEET_CSV =
  'https://docs.google.com/spreadsheets/d/e/' +
  '2PACX-1vQ2ueu0_JdK4xTlvucWIsQw3HYQysnIuxXGutW2K5XxTfjQdyNvTiybwsxBf80M3zjQzTIom0SJ2-Aq' +
  '/pub?output=csv';

// ── Helpers ─────────────────────────────────────

function toNum(str) {
  if (!str) return NaN;
  let s = str.replace(/\s/g, '').replace(/[R$US%]/g, '');

  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }

  return parseFloat(s);
}

function parseCsv(text) {
  const rows = text.split('\n').map(r => r.split(','));

  const dados = [];

  for (const row of rows) {
    let data = null, sn = null, usd = null;

    for (const cell of row) {
      const dateMatch = cell.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
      if (dateMatch) {
        const [_, d, m, y] = dateMatch;
        data = new Date(`${y}-${m}-${d}`);
      }

      const n = toNum(cell);
      if (n > 5000 && n < 500000) sn = n;
      if (n > 3 && n < 30) usd = n;
    }

    if (data && sn && usd) {
      dados.push({ data, sn, usd });
    }
  }

  dados.sort((a, b) => b.data - a.data);

  const hoje = dados[0];

  const agora = new Date();
  const semanaInicio = new Date();
  semanaInicio.setDate(agora.getDate() - 7);

  const mesInicio = new Date(agora.getFullYear(), agora.getMonth(), 1);

  const semana = dados.filter(d => d.data >= semanaInicio);
  const mes = dados.filter(d => d.data >= mesInicio);

  function media(arr, campo) {
    if (!arr.length) return 0;
    return arr.reduce((acc, v) => acc + v[campo], 0) / arr.length;
  }

  return {
    hoje: {
      estanho: hoje.sn,
      dolar: hoje.usd,
      data: hoje.data.toLocaleDateString('pt-BR')
    },
    semana: {
      estanho: media(semana, 'sn'),
      dolar: media(semana, 'usd')
    },
    mes: {
      estanho: media(mes, 'sn'),
      dolar: media(mes, 'usd')
    }
  };
}

// ── API ─────────────────────────────────────────

app.get('/api/cotacoes', async (req, res) => {
  try {
    const resp = await fetch(SHEET_CSV);
    const text = await resp.text();

    const result = parseCsv(text);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Front ───────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Rodando na porta ${PORT}`);
});