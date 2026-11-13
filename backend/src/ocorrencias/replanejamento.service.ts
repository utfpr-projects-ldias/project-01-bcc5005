import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
import { PermissaoContrato } from '../autorizacao/permissao-contrato.entity.js';
import { permissoesEfetivas } from '../autorizacao/permissoes-granulares.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import type { ReplanejarOcorrenciasDto } from './dto/replanejar-ocorrencias.dto.js';

export const hojeCivil = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const chave = (i: string | null, f: string | null) => `${i}/${f}`;
const proximoDia = (s: string) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+1); return d.toISOString().slice(0,10); };
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** Concilia a agenda futura sem apagar o histórico nem reativar versões arquivadas.
 * O período concluído é preservado no seu intervalo original. Se ele intercepta
 * um novo período, esse período não recebe outra ocorrência automática.
 * Um período não pode contar mais de uma vez no cálculo físico.
 */
export function planoDeRevisao(ocorrencias: Ocorrencia[], _vinculadas: Set<string>, dto: ReplanejarOcorrenciasDto, _hoje: string) {
  const periodos = calcularPeriodosRecorrentes(dto.inicioFuturo, dto.terminoPrevisto, dto.periodicidade);
  const ativas = ocorrencias.filter(o => !o.substituidaEm);
  const anteriores = ativas.filter(o => o.periodoFim && o.periodoFim < dto.inicioFuturo);
  const futuras = ativas.filter(o => !anteriores.includes(o));
  const concluidas = futuras.filter(o => o.status === StatusOcorrencia.CONCLUIDO);
  const corresponde = (o: Ocorrencia, p: { inicio: string; fim: string }) =>
    Boolean(o.periodoInicio && o.periodoFim && o.periodoInicio <= p.fim && o.periodoFim >= p.inicio);
  const iguais = new Set(periodos.map(p => chave(p.inicio, p.fim)));
  const manter = futuras.filter(o => o.status !== StatusOcorrencia.CONCLUIDO && iguais.has(chave(o.periodoInicio, o.periodoFim)));
  const substituir = futuras.filter(o => o.status !== StatusOcorrencia.CONCLUIDO && !manter.includes(o));
  // Uma conclusão histórica cobre, no máximo, um espaço da nova agenda.
  const cobertos = new Set<string>();
  for (const o of concluidas) {
    const p = periodos.find(p => !cobertos.has(chave(p.inicio, p.fim)) && corresponde(o, p));
    if (p) cobertos.add(chave(p.inicio, p.fim));
  }
  const novas = periodos.filter(p => !cobertos.has(chave(p.inicio, p.fim)) &&
    !manter.some(o => chave(o.periodoInicio,o.periodoFim) === chave(p.inicio,p.fim)));
  return {
    substituir, novas, reativar: [] as Ocorrencia[], preservadas: anteriores.length + concluidas.length + manter.length,
    total: anteriores.length + periodos.length,
  };
}
@Injectable()
export class ReplanejamentoService {
  constructor(private readonly ds: DataSource, private readonly auditoria: AuditoriaService) {}
  async executar(contratoId: string, entregavelId: string, dto: ReplanejarOcorrenciasDto, ator: UsuarioAutenticado) {
    return this.ds.transaction(async m => {
      const c = await m.findOne(Contrato, { where: { id: contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!c || c.arquivadoEm || !['PLANEJAMENTO','EM_EXECUCAO'].includes(c.status)) throw new ConflictException('Contrato bloqueado');
      if (ator.perfil !== 'ADMINISTRADOR') {
        const v = await m.findOneBy(PermissaoContrato, { contratoId, usuarioId: ator.id });
        const p = permissoesEfetivas(ator.perfil, Boolean(v?.podeEditar), v?.permissoesDetalhadas);
        if (!v || !p.configurarAgendaOcorrencias) throw new ForbiddenException('Replanejar requer edição e geração');
      }
      const e = await m.findOne(Entregavel, { where: { id: entregavelId, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!e || e.tipo !== 'RECORRENTE' || e.arquivadoEm) throw new NotFoundException('Entregável recorrente não encontrado');
      const etapa = await m.findOneBy(Etapa, { id: e.etapaId, contratoId });
      if (!etapa || etapa.arquivadoEm || ['CONCLUIDA','ENCERRADA','FINALIZADA'].includes(etapa.status) || ['CONCLUIDO','FINALIZADO'].includes(e.statusExecucao ?? '')) throw new ConflictException('Reabra a hierarquia antes de replanejar');
      if (!e.inicioPrevisto || !e.terminoPrevisto || dto.inicioFuturo < e.inicioPrevisto || dto.terminoPrevisto > e.terminoPrevisto || dto.inicioFuturo > dto.terminoPrevisto ||
          dto.inicioFuturo < c.inicioVigencia || dto.terminoPrevisto > c.terminoVigencia)
        throw new BadRequestException('Período futuro deve estar contido na vigência atual deste entregável');
      const agenda = await m.find(Ocorrencia, { where: { entregavelId, contratoId, origem: OrigemOcorrencia.RECORRENTE }, order: { id: 'ASC' } });
      if (!agenda.length) throw new ConflictException('Gere a agenda inicial antes de replanejar');
      const atividades = await m.find(AtividadeEntity, { where: { contratoId }, select: { ocorrenciaId: true } });
      const associacoes = await m.query(`SELECT DISTINCT v."ocorrenciaId" AS id FROM "atividade_ocorrencias" v
        WHERE v."contratoId" = $1`, [contratoId]) as { id: string }[];
      const vinculadas = new Set([
        ...atividades.flatMap(a => a.ocorrenciaId ? [a.ocorrenciaId] : []),
        ...associacoes.map(v => v.id),
      ]);
      const plano = planoDeRevisao(agenda, vinculadas, dto, hojeCivil());
      const configuracaoAnterior = await m.findOneBy(ConfiguracaoOcorrencias, { entregavelId, contratoId });
      const antes = { inicioPrevisto: configuracaoAnterior?.inicioPrevisto ?? e.inicioPrevisto,
        terminoPrevisto: configuracaoAnterior?.terminoPrevisto ?? e.terminoPrevisto,
        periodicidade: e.periodicidade, agendaInicioFuturo: e.agendaInicioFuturo };
      const confirmacao = hash([contratoId, entregavelId, c.inicioVigencia, c.terminoVigencia, antes, dto.inicioFuturo, dto.terminoPrevisto, dto.periodicidade,
        agenda.map(o => [o.id,o.periodoInicio,o.periodoFim,o.status,o.dataRealizada,o.dataPrevista,o.quantidadeRealizada,o.observacoes,o.substituidaEm,vinculadas.has(o.id)])]);
      const impacto = { confirmacao, substituir: plano.substituir.map(o => ({ id:o.id, inicio:o.periodoInicio, fim:o.periodoFim })), novas: plano.novas, reativar: plano.reativar.length, preservadas: plano.preservadas, total: plano.total };
      if (dto.confirmacao === undefined) return { ...impacto, aplicado: false };
      if (dto.confirmacao !== confirmacao) throw new ConflictException('Agenda mudou: solicite novo impacto antes de confirmar');
      for (const o of plano.substituir) { o.substituidaEm = new Date(); await m.save(Ocorrencia,o); await this.auditar(m,ator,o,{ substituidaEm:null }); }
      for (const p of plano.novas) {
        const o = await m.save(Ocorrencia,m.create(Ocorrencia,{ contratoId, entregavelId, origem:OrigemOcorrencia.RECORRENTE, status:StatusOcorrencia.NAO_INICIADO, titulo:`${e.nome} - ${p.titulo}`.slice(0,255), periodoInicio:p.inicio, periodoFim:p.fim, dataPrevista:p.fim }));
        await this.auditoria.registrarNaTransacao(m,ator,{ acao:AcaoAuditoria.OCORRENCIA_GERADA, entidadeTipo:'OCORRENCIA', entidadeId:o.id, dadosPosteriores:{ periodoInicio:p.inicio, periodoFim:p.fim } });
      }
      e.agendaInicioFuturo = dto.inicioFuturo;
      // As datas-pai do entregável delimitam a obrigação e nunca são
      // encurtadas por uma alteração da agenda de ocorrências.
      e.periodicidade = dto.periodicidade;
      await m.save(Entregavel,e);
      await m.getRepository(ConfiguracaoOcorrencias).upsert({
        entregavelId: e.id, contratoId: e.contratoId, tipoOperacional: e.tipo,
        quantidadePrevista: e.quantidadePrevista, unidadeMedida: e.unidadeMedida,
        periodicidade: e.periodicidade, inicioPrevisto: dto.inicioFuturo,
        terminoPrevisto: dto.terminoPrevisto, modoVisualizacao: 'CALENDARIO', atualizadoEm: new Date(),
      }, ['entregavelId']);
      await this.auditoria.registrarNaTransacao(m,ator,{ acao:AcaoAuditoria.ENTREGAVEL_PRAZO_ALTERADO, entidadeTipo:'ENTREGAVEL', entidadeId:e.id, dadosAnteriores:antes, dadosPosteriores:{ inicioPrevisto:dto.inicioFuturo, terminoPrevisto:dto.terminoPrevisto, periodicidade:e.periodicidade, agendaInicioFuturo:e.agendaInicioFuturo, substituidas:plano.substituir.length, preservadas:plano.preservadas, novas:plano.novas.length } });
      return { ...impacto, aplicado: true };
    });
  }
  private auditar(m: EntityManager, ator: UsuarioAutenticado, o: Ocorrencia, antes: Record<string,unknown>) {
    return this.auditoria.registrarNaTransacao(m,ator,{ acao:AcaoAuditoria.OCORRENCIA_REPROGRAMADA, entidadeTipo:'OCORRENCIA', entidadeId:o.id, dadosAnteriores:antes, dadosPosteriores:{ substituidaEm:o.substituidaEm, periodoInicio:o.periodoInicio, periodoFim:o.periodoFim } });
  }
}
