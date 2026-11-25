import { FASES_OPERACIONAIS_CONTRATO } from '../contratos/fases-operacionais.js';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { TipoEntregavel } from '../entregaveis/tipo-entregavel.enum.js';
import { exigirPermissaoTransacional } from '../autorizacao/permissao-transacional.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import type { ConfigurarOcorrenciasDto } from './dto/configurar-ocorrencias.dto.js';
import { milesimos } from '../common/quantidade-exata.js';
import { ConfiguracaoOcorrencias } from './configuracao-ocorrencias.entity.js';

@Injectable()
export class ConfiguracaoOcorrenciasService {
  constructor(private readonly ds: DataSource, private readonly auditoria: AuditoriaService) {}

  async consultar(contratoId: string, entregavelId: string) {
    const e = await this.ds.getRepository(Entregavel).findOneBy({ id: entregavelId, contratoId });
    if (!e) throw new NotFoundException('Entregável não encontrado neste contrato');
    const atual = await this.ds.getRepository(ConfiguracaoOcorrencias).findOneBy({ entregavelId, contratoId });
    if (e.agendaInicioFuturo && !atual?.terminoPrevisto) throw new ConflictException('Agenda replanejada sem configuração vigente. Regularize o planejamento.');
    return Object.assign({}, atual, { entregavelId, contratoId, modoVisualizacao: e.tipo === TipoEntregavel.RECORRENTE ? 'CALENDARIO' as const : 'LISTA' as const, tipoOperacional: e.tipo, quantidadePrevista: e.quantidadePrevista,
      unidadeMedida: e.unidadeMedida, periodicidade: e.periodicidade, inicioPrevisto: e.tipo === TipoEntregavel.RECORRENTE && e.agendaInicioFuturo ? e.agendaInicioFuturo : e.inicioPrevisto,
      terminoPrevisto: e.tipo === TipoEntregavel.RECORRENTE && e.agendaInicioFuturo ? (atual?.terminoPrevisto ?? e.terminoPrevisto) : e.terminoPrevisto, atualizadoEm: atual?.atualizadoEm ?? null });
  }

  async atualizar(contratoId: string, entregavelId: string, dto: ConfigurarOcorrenciasDto, ator: UsuarioAutenticado) {
    // Formato é derivado da regra contratual, não editável por preferência.
    // Replanejamento da recorrência é realizado na operação transacional própria.
    if (dto.modoVisualizacao !== (dto.tipoOperacional === TipoEntregavel.RECORRENTE ? 'CALENDARIO' : 'LISTA'))
      throw new BadRequestException('A visualização é definida automaticamente pelo tipo do entregável');
    return this.ds.transaction(async m => {
      await exigirPermissaoTransacional(m, contratoId, ator, 'editarEntregaveis');
      if (dto.tipoOperacional === TipoEntregavel.RECORRENTE)
        await exigirPermissaoTransacional(m, contratoId, ator, 'configurarAgendaOcorrencias');
      const c = await m.findOne(Contrato, { where: { id: contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!c || c.arquivadoEm || c.conclusaoSolicitadaEm || c.encerramentoSolicitado || !FASES_OPERACIONAIS_CONTRATO.includes(c.status)) throw new ConflictException('Reabra ou retome o contrato antes de configurar ocorrências');
      const e = await m.findOne(Entregavel, { where: { id: entregavelId, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!e) throw new NotFoundException('Entregável não encontrado neste contrato');
      const etapa = await m.findOneBy(Etapa,{id:e.etapaId,contratoId});
      if (!etapa || etapa.arquivadoEm || etapa.conclusaoSolicitadaEm || etapa.encerramentoSolicitadoEm || ['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(etapa.status)) throw new ConflictException('Reabra a etapa antes de configurar ocorrências');
      if (e.arquivadoEm || e.regularizacaoDocumentalSolicitada || ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? '')) throw new ConflictException('Reabra o entregável antes de configurar ocorrências');
      const anterior = await m.findOneBy(ConfiguracaoOcorrencias, { entregavelId, contratoId });
      if (e.agendaInicioFuturo && !anterior?.terminoPrevisto) throw new ConflictException('Agenda replanejada sem configuração vigente. Regularize o planejamento.');
      const inicio = e.agendaInicioFuturo ?? e.inicioPrevisto;
      const fim = e.agendaInicioFuturo ? anterior!.terminoPrevisto : e.terminoPrevisto;
      const quantidadeIgual = (dto.quantidadePrevista == null && e.quantidadePrevista == null) ||
        (dto.quantidadePrevista != null && e.quantidadePrevista != null && milesimos(dto.quantidadePrevista)===milesimos(e.quantidadePrevista));
      if (dto.tipoOperacional !== e.tipo ||
          !quantidadeIgual ||
          (dto.unidadeMedida ?? null) !== (e.unidadeMedida ?? null) ||
          (dto.periodicidade ?? null) !== (e.periodicidade ?? null) ||
          (dto.inicioPrevisto ?? null) !== (inicio ?? null) ||
          (dto.terminoPrevisto ?? null) !== (fim ?? null)) {
        throw new ConflictException('O planejamento pertence ao entregável. Edite-o na seção Planejamento; o tipo não pode ser alterado após o cadastro.');
      }
      const modoVisualizacao: ConfiguracaoOcorrencias['modoVisualizacao'] =
        e.tipo === TipoEntregavel.RECORRENTE ? 'CALENDARIO' : 'LISTA';
      const novo = {
        entregavelId, contratoId, modoVisualizacao,
        tipoOperacional: e.tipo, quantidadePrevista: e.quantidadePrevista,
        unidadeMedida: e.unidadeMedida, periodicidade: e.periodicidade,
        inicioPrevisto: inicio,
        terminoPrevisto: fim,
      };
      if (anterior && Object.entries(novo).every(([chave, valor]) => (anterior as unknown as Record<string,unknown>)[chave] === valor)) return anterior;
      // O modo lista/calendário não modifica a execução nem períodos históricos.
      const salva = await m.save(ConfiguracaoOcorrencias,
        m.create(ConfiguracaoOcorrencias, { ...novo, atualizadoEm: new Date() }));
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ENTREGAVEL_EDITADO, entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId,
        dadosAnteriores: anterior ? {modoVisualizacao: anterior.modoVisualizacao, tipoOperacional: anterior.tipoOperacional, quantidadePrevista: anterior.quantidadePrevista, unidadeMedida: anterior.unidadeMedida, periodicidade: anterior.periodicidade, inicioPrevisto: anterior.inicioPrevisto, terminoPrevisto: anterior.terminoPrevisto} : {},
        dadosPosteriores: novo,
      });
      return salva;
    });
  }
}
