import { FASES_OPERACIONAIS_CONTRATO } from '../contratos/fases-operacionais.js';
import { exigirPermissaoTransacional } from '../autorizacao/permissao-transacional.js';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { AtividadeEntity } from './atividade.entity.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { uuidValido } from '../autorizacao/politicas-operacionais.js';

type LinhaComprovante = {
  id: string; nomeOriginal: string; tipoEvidencia: string; status: 'VERIFICADA'|'PENDENTE_VERIFICACAO'|'REJEITADA';
  entregavelId: string; vinculado: boolean; vigente: boolean;
};

const semDuplicidade = `AND NOT EXISTS (SELECT 1 FROM atividade_ocorrencia_medicoes am WHERE am.atividade_id=$2 AND am.contrato_id=$1 AND am.ocorrencia_id=c.ocorrencia_quantidade_id AND am.quantidade>0 AND c.origem_quantidade='NOVA_EXECUCAO' AND c.quantidade_declarada>0)
          AND NOT EXISTS (SELECT 1 FROM atividades a WHERE a.id=$2 AND a."contratoId"=$1 AND a."ocorrenciaId"=c.ocorrencia_quantidade_id AND a.quantidade_execucao>0 AND c.origem_quantidade='NOVA_EXECUCAO' AND c.quantidade_declarada>0)
          AND NOT EXISTS (SELECT 1 FROM atividade_entregavel_medicoes dm WHERE dm.atividade_id=$2 AND dm.contrato_id=$1 AND dm.entregavel_id=c.entregavel_id AND c.ocorrencia_quantidade_id IS NULL AND c.origem_quantidade='NOVA_EXECUCAO' AND c.quantidade_declarada>0)
          AND NOT EXISTS (SELECT 1 FROM execucoes_entregavel a JOIN execucoes_entregavel p ON p.contrato_id=a.contrato_id AND p.entregavel_id=a.entregavel_id AND p.ocorrencia_id IS NOT DISTINCT FROM a.ocorrencia_id
            WHERE a.origem='ATIVIDADE' AND a.origem_id=$2 AND p.origem='EVIDENCIA' AND p.origem_id=c.id AND a.centesimos>0 AND p.centesimos>0)`;

@Injectable()
export class AtividadeComprovantesService {
  constructor(private readonly db: DataSource, private readonly auditoria: AuditoriaService) {}

  private async atividade(m: EntityManager, contratoId: string, atividadeId: string) {
    if (!uuidValido(contratoId) || !uuidValido(atividadeId)) throw new BadRequestException('Identificador inválido');
    const atividade = await m.findOne(AtividadeEntity, { where: { id: atividadeId, contratoId } });
    if (!atividade || atividade.excluidaEm) throw new NotFoundException('Atividade indisponível');
    return atividade;
  }

  /** Disponíveis: versão atual pendente ou verificada de entregável associado.
   * Vinculadas: preservar histórico, inclusive após substituição de versão,
   * arquivamento do checklist ou mudança dos entregáveis da atividade.
   * Nunca expõe storageKey nem comprovantes de outro contrato. */
  async listar(contratoId: string, atividadeId: string): Promise<{ vinculadas: LinhaComprovante[]; disponiveis: LinhaComprovante[] }> {
    await this.atividade(this.db.manager, contratoId, atividadeId);
    const linhas: LinhaComprovante[] = await this.db.manager.query(`
      SELECT c.id, c.nome_original AS "nomeOriginal", ev.tipo_evidencia AS "tipoEvidencia",
             c.status, c.entregavel_id AS "entregavelId", (av.atividade_id IS NOT NULL) AS vinculado,
             (ae."atividadeId" IS NOT NULL AND ev.arquivado_em IS NULL AND NOT EXISTS (SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id))) AS vigente
        FROM comprovantes_evidencia c
        JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id
        LEFT JOIN atividade_entregaveis ae ON ae."atividadeId"=$2 AND ae."entregavelId"=c.entregavel_id
        LEFT JOIN atividade_comprovantes av ON av.comprovante_id=c.id AND av.atividade_id=$2 AND av.contrato_id=$1
       WHERE c.contrato_id=$1 AND (
         av.atividade_id IS NOT NULL
         OR (ae."atividadeId" IS NOT NULL AND ev.arquivado_em IS NULL
           AND c.status IN ('PENDENTE_VERIFICACAO','VERIFICADA')
           ${semDuplicidade}
           AND NOT EXISTS (
             SELECT 1 FROM comprovantes_evidencia nova WHERE nova.evidencia_esperada_id=c.evidencia_esperada_id
               AND (nova.criado_em,nova.id) > (c.criado_em,c.id)))
       )
       ORDER BY c.criado_em DESC,c.id DESC`, [contratoId, atividadeId]);
    return { vinculadas: linhas.filter(c => c.vinculado), disponiveis: linhas.filter(c => !c.vinculado) };
  }

  private async exigirPaisAbertos(m: EntityManager, contratoId:string, atividadeId:string, atividade:AtividadeEntity) {
      const bloqueios=await m.query(`SELECT 1 FROM ocorrencias o WHERE o.contrato_id=$1 AND o.substituida_em IS NULL AND o.status IN ('CONCLUIDO','CONCLUIDO_PARCIALMENTE','ENCERRADA','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO') AND (o.id=$3::uuid OR EXISTS(SELECT 1 FROM atividade_ocorrencias ao WHERE ao."atividadeId"=$2 AND ao."ocorrenciaId"=o.id AND ao."contratoId"=$1)) LIMIT 1`,[contratoId,atividadeId,atividade.ocorrenciaId??null]);
      if(bloqueios.length)throw new ConflictException('Reabra as ocorrências com decisão vigente antes de desvincular.');
      const bloqueiosPais=await m.query(`SELECT 1 FROM atividade_entregaveis ae JOIN entregaveis e ON e.id=ae."entregavelId" JOIN etapas et ON et.id=e.etapa_id WHERE ae."atividadeId"=$2 AND e.contrato_id=$1 AND (e.arquivado_em IS NOT NULL OR e.status_execucao IN ('CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO') OR et.arquivado_em IS NOT NULL OR et.conclusao_solicitada_em IS NOT NULL OR et.encerramento_solicitado_em IS NOT NULL OR et.status IN ('CONCLUIDA','CONCLUIDO_PARCIALMENTE','FINALIZADA','ENCERRADA')) LIMIT 1`,[contratoId,atividadeId]);
      if(bloqueiosPais.length)throw new ConflictException('Reabra o entregável ou a etapa antes de desvincular.');
  }

  async desvincular(contratoId:string,atividadeId:string,comprovanteId:string,ator:UsuarioAutenticado){
    if(!uuidValido(comprovanteId))throw new BadRequestException('Comprovante inválido');
    return this.db.transaction(async m=>{
      await exigirPermissaoTransacional(m,contratoId,ator,'editarAtividades');
      const contrato=await m.findOne(Contrato,{where:{id:contratoId},lock:{mode:'pessimistic_write'}});
      if(!contrato||contrato.arquivadoEm||contrato.conclusaoSolicitadaEm||contrato.encerramentoSolicitado||!FASES_OPERACIONAIS_CONTRATO.includes(contrato.status))throw new ConflictException('Reabra o contrato antes de alterar vínculos.');
      const atividade=await this.atividade(m,contratoId,atividadeId);
      if(atividade.status!=='REGISTRADA')throw new ConflictException('Reabra a atividade antes de desvincular evidências.');
      await this.exigirPaisAbertos(m,contratoId,atividadeId,atividade);
      const removidos=await m.query(`DELETE FROM atividade_comprovantes WHERE atividade_id=$1 AND contrato_id=$2 AND comprovante_id=$3 RETURNING comprovante_id`,[atividadeId,contratoId,comprovanteId]);
      // TypeORM PostgreSQL pode retornar [linhas, quantidade] para DELETE.
      const linhas=Array.isArray(removidos[0])?removidos[0]:removidos;
      if(!linhas.length)throw new NotFoundException('Vínculo não encontrado.');
      await this.auditoria.registrarNaTransacao(m,ator,{acao:AcaoAuditoria.ATIVIDADE_VINCULOS_ALTERADOS,entidadeTipo:'ATIVIDADE',entidadeId:atividadeId,dadosAnteriores:{comprovanteId},dadosPosteriores:{comprovanteId:null,acao:'DESVINCULOU_COMPROVANTE'}});
      return {vinculado:false};
    });
  }
  async vincular(contratoId: string, atividadeId: string, comprovanteId: string, ator: UsuarioAutenticado) {
    if (!uuidValido(comprovanteId)) throw new BadRequestException('Comprovante inválido');
    return this.db.transaction(async m => {
      await exigirPermissaoTransacional(m,contratoId,ator,'editarAtividades');
      const contrato = await m.findOne(Contrato, { where: { id: contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!contrato || contrato.arquivadoEm || contrato.conclusaoSolicitadaEm || contrato.encerramentoSolicitado || !FASES_OPERACIONAIS_CONTRATO.includes(contrato.status))
        throw new ConflictException('O contrato precisa estar aberto para vincular comprovantes');
      const atividade = await this.atividade(m, contratoId, atividadeId);
      if (atividade.status !== 'REGISTRADA') throw new ConflictException('Reabra a atividade antes de alterar evidências vinculadas');
      await this.exigirPaisAbertos(m,contratoId,atividadeId,atividade);
      const comprovantes: Array<{ id: string }> = await m.query(`
        SELECT c.id FROM comprovantes_evidencia c
          JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id AND ev.arquivado_em IS NULL
          JOIN atividade_entregaveis ae ON ae."atividadeId"=$2 AND ae."entregavelId"=c.entregavel_id
        WHERE c.id=$3 AND c.contrato_id=$1 AND c.status IN ('PENDENTE_VERIFICACAO','VERIFICADA')
          ${semDuplicidade}
          AND NOT EXISTS (SELECT 1 FROM comprovantes_evidencia n
            WHERE n.evidencia_esperada_id=c.evidencia_esperada_id
              AND (n.criado_em,n.id) > (c.criado_em,c.id))`, [contratoId, atividadeId, comprovanteId]);
      if (!comprovantes.length) throw new ConflictException('Selecione um comprovante atual, pendente ou verificado, sem duplicar a execução da atividade');
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
