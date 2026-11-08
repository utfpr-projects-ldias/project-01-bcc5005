import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ARMAZENAMENTO_ARQUIVOS, type ArmazenamentoArquivos } from '../armazenamento/contrato-armazenamento.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';

/** Exclusão definitiva apenas de contratos arquivados, com auditoria atômica.
 * O histórico de auditoria é mantido. Blobs são removidos somente após COMMIT.
 */
@Injectable()
export class ExclusaoContratoService {
  private readonly logger = new Logger(ExclusaoContratoService.name);
  constructor(private readonly db: DataSource, private readonly auditoria: AuditoriaService,
    @Inject(ARMAZENAMENTO_ARQUIVOS) private readonly armazenamento: ArmazenamentoArquivos) {}

  async excluir(contratoId: string, ator: UsuarioAutenticado) {
    if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
      throw new ForbiddenException('Somente o Administrador pode excluir contratos definitivamente.');
    }
    const chaves = await this.db.transaction(async manager => {
      const contratos = await manager.query(
        'SELECT id, codigo_publico, numero_contrato, arquivado_em FROM contratos WHERE id = $1 FOR UPDATE',
        [contratoId],
      ) as Array<{ id: string; codigo_publico: string; numero_contrato: string; arquivado_em: Date | null }>;
      const atual = contratos[0];
      if (!atual) throw new NotFoundException('Contrato não encontrado.');
      if (!atual.arquivado_em) throw new ConflictException('Arquive o contrato antes de excluí-lo.');

      // O evento precisa ser registrado antes do DELETE. Resolver o contexto
      // depois da exclusão faria o vínculo de auditoria falhar e reverter a transação.
      await this.auditoria.registrarNaTransacao(manager, ator, {
        acao: AcaoAuditoria.CONTRATO_EXCLUIDO, entidadeTipo: 'CONTRATO', entidadeId: contratoId,
        dadosAnteriores: { codigoPublico: atual.codigo_publico, numeroContrato: atual.numero_contrato, arquivado: true },
        dadosPosteriores: { excluidoDefinitivamente: true },
      });

      const comprovantes = await manager.query(
        'DELETE FROM comprovantes_evidencia WHERE contrato_id = $1 RETURNING storage_key', [contratoId],
      ) as Array<{ storage_key: string }>;
      const documentos = await manager.query(
        'DELETE FROM documentos_contratuais WHERE contrato_id = $1 RETURNING storage_key', [contratoId],
      ) as Array<{ storage_key: string }>;
      await manager.query(`DELETE FROM evidencias_esperadas WHERE entregavel_id IN
        (SELECT id FROM entregaveis WHERE contrato_id = $1)`, [contratoId]);
      await manager.query('DELETE FROM entregaveis WHERE contrato_id = $1', [contratoId]);
      await manager.query('DELETE FROM etapas WHERE contrato_id = $1', [contratoId]);
      await manager.query('DELETE FROM permissoes_contrato WHERE contrato_id = $1', [contratoId]);
      await manager.query('DELETE FROM contratos WHERE id = $1', [contratoId]);
      return [...comprovantes, ...documentos].map(item => item.storage_key);
    });

    // A falha de limpeza física não transforma um DELETE COMMITADO em HTTP 409.
    // Não expor storage keys nem dados privados nos logs ou respostas.
    let arquivosPendentes = 0;
    for (const chave of chaves) {
      try { await this.armazenamento.removerPersistido(chave); }
      catch { arquivosPendentes += 1; }
    }
    if (arquivosPendentes > 0) this.logger.error(`Exclusão confirmada; ${arquivosPendentes} arquivo(s) exigem reconciliação de limpeza.`);
    return { excluido: true, arquivosPendentes };
  }
}
