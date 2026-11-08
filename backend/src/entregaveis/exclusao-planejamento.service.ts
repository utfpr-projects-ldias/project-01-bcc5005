import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { ARMAZENAMENTO_ARQUIVOS, type ArmazenamentoArquivos } from '../armazenamento/contrato-armazenamento.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';

type ComprovanteApagado = { storage_key: string };
type TipoAlvo = 'etapa' | 'entregavel' | 'evidencia';

/** Remove o cadastro arquivado e seus descendentes, no escopo do contrato.
 * A auditoria da operação é persistida na mesma transação que os DELETEs.
 * A limpeza física ocorre DEPOIS do commit: não perder blobs se o SQL falhar.
 */
@Injectable()
export class ExclusaoPlanejamentoService {
  private readonly logger = new Logger(ExclusaoPlanejamentoService.name);
  constructor(private readonly db: DataSource, private readonly auditoria: AuditoriaService,
    @Inject(ARMAZENAMENTO_ARQUIVOS) private readonly arquivos: ArmazenamentoArquivos) {}

  private async registro(m: EntityManager, tabela: string, id: string, contratoId: string) {
    const registros = await m.query(`SELECT * FROM "${tabela}" WHERE "id" = $1 AND "contrato_id" = $2 FOR UPDATE`, [id, contratoId]) as Array<Record<string, unknown>>;
    if (!registros.length) throw new NotFoundException('Item não encontrado neste contrato');
    if (!registros[0].arquivado_em) throw new ConflictException('Arquive este item antes de excluí-lo definitivamente');
    return registros[0];
  }
  private async contrato(m: EntityManager, contratoId: string) {
    const resultado = await m.query('SELECT id FROM contratos WHERE id = $1 FOR UPDATE', [contratoId]) as Array<{id:string}>;
    if (!resultado.length) throw new NotFoundException('Contrato não encontrado');
  }
  async excluir(tipo: TipoAlvo, contratoId: string, id: string, ator: UsuarioAutenticado,
    entregavelId?: string) {
    const resultado = await this.db.transaction(async m => {
      // Todas as operações têm a raiz bloqueada: exclusões e criações não podem
      // observar uma sequência parcialmente compactada.
      await this.contrato(m, contratoId);
      let codigo: unknown;
      let acao: AcaoAuditoria;
      let entidadeId = id;
      let sequenciaRemovida: number | null = null;
      let totalEntregaveis = 0;
      let totalEvidencias = 0;
      let rows: ComprovanteApagado[] = [];
      if (tipo === 'evidencia') {
        if (!entregavelId) throw new NotFoundException('Entregável não encontrado');
        const entregavel = await m.query('SELECT id FROM entregaveis WHERE id=$1 AND contrato_id=$2', [entregavelId, contratoId]) as unknown[];
        if (!entregavel.length) throw new NotFoundException('Entregável não encontrado neste contrato');
        const encontrados = await m.query('SELECT id, codigo_publico, arquivado_em FROM evidencias_esperadas WHERE id=$1 AND entregavel_id=$2 FOR UPDATE', [id, entregavelId]) as Array<{ codigo_publico: number; arquivado_em: Date | null }>;
        if (!encontrados.length) throw new NotFoundException('Evidência não encontrada neste entregável');
        if (!encontrados[0].arquivado_em) throw new ConflictException('Arquive a evidência antes de excluí-la');
        codigo = encontrados[0].codigo_publico;
        acao = AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_EXCLUIDA;
        entidadeId = entregavelId;
      } else if (tipo === 'entregavel') {
        const registro = await this.registro(m, 'entregaveis', id, contratoId);
        codigo = registro.codigo_publico;
        acao = AcaoAuditoria.ENTREGAVEL_EXCLUIDO;
      } else {
        const registro = await this.registro(m, 'etapas', id, contratoId);
        codigo = registro.codigo_publico;
        sequenciaRemovida = Number(registro.sequencia);
        acao = AcaoAuditoria.ETAPA_EXCLUIDA;
      }

      // REGRA CRÍTICA: a auditoria encontra o contrato pela entidade no banco.
      // Registrar somente depois do DELETE faz a resolução de ETAPA/ENTREGAVEL
      // falhar e provoca rollback. Como tudo ocorre na mesma transação, o evento
      // também é revertido caso qualquer DELETE posterior falhe.
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao, entidadeTipo: tipo === 'etapa' ? 'ETAPA' : 'ENTREGAVEL', entidadeId,
        dadosAnteriores: { id, codigoPublico: codigo, tipo },
        dadosPosteriores: { excluido: true },
      });

      if (tipo === 'evidencia') {
        rows = await m.query('DELETE FROM comprovantes_evidencia WHERE evidencia_esperada_id=$1 RETURNING storage_key', [id]) as ComprovanteApagado[];
        await m.query('DELETE FROM evidencias_esperadas WHERE id=$1 AND entregavel_id=$2', [id, entregavelId]);
        totalEvidencias = 1;
      } else if (tipo === 'entregavel') {
        rows = await m.query('DELETE FROM comprovantes_evidencia WHERE entregavel_id=$1 RETURNING storage_key', [id]) as ComprovanteApagado[];
        const removidas = await m.query('DELETE FROM evidencias_esperadas WHERE entregavel_id=$1 RETURNING id', [id]) as unknown[];
        await m.query('DELETE FROM entregaveis WHERE id=$1 AND contrato_id=$2', [id, contratoId]);
        totalEvidencias = removidas.length;
        totalEntregaveis = 1;
      } else {
        rows = await m.query(`DELETE FROM comprovantes_evidencia WHERE contrato_id=$1 AND entregavel_id IN
          (SELECT id FROM entregaveis WHERE etapa_id=$2 AND contrato_id=$1) RETURNING storage_key`, [contratoId, id]) as ComprovanteApagado[];
        const removidas = await m.query(`DELETE FROM evidencias_esperadas WHERE entregavel_id IN
          (SELECT id FROM entregaveis WHERE etapa_id=$1 AND contrato_id=$2) RETURNING id`, [id, contratoId]) as unknown[];
        const excluidos = await m.query('DELETE FROM entregaveis WHERE etapa_id=$1 AND contrato_id=$2 RETURNING id', [id, contratoId]) as unknown[];
        // UNIQUE(contrato_id, sequencia) é DEFERRABLE desde HU06-01.
        // A etapa #N não muda de ID/código público; só a POSIÇÃO da lista é
        // compactada para que posição 4 passe a 3 quando posição 3 é excluída.
        await m.query('SET CONSTRAINTS "uq_etapas_contrato_sequencia" DEFERRED');
        await m.query('DELETE FROM etapas WHERE id=$1 AND contrato_id=$2', [id, contratoId]);
        if (sequenciaRemovida === null || !Number.isSafeInteger(sequenciaRemovida) || sequenciaRemovida < 1)
          throw new ConflictException('Sequência da etapa excluída inválida');
        await m.query('UPDATE etapas SET sequencia = sequencia - 1 WHERE contrato_id=$1 AND sequencia>$2', [contratoId, sequenciaRemovida]);
        totalEntregaveis = excluidos.length;
        totalEvidencias = removidas.length;
      }
      return { chaves: rows.map(r => r.storage_key), totalEvidencias, totalEntregaveis };
    });

    let limpezaPendente = 0;
    // SQL confirmado. Falha física não transforma um DELETE COMMITADO em
    // HTTP 409, pois a interface faria o registro "voltar" sem existir.
    // O operador recebe a pendência; jamais expor storage_key em HTTP/log.
    for (const chave of resultado.chaves) {
      try { await this.arquivos.removerPersistido(chave); }
      catch { limpezaPendente++; }
    }
    if (limpezaPendente) {
      this.logger.error(`Exclusão confirmada com ${limpezaPendente} arquivo(s) pendente(s) de limpeza no volume`);
    }
    return { id, excluido: true, comprovantesRemovidos: resultado.chaves.length,
      evidenciasRemovidas: resultado.totalEvidencias, entregaveisRemovidos: resultado.totalEntregaveis,
      limpezaPendente };
  }
}
