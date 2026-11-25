import { exigirPermissaoTransacional } from '../autorizacao/permissao-transacional.js';
import { possuiDecisoesDescendentesPendentes } from './decisoes-descendentes.js';
import { validarContribuicaoEvidencia } from './quantidade-evidencias.js';
import { validarSaldoParcelas } from '../execucao/parcelas-execucao.js';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Not, IsNull } from 'typeorm';
import { Contrato } from '../contratos/contrato.entity.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { Entregavel } from './entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { EvidenciaEsperada } from './evidencia-esperada.entity.js';
import { ComprovanteEvidencia } from './comprovante-evidencia.entity.js';

/** Arquivamento lógico auditado, sem tocar nos comprovantes já recebidos. */
@Injectable()
export class ArquivamentoPlanejamentoService {
  constructor(private readonly db: DataSource, private readonly auditoria: AuditoriaService) {}

  private async contratoAtivo(m: EntityManager, contratoId: string, permitirRegularizacao = false): Promise<Contrato> {
    const contrato = await m.getRepository(Contrato).createQueryBuilder('c')
      .setLock('pessimistic_write').where('c.id = :id', { id: contratoId }).getOne();
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.conclusaoSolicitadaEm) throw new ConflictException('Resolva a solicitação do contrato antes de alterar o planejamento');
    if (['SUSPENSO','CANCELADO'].includes(contrato.status)) throw new ConflictException('Contrato suspenso ou cancelado: alteração não permitida');
    if (contrato.arquivadoEm) throw new ConflictException('Reative o contrato antes de alterar seu planejamento');
    if (contrato.status === 'CONCLUIDO' || (contrato.status === 'CONCLUIDO_PARCIALMENTE' && !permitirRegularizacao) || contrato.status === 'ENCERRADO' || contrato.status === 'FINALIZADO')
      throw new ConflictException('Reabra o contrato concluído antes de alterar seu planejamento');
    return contrato;
  }

  private async etapaAtiva(m: EntityManager, e: Entregavel, regularizacao = false) {
    if (!e.etapaId) return; // fixtures de teste antigos
    const etapa = await m.getRepository(Etapa).findOneBy({ id: e.etapaId, contratoId: e.contratoId });
    if (!etapa) throw new NotFoundException('Etapa não encontrada');
    if (etapa.conclusaoSolicitadaEm || etapa.encerramentoSolicitadoEm) throw new ConflictException('Resolva a solicitação da etapa antes de alterar o planejamento');
    if (etapa.arquivadoEm) throw new ConflictException('Etapa arquivada: reative-a antes de alterar seus descendentes');
    if (['CONCLUIDA','ENCERRADA','FINALIZADA'].includes(etapa.status) || (etapa.status === 'CONCLUIDO_PARCIALMENTE' && !regularizacao))
      throw new ConflictException('Reabra a etapa concluída antes de alterar seus descendentes');
  }

  async alterarEntregavel(contratoId: string, id: string, arquivar: boolean, ator: UsuarioAutenticado, motivo?: string) {
    return this.db.transaction(async m => {
      await exigirPermissaoTransacional(m, contratoId, ator, arquivar ? 'arquivarEntregaveis' : 'reativarEntregaveis');
      await this.contratoAtivo(m, contratoId);
      const repo = m.getRepository(Entregavel);
      const e = await repo.findOneBy({ contratoId, id });
      if (!e) throw new NotFoundException('Entregável não encontrado neste contrato');
      await this.etapaAtiva(m, e);
      if (['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao??'') || e.regularizacaoDocumentalSolicitada) throw new ConflictException('Resolva a solicitação do entregável antes de arquivar ou reativar');
      if (Boolean(e.arquivadoEm) === arquivar) throw new ConflictException(arquivar ? 'Entregável já arquivado' : 'Entregável já ativo');
      if (arquivar && (['CONCLUIDO', 'CONCLUIDO_PARCIALMENTE', 'FINALIZADO'].includes(e.statusExecucao ?? '') && !e.reabertoEm))
        throw new ConflictException('Entregável concluído: reabra antes de arquivar');
      if (arquivar && await possuiDecisoesDescendentesPendentes(m,e))
        throw new ConflictException('Resolva as decisões e contribuições pendentes dos descendentes antes de arquivar o entregável.');
      if (!arquivar) {
        const contrato = await m.getRepository(Contrato).findOneBy({id:contratoId});
        if (contrato?.modoCalculo === 'PONDERADO') {
          const [r] = await m.query(`SELECT COALESCE(SUM(e.peso),0)+COALESCE($3::numeric,0)>100 AS excede
            FROM entregaveis e JOIN etapas et ON et.id=e.etapa_id AND et.contrato_id=e.contrato_id
            WHERE e.contrato_id=$1 AND e.id<>$2 AND e.arquivado_em IS NULL AND et.arquivado_em IS NULL`,[contratoId,id,e.peso]);
          if (r?.excede) throw new ConflictException('A reativação excederia os 100% de peso do contrato. Regularize os pesos antes de reativar.');
        }
      }
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
      await exigirPermissaoTransacional(m, contratoId, ator, arquivar ? 'arquivarEvidencias' : 'reativarEvidencias');
      const contrato = await this.contratoAtivo(m, contratoId, true);
      const e = await m.getRepository(Entregavel).findOneBy({ id: entregavelId, contratoId });
      if (!e) throw new NotFoundException('Entregável não encontrado neste contrato');
      const regularizacao = e.statusExecucao === 'CONCLUIDO_PARCIALMENTE';
      if (contrato.status === 'CONCLUIDO_PARCIALMENTE' && !regularizacao) throw new ConflictException('Contrato parcialmente concluído: somente regularização documental é permitida');
      await this.etapaAtiva(m, e, regularizacao);
      if (e.arquivadoEm) throw new ConflictException('Reative o entregável antes de alterar suas evidências');
      if (e.regularizacaoDocumentalSolicitada || ['CONCLUIDO','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? '')) throw new ConflictException('Reabra o entregável concluído antes de alterar evidências');
      const repo = m.getRepository(EvidenciaEsperada);
      const evidencia = await repo.findOneBy({ id, entregavelId });
      if (!evidencia) throw new NotFoundException('Evidência não encontrada neste entregável');
      if (Boolean(evidencia.arquivadoEm) === arquivar) throw new ConflictException(arquivar ? 'Evidência já arquivada' : 'Evidência já ativa');
      if (regularizacao) {
        if (evidencia.obrigatoria) throw new ConflictException('Preserve a exigência obrigatória. Substitua o comprovante no mesmo item, sem arquivá-lo.');
        const [r] = await m.query(`SELECT EXISTS (SELECT 1 FROM comprovantes_evidencia c
          WHERE c.contrato_id=$1 AND c.entregavel_id=$2 AND c.evidencia_esperada_id=$3
          AND NOT EXISTS (SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id))
          AND (c.quantidade_declarada IS NOT NULL OR c.referencia_execucao IS NOT NULL OR EXISTS
            (SELECT 1 FROM execucoes_entregavel p WHERE p.contrato_id=$1 AND p.entregavel_id=$2 AND p.origem='EVIDENCIA' AND p.origem_id=c.id))) AS contribui`,[contratoId,entregavelId,id]);
        if (r?.contribui) throw new ConflictException('Reabra o entregável antes de alterar evidência vinculada à execução física.');
      }
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
      // A reativação volta a participar dos cálculos; validar o estado já restaurado,
      // na mesma transação, para que um conflito reverta também o arquivamento.
      if (!arquivar) {
        const atual = await m.getRepository(ComprovanteEvidencia).findOne({
          where: { evidenciaEsperadaId: id, contratoId, entregavelId }, order: { criadoEm: 'DESC', id: 'DESC' },
        });
        if (atual?.quantidadeDeclarada != null && atual.status !== 'REJEITADA')
          await validarContribuicaoEvidencia(m,e,atual);
      }
      await validarSaldoParcelas(m,e);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: arquivar ? AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_ARQUIVADA : AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_REATIVADA,
        entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId,
        dadosAnteriores: { evidenciaEsperadaId: id, tipoEvidencia: evidencia.tipoEvidencia, arquivadoEm: anterior },
        dadosPosteriores: { evidenciaEsperadaId: id, tipoEvidencia: evidencia.tipoEvidencia,
          arquivadoEm: evidencia.arquivadoEm, arquivadoPor: evidencia.arquivadoPor, ...(motivo && !arquivar ? { justificativa: motivo } : {}) },
      });
      // Arquivar evidência altera somente a documentação; solicitação e aprovação
      // de conclusão continuam sendo operações independentes e auditadas.
      const conclusoes: string[] = [];
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
