// Code node: Cruzar perfis
// Responsabilidade única: cruzar clientes com o catálogo pelo perfil e devolver uma tabela.
// Não cria mensagens nem templates; isso fica no Code node após o Merge.
const webhook = $('Webhook - Clientes').first().json;
const payload = webhook.body ?? webhook;
const clientes = payload.clientes;
if (!Array.isArray(clientes) || clientes.length === 0) {
  throw new Error('O webhook deve receber uma lista não vazia em clientes[].');
}

const response = $input.first()?.json ?? {};
const csvText = typeof response.data === 'string'
  ? response.data
  : (typeof response.body === 'string' ? response.body : '');
if (!csvText.trim()) throw new Error('Não foi possível obter o conteúdo do CSV de investimentos.');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(cell.trim()); cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some(value => value !== '')) rows.push(row);
      row = []; cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

function normalize(value) {
  return String(value ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}
function parseNumber(value) {
  const raw = String(value ?? '').replace(/[^0-9,.-]/g, '');
  if (!raw) return 0;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}
function parseSaldo(value) {
  return parseNumber(String(value ?? '').replace(/r\$/i, ''));
}

const rows = parseCsv(csvText.replace(/^\uFEFF/, ''));
if (rows.length < 2) throw new Error('O CSV não possui opções de investimento.');
const headers = rows[0].map(normalize);
const indexes = Object.fromEntries(
  ['perfil', 'produto', 'minimo', 'rentabilidade']
    .map(key => [key, headers.indexOf(key)])
);
if (Object.values(indexes).some(index => index < 0)) {
  throw new Error('CSV deve conter as colunas perfil,produto,minimo,rentabilidade.');
}
const catalogo = rows.slice(1).map(row => ({
  perfil: row[indexes.perfil],
  produto: row[indexes.produto],
  minimo: parseNumber(row[indexes.minimo]),
  rentabilidade: row[indexes.rentabilidade],
})).filter(item => item.perfil && item.produto);

// Uma linha por combinação cliente × produto do perfil. A elegibilidade por saldo
// é um campo da tabela; seleção final e texto ficam no próximo Code node.
const tabelaCruzada = clientes.flatMap((cliente, clienteIndex) => {
  const perfil = normalize(cliente.perfil);
  const opcoesDoPerfil = catalogo.filter(item => normalize(item.perfil) === perfil);
  if (opcoesDoPerfil.length === 0) {
    return [{
      clienteIndex,
      nome: cliente.nome ?? '',
      email: cliente.email ?? '',
      saldo: cliente.saldo ?? '',
      saldoNumerico: parseSaldo(cliente.saldo),
      perfil: cliente.perfil ?? '',
      produto: null,
      minimo: null,
      rentabilidade: null,
      elegivelPorSaldo: false,
    }];
  }
  return opcoesDoPerfil.map(item => ({
    clienteIndex,
    nome: cliente.nome ?? '',
    email: cliente.email ?? '',
    saldo: cliente.saldo ?? '',
    saldoNumerico: parseSaldo(cliente.saldo),
    perfil: cliente.perfil ?? '',
    produto: item.produto,
    minimo: item.minimo,
    rentabilidade: item.rentabilidade,
    elegivelPorSaldo: item.minimo <= parseSaldo(cliente.saldo),
  }));
});

return [{
  json: {
    requestId: payload.requestId ?? null,
    totalClientes: clientes.length,
    totalLinhasTabela: tabelaCruzada.length,
    tabelaCruzada,
  },
}];
