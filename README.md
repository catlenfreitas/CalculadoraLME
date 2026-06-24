# Calculadora LME — Estanho

Calculadora de preços de estanho com base na cotação LME e câmbio do dólar,
com suporte a múltiplas alíquotas de ICMS e descontos por cliente.

---

## Instalação e uso

### Pré-requisitos
- [Node.js](https://nodejs.org/) versão 16 ou superior

### Passos

1. **Descompacte** o arquivo e entre na pasta:
   ```bash
   cd calculadora-lme-estanho
   ```

2. **Instale as dependências** (só precisa fazer uma vez):
   ```bash
   npm install
   ```

3. **Inicie o servidor:**
   ```bash
   node server.js
   ```

4. **Abra no navegador:**
   ```
   http://localhost:3000
   ```

---

## O que a calculadora faz

- Busca automaticamente a cotação do **Estanho LME** e do **Dólar** direto da
  planilha da Super Ligas Metais (atualiza a cada 5 minutos)
- Calcula o preço por kg com **5 alíquotas de ICMS**: 0%, 4%, 7%, 12% e 18%
- Aplica o **prêmio (desconto)** individual para cada cliente
- Todos os valores editáveis manualmente caso necessário

### Fórmula
```
Valor base (R$/kg) = (Estanho_USD × Câmbio_BRL × fator_ICMS) / 1000

Fatores ICMS:
  0%  → 0,9075
  4%  → 0,8712
  7%  → 0,8439
  12% → 0,7986
  18% → 0,7442

Valor final cliente = Valor base × (1 - desconto%)
```

### Exemplo
- Estanho: US$ 54.000,00/t
- Dólar: R$ 5,1244
- ICMS 12% (fator 0,7986): **R$ 346,50/kg**
- Cliente com 4% de desconto: **R$ 332,64/kg**

---

## API

O servidor expõe um endpoint REST:

| Endpoint | Descrição |
|---|---|
| `GET /api/cotacoes` | Retorna as cotações (com cache de 5 min) |
| `GET /api/cotacoes/refresh` | Força atualização do cache |

### Exemplo de resposta
```json
{
  "estanho": 54000,
  "dolar": 5.1244,
  "data": "05/06/2025",
  "fetchedAt": "2025-06-05T12:00:00.000Z",
  "cached": false
}
```
