import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { bloquearIdentidade } from '../autorizacao/permissao-transacional.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';

/** Exclusão definitiva apenas de contratos arquivados, com auditoria atômica.
 * O histórico de auditoria é mantido. Contratos com arquivos não são excluíveis.
 */
@Injectable()
export class ExclusaoContratoService {
  constructor(private readonly db: DataSource, private readonly auditoria: AuditoriaService) {}

  async elegibilidade(contratoId: string, ator: UsuarioAutenticado) {
    if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) throw new ForbiddenException('Somente Administrador pode excluir contratos');
    return this.db.transaction(async manager => {
      if ((await bloquearIdentidade(manager, ator)).perfil !== PerfilUsuario.ADMINISTRADOR)
        throw new ForbiddenException('Somente Administrador pode excluir contratos');
      const [atual] = await manager.query('SELECT id, codigo_publico, numero_contrato, arquivado_em FROM contratos WHERE id = $1 FOR SHARE', [contratoId]);
      if (!atual) throw new NotFoundException('Contrato não encontrado.');
      if (!atual.arquivado_em) return { apto: false, motivo: 'Arquive o contrato antes de excluí-lo.' };
      const possui = await this.possuiDependencias(manager, contratoId);
      return { apto: !possui, motivo: possui ? 'Contrato possui execução ou histórico vinculado: mantenha-o arquivado.' : null };
    });
  }

  private async possuiDependencias(manager: EntityManager, contratoId: string): Promise<boolean> {
      const dependencias = await manager.query(`SELECT
        EXISTS(SELECT 1 FROM atividades WHERE "contratoId" = $1)
        OR EXISTS(SELECT 1 FROM ocorrencias WHERE contrato_id = $1)
        OR EXISTS(SELECT 1 FROM configuracoes_ocorrencias WHERE contrato_id = $1)
        OR EXISTS(SELECT 1 FROM metas_marco WHERE contrato_id = $1)
        OR EXISTS(SELECT 1 FROM vinculos_metas_marco WHERE contrato_id = $1)
        OR EXISTS(SELECT 1 FROM comprovantes_evidencia WHERE contrato_id = $1)
        OR EXISTS(SELECT 1 FROM documentos_contratuais WHERE contrato_id = $1)
        OR EXISTS(SELECT 1 FROM execucoes_entregavel WHERE contrato_id = $1)
        OR EXISTS(SELECT 1 FROM execucoes_quantitativas_diretas WHERE contrato_id = $1)
        OR EXISTS(SELECT 1 FROM evidencias_esperadas ev JOIN entregaveis e ON e.id=ev.entregavel_id
          WHERE e.contrato_id = $1 AND (ev.rascunho_envio IS NOT NULL OR EXISTS(
            SELECT 1 FROM eventos_auditoria a WHERE a.contrato_id=$1 AND a.entidade_id=e.id::text
            AND (a.dados_anteriores->>'itemId'=ev.id::text OR a.dados_posteriores->>'itemId'=ev.id::text)
            AND (a.dados_anteriores ? 'declaracaoPreliminar' OR a.dados_posteriores ? 'declaracaoPreliminar' OR a.dados_posteriores->>'operacao'='EDITAR_VINCULOS'))))
        OR EXISTS(SELECT 1 FROM entregaveis WHERE contrato_id=$1 AND (data_efetiva_marco IS NOT NULL OR COALESCE(percentual_execucao,0)>0 OR COALESCE(quantidade_realizada,0)>0 OR status_execucao IN ('CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO')))
        OR EXISTS(SELECT 1 FROM etapas WHERE contrato_id=$1 AND status IN ('CONCLUIDA','CONCLUIDO_PARCIALMENTE','FINALIZADA','ENCERRADA'))
        OR EXISTS(SELECT 1 FROM contratos WHERE id=$1 AND (status NOT IN ('PLANEJAMENTO','EM_EXECUCAO') OR reaberto_em IS NOT NULL OR conclusao_solicitada_em IS NOT NULL OR encerrado_em IS NOT NULL))
        OR EXISTS(SELECT 1 FROM eventos_auditoria a WHERE a.contrato_id=$1 AND a.entidade_tipo='CONTRATO'
          AND (a.acao='CONTRATO_REABERTO' OR (a.acao='CONTRATO_STATUS_ALTERADO' AND (
            a.dados_posteriores->>'status' IN ('CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','ENCERRADO','CANCELADO','SUSPENSO')
            OR a.dados_posteriores->>'conclusaoSolicitadaEm' IS NOT NULL))))
        AS possui_dependencias`, [contratoId]) as Array<{ possui_dependencias: boolean }>;
    return Boolean(dependencias[0]?.possui_dependencias);
  }

  async excluir(contratoId: string, ator: UsuarioAutenticado) {
    if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
      throw new ForbiddenException('Somente o Administrador pode excluir contratos definitivamente.');
    }
    await this.db.transaction(async manager => {
      if ((await bloquearIdentidade(manager, ator)).perfil !== PerfilUsuario.ADMINISTRADOR)
        throw new ForbiddenException('Somente Administrador pode excluir contratos');
      const contratos = await manager.query(
        'SELECT id, codigo_publico, numero_contrato, arquivado_em FROM contratos WHERE id = $1 FOR UPDATE',
        [contratoId],
      ) as Array<{ id: string; codigo_publico: string; numero_contrato: string; arquivado_em: Date | null }>;
      const atual = contratos[0];
      if (!atual) throw new NotFoundException('Contrato não encontrado.');
      if (!atual.arquivado_em) throw new ConflictException('Arquive o contrato antes de excluí-lo.');

      // A exclusão definitiva não pode destruir o histórico operacional nem
      // tentar DELETE de linhas protegidas por FK RESTRICT. O teste é feito
      // sob o lock do contrato, antes de auditoria ou remoção dos blobs.
      if (await this.possuiDependencias(manager, contratoId))
        throw new ConflictException('Contrato possui execução ou histórico vinculado: mantenha-o arquivado; exclusão definitiva não é permitida');

      // O evento precisa ser registrado antes do DELETE. Resolver o contexto
      // depois da exclusão faria o vínculo de auditoria falhar e reverter a transação.
      await this.auditoria.registrarNaTransacao(manager, ator, {
        acao: AcaoAuditoria.CONTRATO_EXCLUIDO, entidadeTipo: 'CONTRATO', entidadeId: contratoId,
        dadosAnteriores: { codigoPublico: atual.codigo_publico, numeroContrato: atual.numero_contrato, arquivado: true },
        dadosPosteriores: { excluidoDefinitivamente: true },
      });

      await manager.query(`DELETE FROM evidencias_esperadas WHERE entregavel_id IN
        (SELECT id FROM entregaveis WHERE contrato_id = $1)`, [contratoId]);
      await manager.query('DELETE FROM entregaveis WHERE contrato_id = $1', [contratoId]);
      await manager.query('DELETE FROM etapas WHERE contrato_id = $1', [contratoId]);
      await manager.query('DELETE FROM permissoes_contrato WHERE contrato_id = $1', [contratoId]);
      await manager.query('DELETE FROM contratos WHERE id = $1', [contratoId]);
    });
    return { excluido: true, arquivosPendentes: 0 };
  }
}
