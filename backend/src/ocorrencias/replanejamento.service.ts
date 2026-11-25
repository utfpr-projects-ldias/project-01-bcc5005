import { FASES_OPERACIONAIS_CONTRATO } from '../contratos/fases-operacionais.js';
import { tituloOcorrenciaRecorrente } from './titulo-recorrente.js';
import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Contrato } from '../contratos/contrato.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { AtividadeEntity } from '../atividades/atividade.entity.js';
import { Ocorrencia } from './ocorrencia.entity.js';
import { ConfiguracaoOcorrencias } from './configuracao-ocorrencias.entity.js';
import { calcularPeriodosRecorrentes } from './ocorrencias.service.js';
import { OrigemOcorrencia } from './origem-ocorrencia.enum.js';
import { StatusOcorrencia } from './status-ocorrencia.enum.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { exigirPermissaoTransacional } from '../autorizacao/permissao-transacional.js';
import { avaliarAgendaRecorrente } from './avaliar-agenda-recorrente.js';
import { milesimos } from '../common/quantidade-exata.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import type { ReplanejarOcorrenciasDto } from './dto/replanejar-ocorrencias.dto.js';
import { hojeCivil } from '../common/data-civil.js';
export { hojeCivil } from '../common/data-civil.js';

const chave = (i: string | null, f: string | null) => `${i}/${f}`;
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** Concilia a agenda futura sem apagar o histórico nem reativar versões arquivadas.
 * O período concluído é preservado no seu intervalo original; somente um
 * intervalo exatamente igual pode representar a mesma obrigação.
 * Um período não pode contar mais de uma vez no cálculo físico.
 */
export function planoDeRevisao(ocorrencias: Ocorrencia[], vinculadas: Set<string>, dto: ReplanejarOcorrenciasDto, hoje: string) {
  if (dto.inicioFuturo < hoje)
    throw new ConflictException('O replanejamento deve começar no dia civil atual ou em data futura; o histórico anterior permanece preservado');
  const periodos = calcularPeriodosRecorrentes(dto.inicioFuturo, dto.terminoPrevisto, dto.periodicidade);
  const ativas = ocorrencias.filter(o => !o.substituidaEm);
  const anteriores = ativas.filter(o => o.periodoFim && o.periodoFim < dto.inicioFuturo);
  const futuras = ativas.filter(o => !anteriores.includes(o));
  const concluidas = futuras.filter(o => [StatusOcorrencia.CONCLUIDO,StatusOcorrencia.CONCLUIDO_PARCIALMENTE].includes(o.status));
  const corresponde = (o: Ocorrencia, p: { inicio: string; fim: string }) =>
    Boolean(o.periodoInicio && o.periodoFim && o.periodoInicio <= p.fim && o.periodoFim >= p.inicio);
  const iguais = new Set(periodos.map(p => chave(p.inicio, p.fim)));
  const manter = futuras.filter(o => ![StatusOcorrencia.CONCLUIDO,StatusOcorrencia.CONCLUIDO_PARCIALMENTE].includes(o.status) && iguais.has(chave(o.periodoInicio, o.periodoFim)));
  const substituir = futuras.filter(o => ![StatusOcorrencia.CONCLUIDO,StatusOcorrencia.CONCLUIDO_PARCIALMENTE].includes(o.status) && !manter.includes(o));
  // Não desmembrar nem fundir períodos já concluídos: evita contá-los duas vezes,
  // ou registrar artificialmente uma conclusão sobre datas não executadas.
  for (const o of concluidas) {
    const cruzados = periodos.filter(p => corresponde(o, p));
    if (cruzados.length !== 1 || cruzados.some(p => chave(p.inicio,p.fim) !== chave(o.periodoInicio,o.periodoFim)))
      throw new ConflictException('Um período concluído intercepta a nova grade. Inicie a revisão após esse período ou preserve seu intervalo original.');
  }
  // Um período com início, lançamento ou atividade não pode desaparecer da
  // apuração física por substituição sem conciliação explícita.
  if (substituir.some(o => o.status !== StatusOcorrencia.NAO_INICIADO ||
      (o.periodoInicio != null && o.periodoInicio < hoje) || Boolean(o.observacoes?.trim()) ||
      o.dataRealizada != null || o.quantidadeRealizada != null || o.quantidadeAprovada != null || vinculadas.has(o.id)))
    throw new ConflictException('O replanejamento substituiria período iniciado, medido ou com atividade. Preserve esse período e reprograme apenas o futuro ainda sem execução.');
  // Uma conclusão histórica cobre, no máximo, um espaço da nova agenda.
  const cobertos = new Set<string>();
  for (const o of concluidas) {
    const p = periodos.find(p => !cobertos.has(chave(p.inicio, p.fim)) && corresponde(o, p));
    if (p) cobertos.add(chave(p.inicio, p.fim));
  }
  const novas = periodos.filter(p => !cobertos.has(chave(p.inicio, p.fim)) &&
    !manter.some(o => chave(o.periodoInicio,o.periodoFim) === chave(p.inicio,p.fim)));
  const proposta = [...ativas.filter(o=>!substituir.includes(o)), ...novas.map(p=>({periodoInicio:p.inicio,periodoFim:p.fim,status:StatusOcorrencia.NAO_INICIADO}))];
  if (!avaliarAgendaRecorrente(proposta,periodos,dto.inicioFuturo).completa)
    throw new ConflictException('A agenda resultante possui lacunas, sobreposições, períodos extras ou excede 500 períodos.');
  return {
    substituir, novas, reativar: [] as Ocorrencia[], preservadas: anteriores.length + concluidas.length + manter.length,
    total: anteriores.length + periodos.length,
  };
}
/** Redistribuição explícita na prévia: pesos em unidades de 0,0001%.
 * Preserva todos os períodos históricos/concluídos/inalterados; somente os
 * períodos novos recebem frações iguais do saldo. Nunca cria 700% acidentalmente.
 */
export function distribuirPesosFuturos(agenda: Ocorrencia[], plano: ReturnType<typeof planoDeRevisao>): Array<string | null> {
  const ativas = agenda.filter(o => !o.substituidaEm);
  if (!ativas.some(o => o.pesoPeriodo != null)) return plano.novas.map(() => null);
  if (ativas.some(o => o.pesoPeriodo == null))
    throw new ConflictException('A série possui pesos parciais. Regularize os pesos dos períodos antes de replanejar.');
  const unidades = (v:string | null) => Math.round(Number(v) * 10_000);
  const total = ativas.reduce((s,o)=>s + unidades(o.pesoPeriodo),0);
  if (total !== 1_000_000) throw new ConflictException('A série ponderada precisa totalizar 100% antes da revisão.');
  const fixas = ativas.filter(o => !plano.substituir.includes(o));
  const saldo = 1_000_000 - fixas.reduce((s,o)=>s+unidades(o.pesoPeriodo),0);
  if (saldo < 0 || (plano.novas.length === 0 && saldo !== 0))
    throw new ConflictException('Não há peso disponível para os novos períodos; revise a distribuição antes de alterar a agenda.');
  if (!plano.novas.length) return [];
  const base = Math.floor(saldo / plano.novas.length);
  const resto = saldo % plano.novas.length;
  return plano.novas.map((_p,i) => ((base + (i < resto ? 1 : 0)) / 10_000).toFixed(4));
}
@Injectable()
export class ReplanejamentoService {
  constructor(private readonly ds: DataSource, private readonly auditoria: AuditoriaService) {}
  async executar(contratoId: string, entregavelId: string, dto: ReplanejarOcorrenciasDto, ator: UsuarioAutenticado) {
    return this.ds.transaction(async m => {
      await exigirPermissaoTransacional(m,contratoId,ator,'configurarAgendaOcorrencias');
      if (dto.metaQuantidade != null) await exigirPermissaoTransacional(m,contratoId,ator,'editarMetaOcorrencia');
      const c = await m.findOne(Contrato, { where: { id: contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!c || c.arquivadoEm || c.conclusaoSolicitadaEm || c.encerramentoSolicitado || !FASES_OPERACIONAIS_CONTRATO.includes(c.status)) throw new ConflictException('Contrato bloqueado');
      const e = await m.findOne(Entregavel, { where: { id: entregavelId, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!e || e.tipo !== 'RECORRENTE' || e.arquivadoEm) throw new NotFoundException('Entregável recorrente não encontrado');
      const etapa = await m.findOneBy(Etapa, { id: e.etapaId, contratoId });
      if (!etapa || etapa.arquivadoEm || e.regularizacaoDocumentalSolicitada || etapa.conclusaoSolicitadaEm || etapa.encerramentoSolicitadoEm ||
          ['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(etapa.status) ||
          ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? '')) throw new ConflictException('Reabra a hierarquia antes de replanejar');
      const alteraPrazo = dto.terminoPrevisto !== e.terminoPrevisto;
      if (alteraPrazo) {
        if (!dto.alterarPrazo) throw new ConflictException('Confirme explicitamente a alteração do prazo da obrigação na prévia.');
        await exigirPermissaoTransacional(m,contratoId,ator,'editarEntregaveis');
      }
      if (!e.inicioPrevisto || !e.terminoPrevisto || dto.inicioFuturo < e.inicioPrevisto || dto.inicioFuturo > dto.terminoPrevisto ||
          dto.inicioFuturo < c.inicioVigencia || dto.terminoPrevisto > c.terminoVigencia)
        throw new BadRequestException('A revisão deve estar contida na vigência contratual e preservar o início da obrigação.');
      if (dto.unidadeMedida !== undefined && !dto.unidadeMedida?.trim())
        throw new BadRequestException('Unidade de medida não pode ficar vazia');
      if (dto.unidadeMedida !== undefined && dto.unidadeMedida.trim() !== (e.unidadeMedida ?? ''))
        throw new ConflictException('A unidade pertence ao entregável e não pode ser alterada no replanejamento de ocorrências.');
      const agenda = await m.find(Ocorrencia, { where: { entregavelId, contratoId, origem: OrigemOcorrencia.RECORRENTE }, order: { id: 'ASC' } });
      if (!agenda.some(o=>!o.substituidaEm)) throw new ConflictException('Gere a agenda inicial antes de replanejar');
      const atividades = await m.find(AtividadeEntity, { where: { contratoId }, select: { ocorrenciaId: true } });
      const associacoes = await m.query(`SELECT DISTINCT v."ocorrenciaId" AS id FROM "atividade_ocorrencias" v
        WHERE v."contratoId" = $1`, [contratoId]) as { id: string }[];
      const vinculadas = new Set([
        ...atividades.flatMap(a => a.ocorrenciaId ? [a.ocorrenciaId] : []),
        ...associacoes.map(v => v.id),
      ]);
      const hoje = hojeCivil();
      const plano = planoDeRevisao(agenda, vinculadas, dto, hoje);
      const grade = calcularPeriodosRecorrentes(dto.inicioFuturo,dto.terminoPrevisto,dto.periodicidade);
      const proposta = [...agenda.filter(o=>!o.substituidaEm&&!plano.substituir.includes(o)), ...plano.novas.map(p=>({periodoInicio:p.inicio,periodoFim:p.fim,status:StatusOcorrencia.NAO_INICIADO}))];
      if (!avaliarAgendaRecorrente(proposta,grade,dto.inicioFuturo,e.inicioPrevisto,dto.terminoPrevisto).completa)
        throw new ConflictException('A agenda resultante não cobre integralmente a vigência do entregável.');
      if (alteraPrazo && agenda.some(o => !o.substituidaEm && !plano.substituir.includes(o) && o.dataPrevista && o.dataPrevista > dto.terminoPrevisto))
        throw new ConflictException('O novo término deixaria um prazo de ocorrência preservada fora da obrigação. Regularize esse prazo antes da revisão.');
      // Série recorrente não tem modelo de exigências próprio: usar um dos períodos
      // ativos já planejados. Configurações diferentes no trecho alterado exigem
      // regularização antes de substituir; nunca afrouxar critérios silenciosamente.
      const criterios = (o: Ocorrencia) => ({
        exigeAtividade: o.exigeAtividade,
        minimoAtividadesVerificadas: o.minimoAtividadesVerificadas,
        evidenciaExigida: o.evidenciaExigida,
        minimoEvidenciasVerificadas: o.minimoEvidenciasVerificadas,
        minimoFotos: o.minimoFotos, minimoRelatorios: o.minimoRelatorios,
        minimoEvidenciasLivres: o.minimoEvidenciasLivres,
        permiteEncerramentoExcepcional: o.permiteEncerramentoExcepcional,
      });
      const ativas = agenda.filter(o => !o.substituidaEm).sort((a,b) =>
        (a.periodoInicio ?? '').localeCompare(b.periodoInicio ?? ''));
      const fonte = ativas.find(o => (o.periodoFim ?? '') >= dto.inicioFuturo) ?? ativas.at(-1);
      if (!fonte) throw new ConflictException('Não há período ativo para herdar as exigências da agenda');
      const criteriosHerdados = criterios(fonte);
      // Ao trocar a quantidade de períodos, não copiar o mesmo peso para cada
      // novo item. A prévia informa a redistribuição; o token confirma os pesos.
      const pesosNovos = distribuirPesosFuturos(agenda, plano);
      if (pesosNovos.some(p=>p!=null) || plano.substituir.some(o=>o.pesoPeriodo!=null))
        await exigirPermissaoTransacional(m,contratoId,ator,'editarPesoOcorrencia');
      const modoRegistro = dto.modoRegistro ?? fonte.modoRegistro ?? 'DESCRITIVO';
      if (modoRegistro !== (e.configuracaoPeriodicidade?.modoRegistro ?? fonte.modoRegistro ?? 'DESCRITIVO')) throw new ConflictException('A modalidade é definida no planejamento do entregável recorrente.');
      const metaQuantidade = modoRegistro === 'QUANTITATIVO'
        ? dto.metaQuantidade ?? (fonte.modoRegistro === 'QUANTITATIVO' ? fonte.metaQuantidade : null)
        : null;
      if (modoRegistro === 'QUANTITATIVO' && (!metaQuantidade || !/^\d{1,15}(?:\.\d{1,3})?$/.test(metaQuantidade) || milesimos(metaQuantidade)<=0n))
        throw new BadRequestException('Replanejamento quantitativo exige meta positiva, informada ou herdada da série.');
      if (modoRegistro === 'DESCRITIVO' && dto.metaQuantidade != null)
        throw new BadRequestException('Registro descritivo não aceita meta quantitativa.');
      if (modoRegistro === 'QUANTITATIVO' && !(dto.unidadeMedida ?? e.unidadeMedida ?? '').trim())
        throw new BadRequestException('A ocorrência quantitativa exige unidade de medida');
      // Períodos idênticos são preservados: uma nova meta enviada pela prévia
      // não pode ser silenciosamente ignorada nesses registros.
      const mantidas = ativas.filter(o => !plano.substituir.includes(o) && (o.periodoFim ?? '') >= dto.inicioFuturo && (o.periodoInicio ?? '') <= dto.terminoPrevisto);
      if (dto.metaQuantidade != null && mantidas.some(o=>milesimos(o.metaQuantidade)!==milesimos(dto.metaQuantidade)))
        throw new ConflictException('A nova meta não altera períodos preservados. Edite a meta individualmente antes de replanejar.');
      const afetadas = plano.substituir.filter(o => o.origem === OrigemOcorrencia.RECORRENTE);
      if (afetadas.some(o=>(o.modoRegistro ?? 'DESCRITIVO')!==modoRegistro))
        throw new ConflictException('A revisão não pode alterar a modalidade dos períodos existentes. Regularize o planejamento.');
      if (modoRegistro==='QUANTITATIVO' && dto.metaQuantidade==null && afetadas.some(o=>milesimos(o.metaQuantidade)!==milesimos(metaQuantidade)))
        throw new ConflictException('Os períodos afetados possuem metas diferentes. Informe explicitamente a meta dos novos períodos.');
      if (afetadas.some(o => hash(criterios(o)) !== hash(criteriosHerdados)))
        throw new ConflictException('Períodos afetados têm exigências diferentes. Uniformize os critérios antes de replanejar para não perder obrigações.');
      // Todas as relações são históricas. As verificações também ocorrem na prévia,
      // e novamente na confirmação, dentro do lock do contrato raiz.
      if (plano.substituir.length) {
        const dependencias = await m.query(`SELECT o.id FROM ocorrencias o
          WHERE o.id = ANY($1::uuid[]) AND o.contrato_id=$2 AND (
            EXISTS (SELECT 1 FROM ocorrencia_lancamentos l WHERE l.ocorrencia_id=o.id AND l.contrato_id=$2)
            OR EXISTS (SELECT 1 FROM ocorrencia_comprovantes c WHERE c.ocorrencia_id=o.id AND c.contrato_id=$2)
            OR EXISTS (SELECT 1 FROM atividade_ocorrencia_medicoes am WHERE am.ocorrencia_id=o.id)
            OR EXISTS (SELECT 1 FROM execucoes_entregavel ee WHERE ee.ocorrencia_id=o.id AND ee.contrato_id=$2)
            OR EXISTS (SELECT 1 FROM eventos_auditoria ev WHERE ev.entidade_tipo='OCORRENCIA' AND ev.entidade_id=o.id::text AND ev.acao='OCORRENCIA_EDITADA' AND (
              ev.dados_anteriores->'titulo' IS DISTINCT FROM ev.dados_posteriores->'titulo' OR
              ev.dados_anteriores->'dataPrevista' IS DISTINCT FROM ev.dados_posteriores->'dataPrevista' OR
              ev.dados_anteriores->'observacoes' IS DISTINCT FROM ev.dados_posteriores->'observacoes' OR
              ev.dados_posteriores->>'operacao'='ALTERACAO_META_INDIVIDUAL'))
            -- Declarações sem arquivo podem apontar para a ocorrência, inclusive
            -- a partir de outro contrato compartilhado. Busca conservadora nos
            -- campos de vínculo validados na gravação, não no texto livre.
            OR EXISTS (SELECT 1 FROM evidencias_esperadas ev WHERE ev.rascunho_envio IS NOT NULL AND
              strpos(lower(concat_ws(',', ev.rascunho_envio->>'ocorrenciaQuantidadeId', ev.rascunho_envio->>'ocorrenciaExecucaoId',
                ev.rascunho_envio->>'ocorrenciasVinculadas', ev.rascunho_envio->>'destinosCompartilhados')), o.id::text)>0)
          ) LIMIT 1`, [plano.substituir.map(o=>o.id),contratoId]) as Array<{id:string}>;
        if (dependencias.length) throw new ConflictException('Há lançamentos, medições, alterações históricas, comprovantes ou declarações preliminares em períodos substituídos. Preserve a execução já registrada e reprograme apenas períodos livres.');
      }
      const configuracaoAnterior = await m.findOneBy(ConfiguracaoOcorrencias, { entregavelId, contratoId });
      const antes = { inicioPrevisto: e.inicioPrevisto, terminoPrevisto: e.terminoPrevisto,
        inicioAgenda: configuracaoAnterior?.inicioPrevisto ?? e.agendaInicioFuturo ?? e.inicioPrevisto,
        terminoAgenda: configuracaoAnterior?.terminoPrevisto ?? e.terminoPrevisto,
        periodicidade: e.periodicidade, agendaInicioFuturo: e.agendaInicioFuturo };
      const prazoAlterado = { anterior: e.terminoPrevisto, novo: dto.terminoPrevisto };
      const confirmacao = hash([contratoId, entregavelId, c.inicioVigencia, c.terminoVigencia, e.nome, e.etapaId, e.unidadeMedida, e.configuracaoPeriodicidade, antes, dto.alterarPrazo ?? false, dto.inicioFuturo, dto.terminoPrevisto, dto.periodicidade, modoRegistro, metaQuantidade, dto.unidadeMedida, pesosNovos,
        agenda.map(o => [o.id,o.periodoInicio,o.periodoFim,o.status,o.dataRealizada,o.dataPrevista,o.quantidadeRealizada,o.quantidadeAprovada,o.observacoes,o.substituidaEm,vinculadas.has(o.id),o.pesoPeriodo,o.modoRegistro,o.metaQuantidade,criterios(o)]), hoje]);
      const impacto = { confirmacao, prazoAlterado, substituir: plano.substituir.map(o => ({ id:o.id, inicio:o.periodoInicio, fim:o.periodoFim,
        possuiAtividades: vinculadas.has(o.id) })),
        novas: plano.novas.map((p,i) => ({...p,pesoPeriodo:pesosNovos[i]})),
        criteriosHerdados: { ...criteriosHerdados, pesoPeriodo: pesosNovos[0] ?? null },
        modoRegistro, metaQuantidade,
        reativar: plano.reativar.length, preservadas: plano.preservadas, total: plano.total };
      if (dto.confirmacao === undefined) return { ...impacto, aplicado: false };
      if (dto.confirmacao !== confirmacao) throw new ConflictException('Agenda mudou: solicite novo impacto antes de confirmar');
      if (!alteraPrazo && !plano.novas.length && !plano.substituir.length &&
          dto.inicioFuturo === antes.inicioAgenda && dto.periodicidade === e.periodicidade && dto.terminoPrevisto === antes.terminoAgenda && e.configuracaoPeriodicidade?.modoRegistro === modoRegistro && (!e.agendaInicioFuturo || configuracaoAnterior?.terminoPrevisto === dto.terminoPrevisto))
        return { ...impacto, aplicado: true };
      for (const o of plano.substituir) { o.substituidaEm = new Date(); await m.save(Ocorrencia,o); await this.auditar(m,ator,o,{ substituidaEm:null }); }
      for (const p of plano.novas) {
        const o = await m.save(Ocorrencia,m.create(Ocorrencia,{ contratoId, entregavelId, origem:OrigemOcorrencia.RECORRENTE, status:StatusOcorrencia.NAO_INICIADO, titulo:tituloOcorrenciaRecorrente(e.nome, p.titulo),
          modoRegistro, metaQuantidade,
          periodoInicio:p.inicio, periodoFim:p.fim, dataPrevista:p.fim,
          ...criteriosHerdados, pesoPeriodo: pesosNovos[plano.novas.indexOf(p)] }));
        await this.auditoria.registrarNaTransacao(m,ator,{ acao:AcaoAuditoria.OCORRENCIA_GERADA, entidadeTipo:'OCORRENCIA', entidadeId:o.id, dadosPosteriores:{ periodoInicio:p.inicio, periodoFim:p.fim, criteriosHerdados, pesoPeriodo: o.pesoPeriodo, modoRegistro:o.modoRegistro, metaQuantidade:o.metaQuantidade } });
      }
      if (dto.unidadeMedida !== undefined) e.unidadeMedida = dto.unidadeMedida.trim();
      e.agendaInicioFuturo = dto.inicioFuturo;
      // A mudança formal do prazo é confirmada e autorizada na mesma transação.
      e.terminoPrevisto = dto.terminoPrevisto;
      e.periodicidade = dto.periodicidade;
      e.configuracaoPeriodicidade = {versao:1,modoRegistro};
      await m.save(Entregavel,e);
      await m.getRepository(ConfiguracaoOcorrencias).upsert({
        entregavelId: e.id, contratoId: e.contratoId, tipoOperacional: e.tipo,
        quantidadePrevista: e.quantidadePrevista, unidadeMedida: e.unidadeMedida,
        periodicidade: e.periodicidade, inicioPrevisto: dto.inicioFuturo,
        terminoPrevisto: dto.terminoPrevisto, modoVisualizacao: 'CALENDARIO', atualizadoEm: new Date(),
      }, ['entregavelId']);
      await this.auditoria.registrarNaTransacao(m,ator,{ acao:AcaoAuditoria.ENTREGAVEL_PRAZO_ALTERADO, entidadeTipo:'ENTREGAVEL', entidadeId:e.id, dadosAnteriores:antes, dadosPosteriores:{ inicioPrevisto:e.inicioPrevisto, inicioAgenda:dto.inicioFuturo, terminoAgenda:dto.terminoPrevisto, terminoPrevisto:e.terminoPrevisto, periodicidade:e.periodicidade, agendaInicioFuturo:e.agendaInicioFuturo, substituidas:plano.substituir.length, preservadas:plano.preservadas, novas:plano.novas.length } });
      return { ...impacto, aplicado: true };
    });
  }
  private auditar(m: EntityManager, ator: UsuarioAutenticado, o: Ocorrencia, antes: Record<string,unknown>) {
    return this.auditoria.registrarNaTransacao(m,ator,{ acao:AcaoAuditoria.OCORRENCIA_REPROGRAMADA, entidadeTipo:'OCORRENCIA', entidadeId:o.id, dadosAnteriores:antes, dadosPosteriores:{ substituidaEm:o.substituidaEm, periodoInicio:o.periodoInicio, periodoFim:o.periodoFim } });
  }
}
