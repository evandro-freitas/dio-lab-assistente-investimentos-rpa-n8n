// Code node: Code - Normalizar saída LLM
// Run Once for All Items. Junta cada resposta do LLM ao item/email correspondente
// do node anterior e devolve um único envelope com resultados por destinatário.
const respostasLLM = $input.all().map(item => item.json ?? {});
const itensPreparados = $('code normalizar para llm').all().map(item => item.json ?? {});
if (respostasLLM.length === 0) throw new Error('O LLM não retornou itens.');
if (respostasLLM.length !== itensPreparados.length) {
  throw new Error(`Quantidade de respostas do LLM (${respostasLLM.length}) diferente da quantidade de destinatários (${itensPreparados.length}). Verifique se o Basic LLM Chain processa cada item de entrada.`);
}

function extrairTexto(item) {
  for (const key of ['text', 'output', 'response', 'answer', 'content']) {
    if (typeof item[key] === 'string' && item[key].trim()) return item[key].trim();
  }
  const generation = item.generations?.[0]?.[0]?.text;
  if (typeof generation === 'string' && generation.trim()) return generation.trim();
  if (typeof item === 'string') return item.trim();
  return JSON.stringify(item);
}
function interpretarResposta(raw) {
  const semMarkdown = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(semMarkdown);
    if (typeof parsed === 'string') return { mensagem: parsed, parseOk: true };
    const mensagem = parsed.mensagem ?? parsed.message ?? parsed.text;
    if (typeof mensagem === 'string' && mensagem.trim()) {
      return { mensagem: mensagem.trim(), parseOk: true };
    }
    const primeira = parsed.mensagens?.[0]?.mensagem ?? parsed.mensagens?.[0]?.message;
    if (typeof primeira === 'string' && primeira.trim()) {
      return { mensagem: primeira.trim(), parseOk: true };
    }
  } catch (_) {
    // Alguns modelos devolvem texto simples mesmo quando o prompt pede JSON.
  }
  return { mensagem: semMarkdown, parseOk: false };
}

const resultados = respostasLLM.map((resposta, index) => {
  const preparado = itensPreparados[index];
  const bruto = extrairTexto(resposta);
  const interpretado = interpretarResposta(bruto);
  const { promptLLM, ...dadosCliente } = preparado;
  return {
    ...dadosCliente,
    mensagem_llm: interpretado.mensagem,
    resposta_llm_em_json: interpretado.parseOk,
  };
});

return [{
  json: {
    requestId: itensPreparados[0]?.requestId ?? null,
    totalClientes: resultados.length,
    resultados,
  },
}];
