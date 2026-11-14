/** Mantém títulos automáticos dentro do mesmo limite do cadastro e edição.
 * O período é mais importante que o nome (já disponível no entregável).
 * Não altera títulos antigos; apenas novas ocorrências geradas.
 */
export function tituloOcorrenciaRecorrente(nomeEntregavel: string, descricaoPeriodo: string): string {
  const limite = 50;
  const periodo = descricaoPeriodo.trim();
  const sufixo = ` - ${periodo}`;
  if (sufixo.length >= limite) return periodo.slice(0, limite);
  // Não exibir fragmentos sem sentido do nome quando só restam poucos caracteres.
  if (limite - sufixo.length < 10) return periodo.slice(0, limite);
  const prefixo = nomeEntregavel.trim().slice(0, limite - sufixo.length).trimEnd();
  return prefixo ? `${prefixo}${sufixo}` : periodo.slice(0, limite);
}
