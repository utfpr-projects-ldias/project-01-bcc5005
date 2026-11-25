import { exigirPermissaoTransacional } from '../autorizacao/permissao-transacional.js';
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
    const resultado = await m.query('SELECT id, status, arquivado_em, conclusao_solicitada_em FROM contratos WHERE id = $1 FOR UPDATE', [contratoId]) as Array<{id:string;status:string;arquivado_em:Date|null;conclusao_solicitada_em:Date|null}>;
    if (!resultado.length) throw new NotFoundException('Contrato não encontrado');
    const c=resultado[0];
    if(c.arquivado_em || c.conclusao_solicitada_em || ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','ENCERRADO','SUSPENSO','CANCELADO'].includes(c.status))
      throw new ConflictException('Resolva a situação do contrato antes de excluir itens do planejamento');
  }
  /** FKs RESTRICT devem permanecer: não apagar histórico para liberar um DELETE.
   * Detecta antes do primeiro DELETE as referências operacionais ao planejamento.
   * O lock do contrato serializa estas consultas com os fluxos operacionais normais.
   */
  private async exigirAusenciaDeHistoricoOperacional(m: EntityManager, contratoId: string,
    id: string, tipo: 'etapa' | 'entregavel'): Promise<void> {
    const rows = await m.query(`SELECT EXISTS (
      SELECT 1 FROM entregaveis e
      WHERE e.contrato_id = $1 AND ${tipo === 'etapa' ? 'e.etapa_id' : 'e.id'} = $2
        AND (
          COALESCE(e.percentual_execucao,0)>0 OR COALESCE(e.quantidade_realizada,0)>0 OR e.data_efetiva_marco IS NOT NULL
          OR e.reaberto_em IS NOT NULL OR e.regularizacao_documental_solicitada
          OR e.status_execucao IN ('CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO')
          OR EXISTS (SELECT 1 FROM ocorrencias o WHERE o.entregavel_id = e.id AND o.contrato_id = $1)
          OR EXISTS (SELECT 1 FROM configuracoes_ocorrencias cfg WHERE cfg.entregavel_id = e.id AND cfg.contrato_id = $1)
          OR EXISTS (SELECT 1 FROM execucoes_entregavel l WHERE l.entregavel_id=e.id AND l.contrato_id=$1)
          OR EXISTS (SELECT 1 FROM evidencias_esperadas ev WHERE ev.entregavel_id=e.id AND (ev.rascunho_envio IS NOT NULL OR EXISTS (SELECT 1 FROM comprovantes_evidencia c WHERE c.evidencia_esperada_id=ev.id) OR EXISTS(SELECT 1 FROM eventos_auditoria a WHERE a.contrato_id=$1 AND a.entidade_id=e.id::text AND (a.dados_anteriores->>'itemId'=ev.id::text OR a.dados_posteriores->>'itemId'=ev.id::text) AND (a.dados_anteriores ? 'declaracaoPreliminar' OR a.dados_posteriores ? 'declaracaoPreliminar' OR a.dados_posteriores->>'operacao'='EDITAR_VINCULOS'))))
          OR EXISTS (SELECT 1 FROM execucoes_quantitativas_diretas md WHERE md.entregavel_id=e.id AND md.contrato_id=$1)
          OR EXISTS (SELECT 1 FROM metas_marco mm WHERE mm.entregavel_id = e.id AND mm.contrato_id = $1)
          OR EXISTS (SELECT 1 FROM atividade_entregaveis ae WHERE ae."entregavelId" = e.id AND ae."contratoId" = $1)
        )
    ) AS possui`, [contratoId, id]) as Array<{ possui: boolean }>;
    if (rows[0]?.possui) throw new ConflictException('Há ocorrências, atividades, configurações ou metas vinculadas. Preserve o histórico; não é possível excluir definitivamente');
  }

  private async exigirPaiEditavel(m: EntityManager, contratoId: string, entregavelId: string, evidencia: boolean) {
    const [pai] = await m.query(`SELECT t.arquivado_em, t.status, t.conclusao_solicitada_em, t.encerramento_solicitado_em,
      e.arquivado_em AS entregavel_arquivado, e.status_execucao, e.regularizacao_documental_solicitada
      FROM entregaveis e JOIN etapas t ON t.id=e.etapa_id AND t.contrato_id=e.contrato_id
      WHERE e.id=$1 AND e.contrato_id=$2`, [entregavelId, contratoId]);
    if (!pai) throw new NotFoundException('Etapa ou entregável não encontrado');
    if (pai.arquivado_em || pai.conclusao_solicitada_em || pai.encerramento_solicitado_em ||
        ['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(pai.status) ||
        pai.regularizacao_documental_solicitada || ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(pai.status_execucao) ||
        (evidencia && pai.entregavel_arquivado))
      throw new ConflictException('Resolva a situação da etapa e do entregável antes de excluir itens');
  }

  private async exigirAusenciaDeDecisoes(m: EntityManager, contratoId: string, id: string, tipo: 'etapa' | 'entregavel') {
    const [r] = await m.query(`SELECT EXISTS (
      SELECT 1 FROM eventos_auditoria a WHERE a.contrato_id=$1 AND (
        (a.entidade_tipo='ETAPA' AND $3='etapa' AND a.entidade_id=$2::uuid::text
          AND (a.acao='ETAPA_REABERTA' OR a.dados_posteriores->>'solicitacao' IS NOT NULL
            OR a.dados_posteriores->>'status' IN ('CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA')))
        OR (a.entidade_tipo='ENTREGAVEL' AND a.entidade_id IN (SELECT e.id::text FROM entregaveis e WHERE e.contrato_id=$1 AND
          (($3='etapa' AND e.etapa_id=$2::uuid) OR ($3='entregavel' AND e.id=$2::uuid)))
          AND (a.acao='ENTREGAVEL_REABERTO' OR a.dados_posteriores->>'statusExecucao' IN ('CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO')))
      )) AS possui`,[contratoId,id,tipo]);
    if (r?.possui) throw new ConflictException('Há decisões históricas neste planejamento. Preserve o registro arquivado.');
  }

  async excluir(tipo: TipoAlvo, contratoId: string, id: string, ator: UsuarioAutenticado,
    entregavelId?: string) {
    let resultado: { chaves: string[]; totalEvidencias: number; totalEntregaveis: number };
    try {
      resultado = await this.db.transaction(async m => {
      // Todas as operações têm a raiz bloqueada: exclusões e criações não podem
      // observar uma sequência parcialmente compactada.
      await exigirPermissaoTransacional(m, contratoId, ator, tipo === 'etapa' ? 'excluirEtapasArquivadas' : tipo === 'entregavel' ? 'excluirEntregaveisArquivados' : 'excluirEvidenciasArquivadas');
      await this.contrato(m, contratoId);
      let codigo: unknown;
      let acao: AcaoAuditoria;
      let entidadeId = id;
      let sequenciaRemovida: number | null = null;
      let totalEntregaveis = 0;
      let totalEvidencias = 0;
      const rows: ComprovanteApagado[] = [];
      if (tipo === 'evidencia') {
        if (!entregavelId) throw new NotFoundException('Entregável não encontrado');
        const entregavel = await m.query('SELECT id FROM entregaveis WHERE id=$1 AND contrato_id=$2', [entregavelId, contratoId]) as unknown[];
        if (!entregavel.length) throw new NotFoundException('Entregável não encontrado neste contrato');
        await this.exigirPaiEditavel(m, contratoId, entregavelId, true);
        const encontrados = await m.query('SELECT id, codigo_publico, arquivado_em FROM evidencias_esperadas WHERE id=$1 AND entregavel_id=$2 FOR UPDATE', [id, entregavelId]) as Array<{ codigo_publico: number; arquivado_em: Date | null }>;
        if (!encontrados.length) throw new NotFoundException('Evidência não encontrada neste entregável');
        if (!encontrados[0].arquivado_em) throw new ConflictException('Arquive a evidência antes de excluí-la');
        const [historico] = await m.query(`SELECT EXISTS(SELECT 1 FROM evidencias_esperadas ev WHERE ev.id=$1 AND ev.entregavel_id=$2 AND (ev.rascunho_envio IS NOT NULL OR EXISTS(SELECT 1 FROM comprovantes_evidencia c WHERE c.evidencia_esperada_id=ev.id) OR EXISTS(SELECT 1 FROM eventos_auditoria a WHERE a.contrato_id=$3 AND a.entidade_id=$2::uuid::text AND (a.dados_anteriores->>'itemId'=ev.id::text OR a.dados_posteriores->>'itemId'=ev.id::text) AND (a.dados_anteriores ? 'declaracaoPreliminar' OR a.dados_posteriores ? 'declaracaoPreliminar' OR a.dados_posteriores->>'operacao'='EDITAR_VINCULOS')))) AS possui`,[id,entregavelId,contratoId]);
        if (historico?.possui) throw new ConflictException('Evidência com declaração ou comprovantes: preserve o histórico através do arquivamento.');
        codigo = encontrados[0].codigo_publico;
        acao = AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_EXCLUIDA;
        entidadeId = entregavelId;
      } else if (tipo === 'entregavel') {
        const registro = await this.registro(m, 'entregaveis', id, contratoId);
        await this.exigirPaiEditavel(m, contratoId, id, false);
        codigo = registro.codigo_publico;
        acao = AcaoAuditoria.ENTREGAVEL_EXCLUIDO;
      } else {
        const registro = await this.registro(m, 'etapas', id, contratoId);
        if (registro.conclusao_solicitada_em || registro.encerramento_solicitado_em || ['CONCLUIDA','CONCLUIDO_PARCIALMENTE','FINALIZADA','ENCERRADA'].includes(String(registro.status)))
          throw new ConflictException('Preserve a etapa com decisão operacional no histórico');
        codigo = registro.codigo_publico;
        sequenciaRemovida = Number(registro.sequencia);
        acao = AcaoAuditoria.ETAPA_EXCLUIDA;
      }

      if (tipo === 'etapa' || tipo === 'entregavel') {
        await this.exigirAusenciaDeHistoricoOperacional(m, contratoId, id, tipo);
        await this.exigirAusenciaDeDecisoes(m, contratoId, id, tipo);
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
        await m.query('DELETE FROM evidencias_esperadas WHERE id=$1 AND entregavel_id=$2', [id, entregavelId]);
        totalEvidencias = 1;
      } else if (tipo === 'entregavel') {
        const removidas = await m.query('DELETE FROM evidencias_esperadas WHERE entregavel_id=$1 RETURNING id', [id]) as unknown[];
        await m.query('DELETE FROM entregaveis WHERE id=$1 AND contrato_id=$2', [id, contratoId]);
        totalEvidencias = removidas.length;
        totalEntregaveis = 1;
      } else {
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
        const deslocadas = await m.query('UPDATE etapas SET sequencia = sequencia - 1 WHERE contrato_id=$1 AND sequencia>$2 RETURNING id, nome, sequencia', [contratoId, sequenciaRemovida]) as [Array<{ id:string; nome:string; sequencia:number }>, number] | Array<{ id:string; nome:string; sequencia:number }>;
        // O driver PostgreSQL do TypeORM pode retornar [linhas, affected] em UPDATE.
        const linhas = (Array.isArray(deslocadas[0]) ? deslocadas[0] : deslocadas) as Array<{id:string;nome:string;sequencia:number}>;
        for (const etapa of linhas) await this.auditoria.registrarNaTransacao(m, ator, {
          acao: AcaoAuditoria.ETAPA_REORDENADA, entidadeTipo: 'ETAPA', entidadeId: etapa.id,
          dadosAnteriores: { sequencia: etapa.sequencia + 1, nome: etapa.nome }, dadosPosteriores: { sequencia: etapa.sequencia, nome: etapa.nome },
        });
        totalEntregaveis = excluidos.length;
        totalEvidencias = removidas.length;
      }
      return { chaves: rows.map(r => r.storage_key), totalEvidencias, totalEntregaveis };
      });
    } catch (erro: unknown) {
      // Uma dependência criada concorrentemente ou não coberta pela pré-consulta
      // continua protegida pela FK. Traduzir a violação sem vazar SQL ao cliente.
      if (erro && typeof erro === 'object' && 'driverError' in erro &&
          (erro.driverError as { code?: string } | undefined)?.code === '23503')
        throw new ConflictException('O item ainda possui vínculos dependentes e não pode ser excluído definitivamente');
      throw erro;
    }

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
