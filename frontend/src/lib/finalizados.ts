/** Agrupamento de interface; NÃO altera estados persistidos nem confunde execução com verificação. */
export type RecursoFinalizado = 'contrato' | 'etapa' | 'entregavel' | 'ocorrencia' | 'atividade' | 'evidencia';
export type ResultadoFinalizacao = 'concluido' | 'encerrado' | null;
const CONCLUIDOS: Record<RecursoFinalizado, string> = {
  contrato: 'CONCLUIDO', etapa: 'CONCLUIDA', entregavel: 'CONCLUIDO',
  ocorrencia: 'CONCLUIDO', atividade: 'VERIFICADA', evidencia: 'VERIFICADA',
};
const ENCERRADOS: Partial<Record<RecursoFinalizado, readonly string[]>> = {
  contrato: ['FINALIZADO', 'ENCERRADO'], etapa: ['FINALIZADA', 'ENCERRADA'],
  entregavel: ['FINALIZADO'], ocorrencia: ['ENCERRADA'],
};
/** Arquivado não é sinônimo de encerrado. Para atividades/evidências, o estado verificado é o único terminal operacional. */
export function resultadoFinalizacao(recurso: RecursoFinalizado, status: string | null | undefined): ResultadoFinalizacao {
  if (status === CONCLUIDOS[recurso]) return 'concluido';
  if (status && ENCERRADOS[recurso]?.includes(status)) return 'encerrado';
  return null;
}
/** O termo "Finalizados" é reservado à aba, não substitui a situação efetiva dos registros. */
export function etiquetaFinalizacao(recurso: RecursoFinalizado, status: string | null | undefined): string | null {
  const resultado = resultadoFinalizacao(recurso, status);
  if (!resultado) return null;
  if (resultado === 'concluido') {
    return recurso === 'atividade' || recurso === 'evidencia' ? 'Verificada' :
      recurso === 'etapa' || recurso === 'ocorrencia' ? 'Concluída' : 'Concluído';
  }
  return recurso === 'etapa' || recurso === 'ocorrencia' || recurso === 'evidencia' || recurso === 'atividade'
    ? 'Encerrada' : 'Encerrado';
}
