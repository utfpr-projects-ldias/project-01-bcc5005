import { quantidadeDiretaEvidencias } from './quantidade-evidencias.js';
import { percentualComParcelas, resumoParcelas } from '../execucao/parcelas-execucao.js';
import { medicaoAprovadaAtual, medicaoReconhecidaAtual } from '../ocorrencias/medicao-ocorrencia.js';
import { avaliarMetasMarco } from '../metas-marco/metas-marco-gate.js';
import { IsNull, type EntityManager } from 'typeorm';
import { Entregavel } from './entregavel.entity.js';
import { TipoEntregavel } from './tipo-entregavel.enum.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { calcularFisico } from '../execucao/motor-progresso.js';
import { calcularPeriodosRecorrentes } from '../ocorrencias/ocorrencias.service.js';
import { avaliarAgendaRecorrente, avaliarPesosAgenda } from '../ocorrencias/avaliar-agenda-recorrente.js';
import { ConfiguracaoOcorrencias } from '../ocorrencias/configuracao-ocorrencias.entity.js';
import { hojeCivil } from '../common/data-civil.js';

/** Gate compartilhado pelos caminhos explícito e automáticos de conclusão.
 * Não presume que comprovação documental implique execução física de 100%.
 * Registros históricos substituídos permanecem auditáveis, mas não contam.
 */
export async function aptidaoFisicaParaConclusao(
  m: EntityManager, e: Entregavel,
): Promise<{ apto: boolean; percentual: number | null; motivo: string }> {
  const negar = (motivo: string) => ({ apto: false, percentual: null, motivo });
  const atuais = await m.findBy(Ocorrencia, {
    contratoId: e.contratoId, entregavelId: e.id, substituidaEm: IsNull(),
  });
  if (e.execucoesIntegradas) {
    const parcelas = await resumoParcelas(m,e);
    if (parcelas.itens.some(i => i.situacao === 'PENDENTE' && !i.referenciaId && i.centesimos > 0))
      return negar('Resolva os lançamentos de execução pendentes antes de concluir');
  }
  const metas = e.tipo === TipoEntregavel.MARCO ? await avaliarMetasMarco(m, e.contratoId, e.id) : null;
  // RB-03: em ÚNICO a ocorrência é opcional; se existir, precisa estar concluída.
  if ((e.tipo === TipoEntregavel.RECORRENTE || (e.tipo === TipoEntregavel.MARCO && !metas?.total)) && !atuais.length)
    return negar('Este tipo de entregável exige ocorrências aprovadas');
  if (metas?.total && !metas.apto) return negar('Aprove todos os vínculos exigidos nas metas do Marco');
  if ((e.tipo === TipoEntregavel.CONTINUO && atuais.length > 1) || (e.tipo === TipoEntregavel.MARCO && !metas?.total && atuais.length !== 1))
    return negar('Este tipo de entregável exige uma ocorrência principal');
  if (!(e.tipo === TipoEntregavel.MARCO && metas?.total) && atuais.some(o => !['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(o.status)))
    return negar('Conclua todas as ocorrências ativas do entregável; encerramentos administrativos não contam como execução');
  if (e.tipo === TipoEntregavel.CONTINUO && e.terminoPrevisto &&
      hojeCivil() < e.terminoPrevisto)
    return negar('A conclusão da obrigação contínua somente pode ser solicitada após o término previsto');

  const atuaisMedidos = await Promise.all(atuais.map(o => medicaoAprovadaAtual(m, o)));
  if (!(e.tipo === TipoEntregavel.MARCO && metas?.total) && atuais.some((o,i) => (o.modoRegistro === 'DESCRITIVO' || o.metaQuantidade != null || o.execucoesPercentuais) && !atuaisMedidos[i].apta))
    return negar('A medição aprovada deixou de atender aos critérios físicos. Regularize a ocorrência.');
  let percentual: number | null;
  if (e.tipo === TipoEntregavel.RECORRENTE) {
    if (!e.inicioPrevisto || !e.terminoPrevisto || !e.periodicidade || !atuais.length)
      return negar('Gere e aprove a agenda recorrente antes de concluir');
    const inicioAgenda = e.agendaInicioFuturo ?? e.inicioPrevisto;
    const configuracao = await m.findOneBy(ConfiguracaoOcorrencias, { entregavelId: e.id, contratoId: e.contratoId });
    const fimAgenda = e.agendaInicioFuturo ? configuracao?.terminoPrevisto ?? e.terminoPrevisto : e.terminoPrevisto;
    if (!inicioAgenda || !fimAgenda) return negar('Agenda recorrente sem período definido');
    let periodos: ReturnType<typeof calcularPeriodosRecorrentes>;
    try { periodos = calcularPeriodosRecorrentes(inicioAgenda, fimAgenda, e.periodicidade); }
    catch { return negar('Regularize os períodos da agenda antes de concluir'); }
    const analise = avaliarAgendaRecorrente(atuais, periodos, inicioAgenda);
    if (!analise.completa) return negar('Agenda recorrente incompleta; regularize os períodos');
    const pesos = avaliarPesosAgenda(atuais);
    if (!pesos.validos) return negar('Regularize os pesos dos períodos antes de concluir');
    percentual = pesos.percentual ?? calcularFisico({ tipo: 'RECORRENTE', ocorrenciasPrevistas: analise.total,
      ocorrenciasConcluidas: analise.concluidas });
  } else if (e.tipo === TipoEntregavel.QUANTITATIVO) {
    const medidas = atuais.filter(o => o.origem === 'MANUAL_QUANTITATIVA' && o.modoRegistro !== 'DESCRITIVO');
    if (medidas.length && e.quantidadeRealizada != null && Number(e.quantidadeRealizada) !== 0)
      return negar('Concilie a quantidade informada diretamente com os registros das ocorrências');
    if (!medidas.length && (e.quantidadeRealizada != null && Number(e.quantidadeRealizada) < 0))
      return negar('Registre a execução quantitativa diretamente ou por ocorrências aprovadas');
    const direta=await quantidadeDiretaEvidencias(m,e);
    if(direta && (atuais.length || Number(e.quantidadeRealizada??0)!==0 || direta.pendentes))return negar('Resolva as medições diretas pendentes ou conflitantes antes de concluir.');
    const realizada = direta ? Number(direta.reconhecida) : medidas.length
      ? (await Promise.all(medidas.map(o => medicaoReconhecidaAtual(m,o)))).reduce((n,q) => n + Number(q ?? 0),0)
      : e.quantidadeRealizada == null ? null : Number(e.quantidadeRealizada);
    percentual = calcularFisico({ tipo: 'QUANTITATIVO', quantidadeRealizada: realizada,
      quantidadePrevista: e.quantidadePrevista == null ? null : Number(e.quantidadePrevista) });
  } else if (e.tipo === TipoEntregavel.MARCO && metas?.total && metas.apto) {
    // O preparo completo autoriza solicitar conclusão, mas o progresso oficial
    // permanece 0% até a aprovação registrar a data efetiva do Marco.
    percentual = 100;
  } else {
    percentual = calcularFisico({ tipo: e.tipo,
      percentualManual: await percentualComParcelas(m,e),
      dataEfetivaMarco: e.dataEfetivaMarco });
  }
  return { apto: percentual !== null && percentual >= 100, percentual,
    motivo: percentual === null || percentual < 100 ? 'Registre 100% da execução física antes de concluir' : '' };
}
