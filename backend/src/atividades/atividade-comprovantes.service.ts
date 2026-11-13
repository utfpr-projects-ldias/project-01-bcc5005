import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { AtividadeEntity } from './atividade.entity.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { uuidValido } from '../autorizacao/politicas-operacionais.js';

type LinhaComprovante = {
  id: string; nomeOriginal: string; tipoEvidencia: string; status: 'VERIFICADA';
  entregavelId: string; vinculado: boolean;
};

@Injectable()
export class AtividadeComprovantesService {
  constructor(private readonly db: DataSource, private readonly auditoria: AuditoriaService) {}

  private async atividade(m: EntityManager, contratoId: string, atividadeId: string) {
    if (!uuidValido(contratoId) || !uuidValido(atividadeId)) throw new BadRequestException('Identificador inválido');
    const atividade = await m.findOne(AtividadeEntity, { where: { id: atividadeId, contratoId } });
    if (!atividade || atividade.excluidaEm) throw new NotFoundException('Atividade indisponível');
    return atividade;
  }

  /** Disponíveis: apenas versão atual verificada de entregável associado.
   * Vinculadas: preservar histórico, inclusive após substituição de versão,
   * arquivamento do checklist ou mudança dos entregáveis da atividade.
   * Nunca expõe storageKey nem comprovantes de outro contrato. */
  async listar(contratoId: string, atividadeId: string): Promise<{ vinculadas: LinhaComprovante[]; disponiveis: LinhaComprovante[] }> {
    await this.atividade(this.db.manager, contratoId, atividadeId);
    const linhas: LinhaComprovante[] = await this.db.manager.query(`
      SELECT c.id, c.nome_original AS "nomeOriginal", ev.tipo_evidencia AS "tipoEvidencia",
             c.status, c.entregavel_id AS "entregavelId", (av.atividade_id IS NOT NULL) AS vinculado
        FROM comprovantes_evidencia c
        JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id
        LEFT JOIN atividade_entregaveis ae ON ae."atividadeId"=$2 AND ae."entregavelId"=c.entregavel_id
        LEFT JOIN atividade_comprovantes av ON av.comprovante_id=c.id AND av.atividade_id=$2 AND av.contrato_id=$1
       WHERE c.contrato_id=$1 AND (
         av.atividade_id IS NOT NULL
         OR (ae."atividadeId" IS NOT NULL AND ev.arquivado_em IS NULL AND c.status='VERIFICADA'
           AND NOT EXISTS (
             SELECT 1 FROM comprovantes_evidencia nova WHERE nova.evidencia_esperada_id=c.evidencia_esperada_id
               AND (nova.criado_em,nova.id) > (c.criado_em,c.id)))
       )
       ORDER BY c.criado_em DESC LIMIT 100`, [contratoId, atividadeId]);
    return { vinculadas: linhas.filter(c => c.vinculado), disponiveis: linhas.filter(c => !c.vinculado) };
  }

  async vincular(contratoId: string, atividadeId: string, comprovanteId: string, ator: UsuarioAutenticado) {
    if (!uuidValido(comprovanteId)) throw new BadRequestException('Comprovante inválido');
    return this.db.transaction(async m => {
      const contrato = await m.findOne(Contrato, { where: { id: contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!contrato || contrato.arquivadoEm || !['PLANEJAMENTO','EM_EXECUCAO'].includes(contrato.status))
        throw new ConflictException('O contrato precisa estar aberto para vincular comprovantes');
      const atividade = await this.atividade(m, contratoId, atividadeId);
      if (atividade.status !== 'REGISTRADA') throw new ConflictException('Reabra a atividade antes de alterar evidências vinculadas');
      const comprovantes: Array<{ id: string }> = await m.query(`
        SELECT c.id FROM comprovantes_evidencia c
          JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id AND ev.arquivado_em IS NULL
          JOIN atividade_entregaveis ae ON ae."atividadeId"=$2 AND ae."entregavelId"=c.entregavel_id
        WHERE c.id=$3 AND c.contrato_id=$1 AND c.status='VERIFICADA'
          AND NOT EXISTS (SELECT 1 FROM comprovantes_evidencia n
            WHERE n.evidencia_esperada_id=c.evidencia_esperada_id
              AND (n.criado_em,n.id) > (c.criado_em,c.id))`, [contratoId, atividadeId, comprovanteId]);
      if (!comprovantes.length) throw new ConflictException('O comprovante deve estar verificado, ser a versão atual e pertencer a um entregável vinculado desta atividade');
      const retorno: Array<{ comprovante_id: string }> = await m.query(`
        INSERT INTO atividade_comprovantes (atividade_id, comprovante_id, contrato_id, vinculado_por)
        VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING comprovante_id`,
        [atividadeId, comprovanteId, contratoId, ator.id]);
      if (!retorno.length) throw new ConflictException('Este comprovante já está vinculado à atividade');
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ATIVIDADE_VINCULOS_ALTERADOS, entidadeTipo: 'ATIVIDADE', entidadeId: atividadeId,
        dadosAnteriores: { comprovanteId: null }, dadosPosteriores: { comprovanteId, acao: 'VINCULOU_COMPROVANTE' },
      });
      return { vinculado: true, atividadeId, comprovanteId };
    });
  }
}
