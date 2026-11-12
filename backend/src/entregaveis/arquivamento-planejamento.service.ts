import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Not, IsNull } from 'typeorm';
import { Contrato } from '../contratos/contrato.entity.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { documentacaoVerificada, concluirEtapaAposFilhos } from './conclusao-documental.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { StatusExecucaoEntregavel } from './status-execucao-entregavel.enum.js';
import { Entregavel } from './entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { EvidenciaEsperada } from './evidencia-esperada.entity.js';
import { ComprovanteEvidencia } from './comprovante-evidencia.entity.js';

/** Arquivamento lógico auditado, sem tocar nos comprovantes já recebidos. */
@Injectable()
export class ArquivamentoPlanejamentoService {
  constructor(private readonly db: DataSource, private readonly auditoria: AuditoriaService) {}

  private async contratoAtivo(m: EntityManager, contratoId: string): Promise<void> {
    const contrato = await m.getRepository(Contrato).createQueryBuilder('c')
      .setLock('pessimistic_write').where('c.id = :id', { id: contratoId }).getOne();
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.arquivadoEm) throw new ConflictException('Reative o contrato antes de alterar seu planejamento');
    if ((contrato.status === 'CONCLUIDO' || contrato.status === 'ENCERRADO') ||
      (contrato.reabertoEm === null && await documentacaoVerificada(m, contratoId)))
      throw new ConflictException('Reabra o contrato concluído antes de alterar seu planejamento');
  }

  private async etapaAtiva(m: EntityManager, e: Entregavel) {
    if (!e.etapaId) return; // fixtures de teste antigos
    const etapa = await m.getRepository(Etapa).findOneBy({ id: e.etapaId, contratoId: e.contratoId });
    if (!etapa) throw new NotFoundException('Etapa não encontrada');
    if (etapa.arquivadoEm) throw new ConflictException('Etapa arquivada: reative-a antes de alterar seus descendentes');
    if ((etapa.status === 'CONCLUIDA' || etapa.status === 'ENCERRADA') && !etapa.reabertoEm)
      throw new ConflictException('Reabra a etapa concluída antes de alterar seus descendentes');
  }

  async alterarEntregavel(contratoId: string, id: string, arquivar: boolean, ator: UsuarioAutenticado, motivo?: string) {
    return this.db.transaction(async m => {
      await this.contratoAtivo(m, contratoId);
      const repo = m.getRepository(Entregavel);
      const e = await repo.findOneBy({ contratoId, id });
      if (!e) throw new NotFoundException('Entregável não encontrado neste contrato');
      await this.etapaAtiva(m, e);
      if (Boolean(e.arquivadoEm) === arquivar) throw new ConflictException(arquivar ? 'Entregável já arquivado' : 'Entregável já ativo');
      if (arquivar && (e.statusExecucao === 'CONCLUIDO' ||
        (e.reabertoEm === null && await documentacaoVerificada(m, contratoId, e.etapaId, id))))
        throw new ConflictException('Entregável concluído: reabra antes de arquivar');
      const anterior = e.arquivadoEm;
      e.arquivadoEm = arquivar ? new Date() : null;
      e.arquivadoPor = arquivar ? ator.id : null;
      await repo.save(e);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: arquivar ? AcaoAuditoria.ENTREGAVEL_ARQUIVADO : AcaoAuditoria.ENTREGAVEL_REATIVADO,
        entidadeTipo: 'ENTREGAVEL', entidadeId: id,
        dadosAnteriores: { arquivadoEm: anterior }, dadosPosteriores: { arquivadoEm: e.arquivadoEm, arquivadoPor: e.arquivadoPor, ...(motivo && !arquivar ? { justificativa: motivo } : {}) },
      });
      return { id, arquivadoEm: e.arquivadoEm };
    });
  }

  async alterarEvidencia(contratoId: string, entregavelId: string, id: string, arquivar: boolean, ator: UsuarioAutenticado, motivo?: string) {
    return this.db.transaction(async m => {
      await this.contratoAtivo(m, contratoId);
      const e = await m.getRepository(Entregavel).findOneBy({ id: entregavelId, contratoId });
      if (!e) throw new NotFoundException('Entregável não encontrado neste contrato');
      await this.etapaAtiva(m, e);
      if (e.arquivadoEm) throw new ConflictException('Reative o entregável antes de alterar suas evidências');
      if (e.statusExecucao === 'CONCLUIDO') throw new ConflictException('Reabra o entregável concluído antes de alterar evidências');
      const repo = m.getRepository(EvidenciaEsperada);
      const evidencia = await repo.findOneBy({ id, entregavelId });
      if (!evidencia) throw new NotFoundException('Evidência não encontrada neste entregável');
      if (Boolean(evidencia.arquivadoEm) === arquivar) throw new ConflictException(arquivar ? 'Evidência já arquivada' : 'Evidência já ativa');
      if (arquivar) {
        const ultima = await m.getRepository(ComprovanteEvidencia).findOne({
          where: { evidenciaEsperadaId: id }, order: { criadoEm: 'DESC', id: 'DESC' },
        });
        if (ultima?.status === 'VERIFICADA') throw new ConflictException('Evidência verificada: reabra antes de arquivar');
      }
      if (!arquivar) {
        const ativos = await repo.count({ where: { entregavelId, arquivadoEm: IsNull() } });
        if (ativos >= 10) throw new ConflictException('Limite de dez evidências esperadas ativas por entregável');
      }
      const anterior = evidencia.arquivadoEm;
      evidencia.arquivadoEm = arquivar ? new Date() : null;
      evidencia.arquivadoPor = arquivar ? ator.id : null;
      await repo.save(evidencia);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: arquivar ? AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_ARQUIVADA : AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_REATIVADA,
        entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId,
        dadosAnteriores: { evidenciaEsperadaId: id, tipoEvidencia: evidencia.tipoEvidencia, arquivadoEm: anterior },
        dadosPosteriores: { evidenciaEsperadaId: id, tipoEvidencia: evidencia.tipoEvidencia,
          arquivadoEm: evidencia.arquivadoEm, arquivadoPor: evidencia.arquivadoPor, ...(motivo && !arquivar ? { justificativa: motivo } : {}) },
      });
      const conclusoes: string[] = [];
      if (arquivar && !e.reabertoEm) {
        // Arquivar uma evidência exige permissão explícita. A conclusão que
        // resulta do checklist completo é um EFEITO DERIVADO do sistema,
        // assim como já ocorre ao verificar o último comprovante. Não existe
        // estado intermediário "Pendente de conclusão" para o entregável.
        // A conclusão MANUAL continua exigindo concluirEntregaveis.
        if (await documentacaoVerificada(m, contratoId, e.etapaId, entregavelId)) {
          const revisoesAbertas = await m.getRepository(EvidenciaEsperada).count({
            where: { entregavelId, arquivadoEm: IsNull(), reabertoEm: Not(IsNull()) },
          });
          if (!revisoesAbertas) {
            const anterior = { statusExecucao: e.statusExecucao, reabertoEm: e.reabertoEm ?? null };
            e.statusExecucao = StatusExecucaoEntregavel.CONCLUIDO;
            e.reabertoEm = null;
            await m.getRepository(Entregavel).save(e);
            await this.auditoria.registrarNaTransacao(m, ator, {
              acao: AcaoAuditoria.ENTREGAVEL_STATUS_ALTERADO, entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId,
              dadosAnteriores: anterior,
              dadosPosteriores: { statusExecucao: e.statusExecucao, reabertoEm: null,
                motivo: 'COMPROVACAO_COMPLETA_APOS_ARQUIVAMENTO' },
            });
            conclusoes.push('entregável');
            if (await concluirEtapaAposFilhos(m, contratoId, e.etapaId, async (antes, depois) => {
              await this.auditoria.registrarNaTransacao(m, ator, {
                acao: AcaoAuditoria.ETAPA_STATUS_ALTERADO, entidadeTipo: 'ETAPA', entidadeId: e.etapaId,
                dadosAnteriores: antes,
                dadosPosteriores: { ...depois, motivo: 'CONCLUSAO_DOS_ENTREGAVEIS' },
              });
            })) conclusoes.push('etapa');
          }
        }
      }
      return { id, entregavelId, arquivadoEm: evidencia.arquivadoEm, conclusoes };
    });
  }

  /** Somente o endpoint protegido pela política de planejamento chama esta consulta. */
  async listarEvidenciasArquivadas(contratoId: string, entregavelId: string) {
    const e = await this.db.getRepository(Entregavel).findOneBy({ id: entregavelId, contratoId });
    if (!e) throw new NotFoundException('Entregável não encontrado neste contrato');
    const etapa = await this.db.getRepository(Etapa).findOneBy({ id: e.etapaId, contratoId });
    const contrato = await this.db.getRepository(Contrato).findOneBy({ id: contratoId });
    const arquivoHerdado = Boolean(e.arquivadoEm || etapa?.arquivadoEm || contrato?.arquivadoEm);
    // Na árvore arquivada, mostrar também evidências não arquivadas individualmente:
    // seu pai está somente-leitura, mas seus registros/arquivos são preservados.
    return this.db.getRepository(EvidenciaEsperada).find({
      where: arquivoHerdado ? { entregavelId } : { entregavelId, arquivadoEm: Not(IsNull()) },
      order: { arquivadoEm: 'DESC' },
      select: { id: true, codigoPublico: true, entregavelId: true, tipoEvidencia: true, descricao: true, obrigatoria: true, arquivadoEm: true },
    });
  }
}
