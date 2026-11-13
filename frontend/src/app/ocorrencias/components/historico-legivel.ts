/** Traduz snapshots técnicos sem alterar o evento persistido. */
const NOMES: Record<string,string> = {
  status:'Situação',titulo:'Título',observacoes:'Observações',dataPrevista:'Prazo',dataRealizada:'Data da execução',
  periodoInicio:'Início do período',periodoFim:'Fim do período',exigeAtividade:'Exige atividade',
  minimoAtividadesVerificadas:'Atividades verificadas exigidas',minimoEvidenciasVerificadas:'Evidências verificadas exigidas',
  metaQuantidade:'Meta quantitativa',quantidadeRealizada:'Quantidade realizada',quantidadeAprovada:'Quantidade aprovada',
  evidenciaExigida:'Formato da evidência',permiteEncerramentoExcepcional:'Encerramento excepcional permitido',
  comprovanteId:'Comprovante',atividadeId:'Atividade',motivo:'Justificativa',justificativa:'Justificativa',
  quantidade:'Quantidade',operacao:'Operação',solicitadoPor:'Solicitado por',aprovadoPor:'Aprovado por',
};
const SITUACOES:Record<string,string> = {NAO_INICIADO:'Não iniciada',EM_ANDAMENTO:'Em andamento',
  EM_REVISAO:'Em revisão',PENDENTE_CONCLUSAO:'Pendente de conclusão',PENDENTE_ENCERRAMENTO:'Pendente de encerramento',
  CONCLUIDO:'Concluída',ENCERRADA:'Encerrada',FOTO:'Fotografia',RELATORIO:'Relatório',AMBOS:'Fotografia e relatório',
  NENHUMA:'Nenhuma',VINCULAR_EVIDENCIA:'Vincular evidência',DESVINCULAR_EVIDENCIA:'Desvincular evidência'};
export const nomeCampoOcorrencia=(chave:string)=>NOMES[chave] ?? chave.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
export function valorLegivel(valor:unknown):string {
  if(valor===null||valor===undefined||valor==='')return 'Não informado';
  if(typeof valor==='boolean')return valor?'Sim':'Não';
  if(typeof valor==='number')return String(valor);
  if(typeof valor==='string')return SITUACOES[valor]??valor;
  if(Array.isArray(valor))return valor.map(valorLegivel).join(', ');
  return 'Dados estruturados (veja detalhes técnicos)';
}
export type AlteracaoLegivel={campo:string;antes:string;depois:string};
export function alteracoesLegiveis(antes:Record<string,unknown>|null,depois:Record<string,unknown>|null):AlteracaoLegivel[]{
  const anterior=antes??{},posterior=depois??{};
  return [...new Set([...Object.keys(anterior),...Object.keys(posterior)])]
    .filter(chave=>JSON.stringify(anterior[chave]??null)!==JSON.stringify(posterior[chave]??null))
    .map(chave=>({campo:nomeCampoOcorrencia(chave),antes:valorLegivel(anterior[chave]),depois:valorLegivel(posterior[chave])}));
}
export const rotuloEventoOcorrencia=(evento:string)=>({
  OCORRENCIA_CRIADA:'Ocorrência cadastrada',OCORRENCIA_EDITADA:'Ocorrência alterada',
  OCORRENCIA_STATUS_ALTERADO:'Situação da ocorrência alterada',
  OCORRENCIA_REABERTA:'Ocorrência reaberta',OCORRENCIA_CONCLUIDA:'Ocorrência concluída',
} as Record<string,string>)[evento]??evento.toLowerCase().split('_').map((p,i)=>i===0?p.charAt(0).toUpperCase()+p.slice(1):p).join(' ');
