// Code node: Montar mensagens (após Merge)
// Responsabilidade: consumir o payload original + tabelaCruzada e montar a resposta.
const merged = $input.first()?.json ?? {};
const payload = merged.body ?? merged;
const clientes = payload.clientes;
const tabela = merged.tabelaCruzada;
if (!Array.isArray(clientes)) {
  throw new Error('O Merge deve preservar o payload original em body.clientes[].');
}
if (!Array.isArray(tabela)) {
  throw new Error('O Merge deve entregar a tabelaCruzada do nó Cruzar perfis.');
}

function normalize(value) {
  return String(value ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}
function moeda(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
  }).format(value);
}
const templates = {
  conservador: 'Seu perfil prioriza previsibilidade e preservação do capital. Compare opções, liquidez e riscos antes de decidir.',
  moderado: 'Seu perfil busca equilíbrio entre previsibilidade e potencial de crescimento. Compare composição, riscos e prazos.',
  arrojado: 'Seu perfil aceita maior oscilação em busca de potencial de crescimento. Diversificação e entendimento dos riscos continuam essenciais.',
};

const resultados = clientes.map((cliente, clienteIndex) => {
  const perfilKey = normalize(cliente.perfil);
  const template = templates[perfilKey];
  if (!template) {
    throw new Error(`Perfil inválido para o cliente ${clienteIndex + 1}: ${cliente.perfil}`);
  }
  const linhasCliente = tabela.filter(row => row.clienteIndex === clienteIndex);
  const elegiveis = linhasCliente
    .filter(row => row.elegivelPorSaldo && row.produto)
    .sort((a, b) => b.minimo - a.minimo);
  const investimento = elegiveis[0] ?? null;
  const saldo = linhasCliente[0]?.saldoNumerico ?? 0;
  const detalhe = investimento
    ? `Uma opção do catálogo para explorar é ${investimento.produto} (aplicação mínima: ${moeda(investimento.minimo)}; rentabilidade indicada no CSV: ${investimento.rentabilidade}).`
    : 'Não há opção do catálogo com aplicação mínima igual ou inferior ao saldo informado; nenhuma opção foi selecionada.';
  const nome = String(cliente.nome ?? 'cliente').trim();
  return {
    cliente: {
      nome,
      email: cliente.email ?? '',
      saldo: cliente.saldo ?? '',
      perfil: cliente.perfil,
    },
    investimento,
    mensagem: `Olá, ${nome}! ${template} ${detalhe} Saldo informado: ${moeda(saldo)}.`,
    aviso: 'Demonstração educacional com dados fictícios. Não constitui recomendação individual de investimento; rentabilidade passada ou estimada não garante retorno.',
  };
});

return [{
  json: {
    requestId: merged.requestId ?? payload.requestId ?? null,
    totalClientes: resultados.length,
    resultados,
  },
}];
