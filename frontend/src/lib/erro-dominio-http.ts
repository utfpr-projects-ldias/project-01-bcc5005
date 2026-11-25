/** Exibe mensagens curtas de regras de negócio, nunca detalhes técnicos da API. */
export async function mensagemErroDominioHttp(resposta: Response, padrao: string): Promise<string> {
  let dados: unknown;
  try { dados = await resposta.json(); } catch { return padrao; }
  if (!dados || typeof dados !== 'object' || !('message' in dados)) return padrao;
  const mensagem = (dados as { message?: unknown }).message;
  const texto = typeof mensagem === 'string' ? mensagem : Array.isArray(mensagem) &&
    mensagem.every(item => typeof item === 'string') ? mensagem.join(' ') : '';
  const limpo = texto.trim();
  if (!limpo || limpo.length > 240 || /[<>\r\n]/.test(limpo) ||
      /\b(sql|select|insert|update|delete|stack|postgres|typeorm|constraint|query|password)\b|\/\w+\/src\/| at \w+\s*\(/i.test(limpo))
    return padrao;
  return limpo;
}
