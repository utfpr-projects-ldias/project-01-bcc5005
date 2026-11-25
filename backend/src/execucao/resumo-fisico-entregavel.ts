import { entregaveisComInicio } from './inicio-operacional.js';
import { quantidadeDiretaEvidencias } from '../entregaveis/quantidade-evidencias.js';
import { BadRequestException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { Entregavel } from '../entregaveis/entregavel.entity.js';
import type { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import type { ConfiguracaoOcorrencias } from '../ocorrencias/configuracao-ocorrencias.entity.js';
import { percentualComParcelas } from './parcelas-execucao.js';
import { medicaoAprovadaAtual, medicaoReconhecidaAtual, resumoMedicao } from '../ocorrencias/medicao-ocorrencia.js';
import { calcularPeriodosRecorrentes } from '../ocorrencias/ocorrencias.service.js';
import { avaliarAgendaRecorrente, avaliarPesosAgenda } from '../ocorrencias/avaliar-agenda-recorrente.js';
import { calcularFisico } from './motor-progresso.js';
import { estadoOperacionalEntregavel, estadoOcorrenciaReconhecida, indicadoresPrazoEntregavel } from '../entregaveis/estado-operacional-entregavel.js';
const numero = (v: string | null | undefined) => v == null ? null : Number(v);
const decimal = (valores: string[]) => {
  const soma = valores.reduce((s, v) => { const [i, f = ''] = v.split('.'); return s + BigInt(i) * 1000n + BigInt(f.padEnd(3, '0')); }, 0n);
  return `${soma / 1000n}.${String(soma % 1000n).padStart(3, '0')}`;
};
/** Fonte única da projeção física e operacional para consultas de entregável e contrato. */
export async function resumirFisicoEntregavel(m: EntityManager, e: Entregavel, ocorrencias: Ocorrencia[], configuracao?: ConfiguracaoOcorrencias) {
  ocorrencias = ocorrencias.filter(o => !o.substituidaEm);
  let previsto: string | null = e.quantidadePrevista;
  let realizado: string | null = e.quantidadeRealizada ?? (e.tipo === 'QUANTITATIVO' ? '0' : null);
  let fonte = 'DECLARADO';
  let periodos: number | null = null;
  let percentualPonderadoSerie: number | null = null;
  let pesosSerieIncompletos = false;
  // Registros descritivos não têm medida física: não substituem a quantidade
  // declarada nem transformam a situação documental em avanço de unidades.
  const ocorrenciasMedidas = ocorrencias.filter(o => o.origem === 'MANUAL_QUANTITATIVA' && o.modoRegistro !== 'DESCRITIVO');
  if (e.tipo === 'QUANTITATIVO' && ocorrenciasMedidas.length) {
    // Ocorrências medidas detalham a mesma realização, nunca somar o total declarado novamente.
    const medidas = await Promise.all(ocorrenciasMedidas.map(o => medicaoReconhecidaAtual(m, o)));
    const quantidades = medidas.filter((r): r is string => r != null);
    realizado = quantidades.length ? decimal(quantidades) : '0';
    fonte = e.quantidadeRealizada != null && Number(e.quantidadeRealizada) !== 0 ? 'CONFLITO_QUANTIDADE' : 'OCORRENCIAS';
    if (fonte === 'CONFLITO_QUANTIDADE') realizado = null;
  }
  if(e.tipo==='QUANTITATIVO' && e.quantidadeDiretaIntegrada){ const r=await quantidadeDiretaEvidencias(m,e); realizado=ocorrencias.length||Number(e.quantidadeRealizada??0)!==0?null:r?.reconhecida??'0'; fonte=realizado===null?'CONFLITO_QUANTIDADE':'EVIDENCIAS_DIRETAS'; }
  if (e.tipo === 'RECORRENTE') {
    fonte = 'AGENDA';
    // O entregável mantém os limites contratuais; a configuração de agenda
    // controla a grade corrente. Aprovados históricos não são reescritos.
    const inicio = e.agendaInicioFuturo ?? e.inicioPrevisto;
    const fim = e.agendaInicioFuturo ? (configuracao?.terminoPrevisto ?? e.terminoPrevisto) : e.terminoPrevisto;
    if (inicio && fim && e.periodicidade) {
      try {
        const grade = calcularPeriodosRecorrentes(inicio, fim, e.periodicidade);
        const agendaFisica = await Promise.all(ocorrencias.map(async o => (await medicaoAprovadaAtual(m, o)).apta ? o : {...o, status: 'EM_REVISAO' as Ocorrencia['status']}));
        const gradeAvaliada = avaliarAgendaRecorrente(agendaFisica, grade, inicio);
        if (gradeAvaliada.completa || !ocorrencias.length) {
          periodos = gradeAvaliada.total;
          realizado = String(gradeAvaliada.concluidas);
          const pesos = avaliarPesosAgenda(agendaFisica);
          percentualPonderadoSerie = pesos.percentual;
          pesosSerieIncompletos = !pesos.validos;
        } else realizado = null;
      } catch (erro) { if (!(erro instanceof BadRequestException)) throw erro; /* Grade civil inválida: não publicar percentual aproximado. */ }
    }
    previsto = periodos == null ? null : String(periodos);
  }
  const percentualManual = await percentualComParcelas(m,e);
  const semExecucaoInicial = ((!ocorrencias.length || e.tipo === 'CONTINUO') && !e.execucoesIntegradas && e.percentualExecucao == null && e.quantidadeRealizada == null && e.dataEfetivaMarco == null && (!e.statusExecucao || e.statusExecucao === 'NAO_INICIADO')) || (e.tipo === 'CONTINUO' && percentualManual == null && !e.execucoesIntegradas && e.statusExecucao === 'EM_ANDAMENTO');
  const percentual = (e.tipo === 'UNICO' && percentualManual == null && ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? '')) ? null : calcularFisico({ tipo: e.tipo, percentualManual, quantidadePrevista: numero(previsto), quantidadeRealizada: numero(realizado), ocorrenciasPrevistas: periodos, ocorrenciasConcluidas: numero(realizado), dataEfetivaMarco: e.tipo === 'MARCO' && ['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(e.statusExecucao ?? '') ? e.dataEfetivaMarco : null });
  const percentualCalculado = semExecucaoInicial && percentual == null ? 0 : e.tipo==='RECORRENTE'
    ? pesosSerieIncompletos ? null : percentualPonderadoSerie ?? percentual
    : percentual;
  if (pesosSerieIncompletos) fonte='PESOS_SERIE_INCOMPLETOS';
  let statusEntregavel = estadoOperacionalEntregavel(e, percentualCalculado, ocorrencias);
  if (statusEntregavel === 'NAO_INICIADO' && !e.arquivadoEm && !e.reabertoEm) {
    const candidatas = ocorrencias.filter(o => !o.substituidaEm && o.status === 'NAO_INICIADO' && (o.execucoesPercentuais || o.metaQuantidade != null));
    const estados = await Promise.all(candidatas.map(async o => ({...o,status:estadoOcorrenciaReconhecida(o,await resumoMedicao(m,o))})));
    statusEntregavel = estadoOperacionalEntregavel(e, percentualCalculado, estados);
  }
  if(statusEntregavel==='NAO_INICIADO'&&!e.arquivadoEm&&!e.reabertoEm&&(await entregaveisComInicio(m,e.contratoId,e.etapaId,e.id)).has(e.id))statusEntregavel=estadoOperacionalEntregavel({...e,statusExecucao:'EM_ANDAMENTO' as Entregavel['statusExecucao']},percentualCalculado,ocorrencias);
  return { previsto, realizado, fonte, percentualCalculado, statusEntregavel, ...indicadoresPrazoEntregavel(e, statusEntregavel) };
}
