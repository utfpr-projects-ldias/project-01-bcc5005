/** Identidade do registro para apresentação, sem alterar os estados contábeis da API. */
export function situacaoRegistro(origem: string, situacao: string, origemSituacao?: string | null): string {
  if (situacao === 'LEGADO') return 'Reconhecido';
  if (situacao === 'INATIVO') {
    if (origemSituacao === 'ARQUIVADO' || origemSituacao === 'ARQUIVADA') return 'Arquivado';
    if (origemSituacao === 'EXCLUIDO') return 'Excluído';
    if (origemSituacao === 'SUBSTITUIDO') return 'Substituído';
    return 'Sem efeito';
  }
  if (['REJEITADO','REJEITADA','EM_REVISAO'].includes(situacao) || origemSituacao === 'EM_REVISAO') return 'Em revisão';
  if (situacao === 'APROVADO') return origem === 'OCORRENCIA' ? 'Concluída' : origem === 'MANUAL' ? 'Aprovado' : 'Verificada';
  if (situacao === 'PENDENTE') {
    if (origem === 'EVIDENCIA') return 'Pendente de verificação';
    if (origem === 'ATIVIDADE' && origemSituacao === 'REGISTRADA') return 'Registrada';
    if (origem === 'ATIVIDADE' && origemSituacao === 'PENDENTE_CONCLUSAO') return 'Pendente de conclusão';
    return 'Pendente de aprovação';
  }
  return ({ARQUIVADO:'Arquivado',ARQUIVADA:'Arquivado',CONCLUIDO:'Concluída',CONCLUIDA:'Concluída',CONCLUIDO_PARCIALMENTE:'Concluída parcialmente',PENDENTE_CONCLUSAO:'Pendente de conclusão',PENDENTE_CONCLUSAO_PARCIAL:'Pendente de conclusão parcial',PENDENTE_ENCERRAMENTO:'Pendente de encerramento',ENCERRADO:'Encerrada',ENCERRADA:'Encerrada',NAO_INICIADO:'Não iniciada',EM_ANDAMENTO:'Em andamento',REGISTRADA:'Registrada',VERIFICADA:'Verificada',PENDENTE_VERIFICACAO:'Pendente de verificação'} as Record<string,string>)[situacao] ?? 'Situação não informada';
}
export function opcoesSituacaoRegistros(registros: readonly {origem:string;situacao:string;situacaoRegistro?:string|null}[]): string[] {
  return [...new Set(registros.map(r=>situacaoRegistro(r.origem,r.situacao,r.situacaoRegistro)))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
