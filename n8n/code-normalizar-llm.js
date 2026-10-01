// Code node: code normalizar para llm
// Run Once for All Items. Converte resultados[] em N items: um por destinatário.
const itens = $input.all().map(item => item.json ?? {});
if (itens.length === 0) throw new Error('O node não recebeu dados para normalizar.');

const envelope = itens.find(item => Array.isArray(item.resultados)) ?? itens[0];
const resultados = Array.isArray(envelope.resultados) ? envelope.resultados : itens;
if (resultados.length === 0) throw new Error('Não há resultados de clientes para organizar.');

function texto(value, fallback = '') {
  return String(value ?? fallback).trim();
}
function normalizarChave(value) {
  return texto(value).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function normalizarPerfil(value) {
  const perfis = {
    conservador: 'Conservador', conservadora: 'Conservador',
    moderado: 'Moderado', moderada: 'Moderado',
    arrojado: 'Arrojado', arrojada: 'Arrojado',
    agressivo: 'Arrojado', agressiva: 'Arrojado',
  };
  return perfis[normalizarChave(value)] ?? 'Não identificado';
}
function normalizarEmail(value) {
  return texto(value).toLowerCase();
}
function numeroBR(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const original = texto(value);
  if (!original) return null;
  const raw = original.replace(/[^0-9,.-]/g, '');
  if (!raw) return null;
  const parsed = Number(raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw);
  return Number.isFinite(parsed) ? parsed : null;
}
function moedaBR(value) {
  return value === null ? 'Não informado' : new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 2,
  }).format(value);
}

const registros = resultados.map((resultado, index) => {
  const cliente = resultado.cliente ?? resultado;
  const investimento = resultado.investimento ?? {};
  const emailOriginal = texto(cliente.email ?? resultado.email);
  const perfilOriginal = texto(cliente.perfil ?? resultado.perfil);
  const saldoBrl = numeroBR(cliente.saldo ?? resultado.saldo);
  const minimoBrl = numeroBR(investimento.minimo ?? resultado.aplicacao_minima_brl);
  return {
    requestId: envelope.requestId ?? resultado.requestId ?? null,
    linha: index + 1,
    totalClientes: resultados.length,
    nome: texto(cliente.nome ?? resultado.nome, 'Cliente'),
    email_original: emailOriginal,
    email: normalizarEmail(emailOriginal),
    email_valido: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarEmail(emailOriginal)),
    perfil_original: perfilOriginal || 'Não informado',
    perfil_normalizado: normalizarPerfil(perfilOriginal),
    saldo_brl: saldoBrl,
    saldo_formatado: moedaBR(saldoBrl),
    produto_catalogo: texto(investimento.produto ?? resultado.produto_catalogo, 'Sem opção selecionada'),
    aplicacao_minima_brl: minimoBrl,
    aplicacao_minima_formatada: moedaBR(minimoBrl),
    rentabilidade_catalogo: texto(investimento.rentabilidade ?? resultado.rentabilidade_catalogo, 'Não informada'),
    mensagem_base: texto(resultado.mensagem),
    aviso_educacional: texto(resultado.aviso),
  };
});

// O e-mail fica como metadado para a etapa seguinte, mas não é incluído no prompt enviado ao Groq.
return registros.map(registro => {
  const dadosParaMensagem = {
    linha: registro.linha,
    nome: registro.nome,
    perfil: registro.perfil_normalizado,
    saldo: registro.saldo_formatado,
    produto_catalogo: registro.produto_catalogo,
    aplicacao_minima: registro.aplicacao_minima_formatada,
    rentabilidade_catalogo: registro.rentabilidade_catalogo,
    mensagem_base: registro.mensagem_base,
    aviso_educacional: registro.aviso_educacional,
  };
  const promptLLM = [
    'Gere uma mensagem curta e natural em português do Brasil para este único cliente.',
    'Use exclusivamente os dados abaixo; não invente valores, produtos ou rentabilidades.',
    'Não prometa retorno nem faça recomendação individual de investimento.',
    'Preserve o aviso educacional. Retorne somente JSON válido, sem Markdown, no formato {"mensagem":"texto da mensagem"}.',
    '',
    'Dados do cliente (JSON):',
    JSON.stringify(dadosParaMensagem, null, 2),
  ].join('\n');
  return { json: { ...registro, promptLLM } };
});
