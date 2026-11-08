import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, type EntityManager, type Repository } from 'typeorm';

import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { EventoAuditoria } from '../auditoria/evento-auditoria.entity.js';
import { documentacaoVerificada, filhosEmRevisao } from '../entregaveis/conclusao-documental.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { PermissaoContrato } from '../autorizacao/permissao-contrato.entity.js';
import { permissoesEfetivas } from '../autorizacao/permissoes-granulares.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { Contrato } from './contrato.entity.js';
import type { AtualizarContratoDto } from './dto/atualizar-contrato.dto.js';
import type { CriarContratoDto } from './dto/criar-contrato.dto.js';

/** Códigos PostgreSQL mapeados para respostas HTTP padronizadas (issue HU05-02). */
const PG_CHECK_VIOLATION = '23514';
const PG_UNIQUE_VIOLATION = '23505';
const PG_FK_VIOLATION = '23503';
// Restricao unica criada pela migration 1793800000000-CodigoPublicoContratos.
const CONSTRAINT_CODIGO_PUBLICO = 'uq_contratos_codigo_publico';
/**
 * Regras de negócio da API de contratos — HU05-02.
 *
 * Autorização já foi resolvida pelo `AutorizacaoGuard` global (TEC07-02):
 * sessão, usuário de domínio ativo e política aplicada. Aqui só persistimos,
 * validamos vigência/calendário e auditamos.
 *
 * **Atomicidade**: `criar` e `atualizar` delegam a transação a
 * `AuditoriaService.executarComAuditoria` — o contrato e o evento
 * `eventos_auditoria` são gravados no mesmo commit/rollback. Em `atualizar`,
 * eventos específicos de negócio (RB-18/RB-19) também entram na mesma
 * transação via `registrarNaTransacao(manager, ...)`, sem abrir sub-transação.
 */
function validarJustificativaReabertura(motivo: string): void {
  const tamanho = motivo.trim().length;
  if (tamanho < 15 || tamanho > 200) throw new BadRequestException('Informe uma justificativa de 15 a 200 caracteres');
}

@Injectable()
export class ContratosService {
  constructor(
    @InjectRepository(Contrato)
    private readonly contratos: Repository<Contrato>,
    private readonly auditoria: AuditoriaService,
  ) {}

  async criar(
    dto: CriarContratoDto,
    ator: UsuarioAutenticado,
  ): Promise<Contrato> {
    this.validarVigencia(dto.inicioVigencia, dto.terminoVigencia);
    // Estados finais e administrativos nunca são aceitos no cadastro inicial.
    if (dto.status !== 'PLANEJAMENTO' && dto.status !== 'EM_EXECUCAO')
      throw new BadRequestException('O contrato deve iniciar em Planejamento ou Em execução');

    return this.auditoria.executarComAuditoria(ator, async manager => {
      const repo = manager.getRepository(Contrato);
      await this.validarResponsavel(manager, dto.responsavelInternoId);
      // A sequência PG é atômica entre processos, não depende do relógio nem de
      // números aleatórios. Preserve códigos históricos; não reutilize lacunas.
      const numeros = await manager.query("SELECT nextval('seq_contratos_codigo_publico')::integer AS numero") as Array<{numero: number|string}>;
      const numero = Number(numeros[0]?.numero);
      if (!Number.isSafeInteger(numero) || numero < 0 || numero > 99999) {
        throw new ConflictException('Limite de códigos públicos de contrato atingido');
      }
      const contrato = repo.create({
        codigoPublico: String(numero).padStart(5, '0'),
        numeroContrato: dto.numeroContrato.trim(),
        processoAdministrativo: dto.processoAdministrativo ?? null,
        orgaoContratante: dto.orgaoContratante.trim(),
        unidadeResponsavel: dto.unidadeResponsavel ?? null,
        objeto: dto.objeto.trim(),
        descricao: dto.descricao ?? null,
        dataAssinatura: dto.dataAssinatura ?? null,
        inicioVigencia: dto.inicioVigencia,
        terminoVigencia: dto.terminoVigencia,
        status: dto.status,
        responsavelInternoId: dto.responsavelInternoId ?? null,
        fiscalGestor: dto.fiscalGestor ?? null,
        modoCalculo: dto.modoCalculo,
        observacoes: dto.observacoes ?? null,
      });
      const salvo = await salvarContrato(repo, contrato, false);
      return { resultado: salvo, evento: {
        acao: AcaoAuditoria.CONTRATO_CRIADO, entidadeTipo: 'CONTRATO',
        entidadeId: salvo.id, dadosAnteriores: null, dadosPosteriores: serializarContrato(salvo),
      }};
    });
  }

  async listar(ator: UsuarioAutenticado): Promise<Contrato[]> {
    if (ator.perfil === PerfilUsuario.ADMINISTRADOR) {
      return this.contratos.find({ order: { inicioVigencia: 'DESC', numeroContrato: 'ASC' } });
    }
    // Vínculo explícito OU atribuição ativa como responsável (somente leitura).
    // A seleção é escopada ao usuário autenticado; nunca aceitar ID pela query.
    return this.contratos.createQueryBuilder('c')
      .leftJoin('permissoes_contrato', 'p', 'p.contrato_id = c.id AND p.usuario_id = :usuarioId', { usuarioId: ator.id })
      .where('(p.usuario_id IS NOT NULL OR c.responsavelInternoId = :usuarioId)', { usuarioId: ator.id })
      .andWhere('c.arquivado_em IS NULL')
      .orderBy('c.inicioVigencia', 'DESC')
      .addOrderBy('c.numeroContrato', 'ASC')
      .getMany();
  }

  /** Apenas IDs de contratos autorizados ao usuário. Cada checagem usa o mesmo
   * predicado SQL utilizado pela operação de conclusão. Limitar concorrência. */
  async pendentesConclusao(ator: UsuarioAutenticado): Promise<string[]> {
    const visiveis = (await this.listar(ator)).filter(c => !c.arquivadoEm &&
      c.status !== 'CONCLUIDO' && c.status !== 'ENCERRADO' && c.status !== 'SUSPENSO' && c.status !== 'CANCELADO');
    const resultado: string[] = [];
    for (let pos = 0; pos < visiveis.length; pos += 5) {
      const bloco = visiveis.slice(pos, pos + 5);
      const completos = await Promise.all(bloco.map(async contrato => {
        if (!await documentacaoVerificada(this.contratos.manager, contrato.id)) return false;
        // Reabertura é uma situação explícita até "Fechar novamente".
        // Edições/reconclusões dos filhos não pulam esta confirmação contratual.
        if (contrato.reabertoEm) return false;
        // Reabrir uma etapa/entregável sem reverificar não cria pendência falsa.
        const reabertos = await this.contratos.manager.query(`
          SELECT (EXISTS (SELECT 1 FROM etapas WHERE contrato_id = $1
                    AND arquivado_em IS NULL AND reaberto_em IS NOT NULL)
               OR EXISTS (SELECT 1 FROM entregaveis WHERE contrato_id = $1
                    AND arquivado_em IS NULL AND reaberto_em IS NOT NULL)
               OR EXISTS (SELECT 1 FROM evidencias_esperadas ev INNER JOIN entregaveis en ON en.id = ev.entregavel_id
                    WHERE en.contrato_id = $1 AND en.arquivado_em IS NULL
                      AND ev.arquivado_em IS NULL AND ev.reaberto_em IS NOT NULL)) AS pendentes
        `, [contrato.id]) as Array<{ pendentes: boolean }>;
        if (reabertos[0]?.pendentes) return false;
        const abertos = await this.contratos.manager.query(`SELECT EXISTS (
           SELECT 1 FROM etapas WHERE contrato_id = $1 AND arquivado_em IS NULL
             AND status IS DISTINCT FROM 'CONCLUIDA'
        ) OR EXISTS (
           SELECT 1 FROM entregaveis WHERE contrato_id = $1 AND arquivado_em IS NULL
             AND status_execucao IS DISTINCT FROM 'CONCLUIDO'
        ) AS pendentes`, [contrato.id]) as Array<{ pendentes: boolean }>;
        return !abertos[0]?.pendentes;
      }));
      bloco.forEach((c, i) => { if (completos[i]) resultado.push(c.id); });
    }
    return resultado;
  }

  /** Eventos do próprio contrato, sem entregar snapshots JSONB ou credenciais.
   * ACL de leitura da raiz + permissão administrativa/edição para trilha RF-42. */
  async historico(id: string, ator: UsuarioAutenticado) {
    await this.detalhar(id);
    if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
      const vinculo = await this.contratos.manager.getRepository(PermissaoContrato)
        .findOneBy({ usuarioId: ator.id, contratoId: id });
      if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar,
        vinculo.permissoesDetalhadas).editarContrato)
        throw new ForbiddenException('Sem permissão para consultar a rastreabilidade contratual');
    }
    const eventos = await this.contratos.manager.getRepository(EventoAuditoria).find({
      where: { contratoId: id },
      order: { registradoEm: 'DESC', id: 'DESC' }, take: 100,
    });
    const rotulos: Record<string, string> = {
      CONTRATO_CRIADO: 'Contrato cadastrado', CONTRATO_EDITADO: 'Contrato atualizado',
      CONTRATO_PRAZO_ALTERADO: 'Prazo do contrato alterado',
      CONTRATO_STATUS_ALTERADO: 'Situação do contrato alterada',
      CONTRATO_ARQUIVADO: 'Contrato arquivado', CONTRATO_REATIVADO: 'Contrato reativado',
      CONTRATO_REABERTO: 'Contrato reaberto',
      DOCUMENTO_ANEXADO: 'Documento anexado', DOCUMENTO_METADADOS_ALTERADOS: 'Metadados do documento alterados',
      DOCUMENTO_VERIFICADO: 'Documento verificado', DOCUMENTO_REABERTO: 'Verificação do documento reaberta',
      DOCUMENTO_ARQUIVADO: 'Documento arquivado', DOCUMENTO_REATIVADO: 'Documento reativado',
      CONTRATO_ORDEM_ETAPAS_ALTERADA: 'Bloqueio da ordem das etapas alterado',
      ETAPA_CRIADA: 'Etapa cadastrada', ETAPA_EDITADA: 'Dados da etapa editados',
      ETAPA_ARQUIVADA: 'Etapa arquivada', ETAPA_REATIVADA: 'Etapa reativada',
      ETAPA_REORDENADA: 'Posição da etapa alterada',
      ETAPA_REABERTA: 'Etapa reaberta', ETAPA_STATUS_ALTERADO: 'Situação da etapa alterada',
      ETAPA_PRAZO_ALTERADO: 'Prazos da etapa alterados',
    };
    // Os autores são resolvidos pelo identificador do SuperTokens já gravado no
    // evento imutável, nunca por nome/e-mail recebidos do cliente. Uma conta
    // excluída permanece no histórico como 'autor não disponível'.
    const autores = [...new Set(eventos.map(e => e.atorSupertokensUserId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0))];
    const usuariosHistorico = autores.length ? await this.contratos.manager.getRepository(Usuario).find({
      where: { supertokensUserId: In(autores) },
      select: { supertokensUserId: true, nome: true, email: true },
    }) : [];
    const porAutor = new Map(usuariosHistorico.map(u => [u.supertokensUserId, u]));
    // Projetar somente nomes de contexto; nunca expor os snapshots JSONB ao cliente.
    // A consulta fica dentro do contrato já autorizado acima.
    const contextos = eventos.some(e => e.entidadeTipo !== 'CONTRATO')
      ? await this.contratos.manager.query(`
      SELECT a.id, a.entidade_tipo AS tipo, a.entidade_id AS recurso,
        et.nome AS etapa, en.nome AS entregavel, ee.tipo_evidencia AS evidencia,
        COALESCE(doc.nome_original, ce.nome_original) AS arquivo,
        doc.categoria AS categoria_documento,
        COALESCE(a.dados_posteriores->>'nome', a.dados_anteriores->>'nome') AS nome_evento,
        COALESCE(a.dados_posteriores->>'tipoEvidencia', a.dados_anteriores->>'tipoEvidencia') AS evidencia_evento
      FROM eventos_auditoria a
      LEFT JOIN entregaveis en ON a.entidade_tipo = 'ENTREGAVEL' AND a.entidade_id = en.id::text AND en.contrato_id = $1
      LEFT JOIN etapas et ON (a.entidade_tipo = 'ETAPA' AND a.entidade_id = et.id::text AND et.contrato_id = $1)
        OR (en.etapa_id = et.id AND et.contrato_id = $1)
      LEFT JOIN evidencias_esperadas ee ON ee.entregavel_id = en.id AND ee.id::text = COALESCE(
        a.dados_posteriores->>'evidenciaEsperadaId', a.dados_anteriores->>'evidenciaEsperadaId',
        a.dados_posteriores->>'itemId', a.dados_anteriores->>'itemId')
      LEFT JOIN documentos_contratuais doc ON a.entidade_tipo = 'DOCUMENTO'
        AND a.entidade_id = doc.id::text AND doc.contrato_id = $1
      LEFT JOIN comprovantes_evidencia ce ON ce.contrato_id = $1 AND ce.id::text = COALESCE(
        a.dados_posteriores->>'comprovanteId', a.dados_anteriores->>'comprovanteId')
      WHERE a.contrato_id = $1 AND a.id = ANY($2::uuid[])
      `, [id, eventos.map(e => e.id)]) as Array<{
        id: string; tipo: string; etapa: string | null; entregavel: string | null;
        evidencia: string | null; arquivo: string | null; categoria_documento: string | null; nome_evento: string | null; evidencia_evento: string | null;
      }> : [];
    const porId = new Map(contextos.map(c => [c.id, c]));
    return eventos.map(evento => {
      const contexto = porId.get(evento.id);
      const autor = porAutor.get(evento.atorSupertokensUserId);
      const tipo = evento.entidadeTipo;
      const antesEvento = evento.dadosAnteriores ?? {};
      const depoisEvento = evento.dadosPosteriores ?? {};
      const statusAntes = typeof antesEvento['status'] === 'string' ? antesEvento['status'] : null;
      const statusDepois = typeof depoisEvento['status'] === 'string' ? depoisEvento['status'] : null;
      const fase = (valor: string | null) => valor === 'PLANEJAMENTO' ? 'Planejamento'
        : valor === 'EM_EXECUCAO' ? 'Em execução' : valor === 'CONCLUIDO' ? 'Concluído'
        : valor === 'ENCERRADO' ? 'Encerrado' : valor === 'SUSPENSO' ? 'Suspenso'
        : valor === 'CANCELADO' ? 'Cancelado' : valor === 'EM_ENCERRAMENTO' ? 'Em encerramento'
        : valor;
      const motivo = depoisEvento['motivo'];
      const mudancaVisivel = evento.acao === AcaoAuditoria.CONTRATO_ORDEM_ETAPAS_ALTERADA
        ? [antesEvento['ordemEtapasBloqueada'] ? 'Bloqueada' : 'Liberada',
           depoisEvento['ordemEtapasBloqueada'] ? 'Bloqueada' : 'Liberada']
        : evento.acao === AcaoAuditoria.ETAPA_REORDENADA
          ? [`Posição ${antesEvento['sequencia'] ?? '?'}`, `Posição ${depoisEvento['sequencia'] ?? '?'}`]
        : evento.acao === AcaoAuditoria.ETAPA_ARQUIVADA
          ? ['Ativa', 'Arquivada']
        : evento.acao === AcaoAuditoria.ETAPA_REATIVADA
          ? ['Arquivada', 'Ativa']
        : evento.acao === AcaoAuditoria.CONTRATO_ARQUIVADO
        ? ['Não arquivado', 'Arquivado']
        : evento.acao === AcaoAuditoria.CONTRATO_REATIVADO
          ? ['Arquivado', 'Reativado']
          : motivo === 'RETOMADA_SUSPENSAO' || depoisEvento['decisao'] === 'REVERSAO_DE_CANCELAMENTO'
          ? [fase(statusAntes) ?? 'Situação anterior', `Em revisão · ${fase(statusDepois) ?? 'Planejamento'}`]
        : motivo === 'REVISAO_ENCERRADA_PENDENTE_CONCLUSAO'
            ? ['Em revisão', 'Pendente de conclusão']
            : motivo === 'DEVOLVIDO_PARA_REVISAO'
              ? ['Pendente de conclusão', `Em revisão · ${fase(statusDepois) ?? 'Planejamento'}`]
              : motivo === 'RETOMADA_OPERACIONAL_APOS_REVISAO'
                ? ['Em revisão', fase(statusDepois) ?? 'Planejamento']
                : evento.acao === AcaoAuditoria.CONTRATO_REABERTO
                  ? [fase(statusAntes) ?? 'Situação final', `Em revisão · ${fase(statusDepois) ?? 'Planejamento'}`]
                  : statusAntes && statusDepois && statusAntes !== statusDepois
                    ? [fase(statusAntes)!, fase(statusDepois)!] : null;
      const nome = tipo === 'CONTRATO' || tipo === 'DOCUMENTO' ? null : tipo === 'ETAPA'
        ? contexto?.etapa ?? contexto?.nome_evento ?? 'Etapa histórica'
        : contexto?.entregavel ?? contexto?.nome_evento ?? 'Entregável histórico';
      return {
        id: evento.id, acao: evento.acao,
        descricao: rotulos[evento.acao] ?? (tipo === 'DOCUMENTO' ? 'Documento contratual alterado' : tipo === 'ETAPA' ? 'Etapa alterada' :
          tipo === 'ENTREGAVEL' ? 'Entregável ou evidência alterados' : 'Atualização contratual registrada'),
        ocorridoEm: evento.registradoEm, entidadeTipo: tipo,
        ator: autor ? { nome: autor.nome ?? 'Nome não informado', email: autor.email } : null,
        contexto: [contexto?.etapa && tipo !== 'ETAPA' ? `Etapa: ${contexto.etapa}` : null,
          nome ? `${tipo === 'ETAPA' ? 'Etapa' : 'Entregável'}: ${nome}` : null,
          tipo === 'DOCUMENTO' ? `Documento ${contexto?.categoria_documento === 'CONTRATO_PRINCIPAL' ? 'principal' : 'anexo'}: ${contexto?.arquivo ?? 'histórico'}` : null,
          contexto?.evidencia ?? contexto?.evidencia_evento
            ? `Evidência: ${contexto.evidencia ?? contexto.evidencia_evento}` : null].filter(Boolean).join(' · '),
        nomeArquivo: contexto?.arquivo ?? null,
        justificativa: typeof evento.dadosPosteriores?.['justificativa'] === 'string' ? evento.dadosPosteriores['justificativa'].slice(0, 200) : null,
        situacaoAnterior: (tipo === 'CONTRATO' || evento.acao === AcaoAuditoria.ETAPA_REORDENADA ||
          evento.acao === AcaoAuditoria.ETAPA_ARQUIVADA || evento.acao === AcaoAuditoria.ETAPA_REATIVADA) ? mudancaVisivel?.[0] ?? null
          : typeof evento.dadosAnteriores?.['status'] === 'string'
            ? evento.dadosAnteriores['status'] : typeof evento.dadosAnteriores?.['statusExecucao'] === 'string'
              ? evento.dadosAnteriores['statusExecucao'] : null,
        situacaoAtual: (tipo === 'CONTRATO' || evento.acao === AcaoAuditoria.ETAPA_REORDENADA ||
          evento.acao === AcaoAuditoria.ETAPA_ARQUIVADA || evento.acao === AcaoAuditoria.ETAPA_REATIVADA) ? mudancaVisivel?.[1] ?? null
          : typeof evento.dadosPosteriores?.['status'] === 'string'
            ? evento.dadosPosteriores['status'] : typeof evento.dadosPosteriores?.['statusExecucao'] === 'string'
              ? evento.dadosPosteriores['statusExecucao'] : null,
      };
    });
  }

  async consultarAcesso(id: string, ator: UsuarioAutenticado) {
    // Mesmo estando sob guard: não confirmar ID inexistente.
    await this.detalhar(id);
    if (ator.perfil === PerfilUsuario.ADMINISTRADOR) return {
      podeEditar: true, permissoes: permissoesEfetivas(ator.perfil, true, null),
    };
    const vinculo = await this.contratos.manager.getRepository(PermissaoContrato)
      .findOneBy({ usuarioId: ator.id, contratoId: id });
    const podeEditar = ator.perfil === PerfilUsuario.GESTOR && Boolean(vinculo?.podeEditar);
    // Sem vínculo, a responsabilidade administrativa NÃO concede mutações.
    const permissoes = vinculo
      ? permissoesEfetivas(ator.perfil, podeEditar, vinculo.permissoesDetalhadas)
      : permissoesEfetivas('COLABORADOR', false, { enviarComprovantes: false, verificarComprovantes: false });
    return { podeEditar, permissoes };
  }

  async detalhar(id: string): Promise<Contrato> {
    const encontrado = await this.contratos.findOneBy({ id });
    if (!encontrado) throw new NotFoundException('Contrato não encontrado');
    return encontrado;
  }

  /** Alterna arquivamento sem deletar contrato, documentos, etapas ou eventos.
   * Exclusivo do ADMIN no guard; valida novamente dentro da transação auditada.
   */
  async alterarArquivamento(id: string, arquivar: boolean, ator: UsuarioAutenticado, motivo?: string): Promise<Contrato> {
    if (!arquivar && motivo !== undefined) validarJustificativaReabertura(motivo);
    if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) throw new ForbiddenException('Somente Administrador pode arquivar contratos');
    return this.auditoria.executarComAuditoria(ator, async manager => {
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.status === 'CANCELADO') throw new ConflictException('Contrato cancelado requer reversão específica antes de arquivar');
      if (contrato.status === 'SUSPENSO') throw new ConflictException('Retome o contrato suspenso antes de arquivar');
      if (arquivar && ((contrato.status === 'CONCLUIDO' || contrato.status === 'ENCERRADO') ||
        (contrato.reabertoEm === null && await documentacaoVerificada(manager, id))))
        throw new ConflictException('Contrato concluído: reabra antes de arquivar.');
      if (Boolean(contrato.arquivadoEm) === arquivar) {
        throw new ConflictException(arquivar ? 'Contrato já está arquivado' : 'Contrato não está arquivado');
      }
      const anterior = { arquivado: Boolean(contrato.arquivadoEm), status: contrato.status };
      contrato.arquivadoEm = arquivar ? new Date() : null;
      contrato.arquivadoPor = arquivar ? ator.id : null;
      const salvo = await repo.save(contrato);
      return { resultado: salvo, evento: {
        acao: arquivar ? AcaoAuditoria.CONTRATO_ARQUIVADO : AcaoAuditoria.CONTRATO_REATIVADO,
        entidadeTipo: 'CONTRATO' as const, entidadeId: id,
        dadosAnteriores: anterior,
        dadosPosteriores: { arquivado: arquivar, status: salvo.status, ...(!arquivar && motivo ? { justificativa: motivo.trim() } : {}) },
      }};
    });
  }

  /** Conclusão explícita pelo responsável autorizado, somente após comprovação total.
   * Nunca confunde um checklist 100% com uma decisão operacional de conclusão. */
  async concluir(id: string, ator: UsuarioAutenticado): Promise<Contrato> {
    return this.auditoria.executarComAuditoria(ator, async manager => {
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm) throw new ConflictException('Reative o contrato arquivado antes de concluir');
      if (['CONCLUIDO', 'ENCERRADO'].includes(contrato.status) && !contrato.reabertoEm) throw new ConflictException('Contrato já possui decisão final');
      if (contrato.reabertoEm) throw new ConflictException('Encerre a revisão antes de concluir o contrato');
      if (contrato.status === 'SUSPENSO' || contrato.status === 'CANCELADO')
        throw new ConflictException('Contrato suspenso ou cancelado não pode ser concluído');
      if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
        const vinculo = await manager.getRepository(PermissaoContrato).findOneBy({ usuarioId: ator.id, contratoId: id });
        if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar,
          vinculo.permissoesDetalhadas).concluirContrato)
          throw new ForbiddenException('Sem permissão para concluir contrato');
      }
      if (!await documentacaoVerificada(manager, id) || await filhosEmRevisao(manager, id))
        throw new ConflictException('Conclua novamente as etapas, entregáveis e evidências em revisão antes do contrato');
      const abertas = await manager.query(`
        SELECT EXISTS (SELECT 1 FROM etapas WHERE contrato_id = $1 AND arquivado_em IS NULL
            AND status IS DISTINCT FROM 'CONCLUIDA') OR
          EXISTS (SELECT 1 FROM entregaveis WHERE contrato_id = $1 AND arquivado_em IS NULL
            AND status_execucao IS DISTINCT FROM 'CONCLUIDO') AS pendentes`, [id]) as Array<{ pendentes: boolean }>;
      if (abertas[0]?.pendentes) throw new ConflictException('Conclua primeiro cada etapa e entregável');
      const principal = await manager.query(`SELECT EXISTS (
        SELECT 1 FROM documentos_contratuais
        WHERE contrato_id = $1 AND categoria = 'CONTRATO_PRINCIPAL'
          AND arquivado_em IS NULL AND verificado_em IS NOT NULL AND reaberto_em IS NULL
      ) AS verificado`, [id]) as Array<{ verificado: boolean }>;
      if (!principal[0]?.verificado)
        throw new ConflictException('Anexe e verifique o PDF principal antes de concluir o contrato');
      const anterior = { status: contrato.status, reabertoEm: contrato.reabertoEm ?? null };
      contrato.status = 'CONCLUIDO' as Contrato['status'];
      contrato.reabertoEm = null;
      const salvo = await repo.save(contrato);
      return { resultado: salvo, evento: {
        acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO, entidadeTipo: 'CONTRATO' as const,
        entidadeId: id, dadosAnteriores: anterior,
        dadosPosteriores: { status: salvo.status, reabertoEm: null, motivo: 'CONCLUSAO_EXPLICITA' },
      }};
    });
  }

  /** Suspensão do contrato, independente de arquivamento/conclusão/cancelamento.
   * O estado anterior permanece no evento imutável, permitindo retomar sem
   * coluna adicional. Lock do contrato serializa decisões concorrentes. */
  async alterarSuspensao(id: string, suspender: boolean, ator: UsuarioAutenticado, motivo?: string): Promise<Contrato> {
    if (!suspender && motivo !== undefined) validarJustificativaReabertura(motivo);
    return this.auditoria.executarComAuditoria(ator, async manager => {
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm) throw new ConflictException('Reative o contrato arquivado antes de alterar a suspensão');
      const chave = suspender ? 'suspenderContrato' : 'retomarContrato';
      if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
        const vinculo = await manager.getRepository(PermissaoContrato)
          .findOneBy({ usuarioId: ator.id, contratoId: id });
        if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas)[chave])
          throw new ForbiddenException('Sem permissão para suspender ou retomar contrato');
      }
      const anterior = contrato.status;
      const revisaoAnterior = contrato.reabertoEm ?? null;
      if (suspender) {
        if (!['PLANEJAMENTO', 'EM_EXECUCAO', 'EM_ENCERRAMENTO'].includes(anterior))
          throw new ConflictException('Somente contratos em planejamento ou execução podem ser suspensos');
        contrato.status = 'SUSPENSO' as Contrato['status'];
      } else {
        if (anterior !== 'SUSPENSO') throw new ConflictException('Contrato não está suspenso');
        // Nunca inventar um estado de retorno: sem evento histórico, negar.
        const historico = await manager.query(`SELECT dados_anteriores->>'status' AS anterior
          FROM eventos_auditoria
          WHERE contrato_id = $1 AND entidade_tipo = 'CONTRATO'
            AND acao = $2 AND dados_posteriores->>'status' = 'SUSPENSO'
            AND (dados_posteriores->>'motivo' = 'SUSPENSAO_CONTRATUAL'
              OR dados_posteriores->>'motivo' IS NULL)
          ORDER BY registrado_em DESC, id DESC LIMIT 1`, [id, AcaoAuditoria.CONTRATO_STATUS_ALTERADO]) as Array<{ anterior: string | null }>;
        const retorno = historico[0]?.anterior;
        if (retorno !== 'PLANEJAMENTO' && retorno !== 'EM_EXECUCAO' && retorno !== 'EM_ENCERRAMENTO')
          throw new ConflictException('Suspensão histórica sem situação anterior identificável; requer análise administrativa');
        contrato.status = retorno as Contrato['status'];
        // Toda retomada reabre a revisão: o contrato não deve cair diretamente
        // em Pendente de conclusão só porque os filhos já estavam completos.
        contrato.reabertoEm = new Date();
      }
      const salvo = await repo.save(contrato);
      return { resultado: salvo, evento: {
        acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO, entidadeTipo: 'CONTRATO' as const,
        entidadeId: id, dadosAnteriores: { status: anterior, reabertoEm: revisaoAnterior },
        dadosPosteriores: { status: salvo.status, reabertoEm: salvo.reabertoEm ?? null, motivo: suspender ? 'SUSPENSAO_CONTRATUAL' : 'RETOMADA_SUSPENSAO', ...(!suspender && motivo ? { justificativa: motivo.trim() } : {}) },
      } };
    });
  }

  /** Cancelamento administrativo, independente de arquivar e de concluir.
   * A auditoria guarda motivo/ator e decisão anterior; nenhuma etapa é alterada. */
  async alterarCancelamento(id: string, cancelar: boolean, ator: UsuarioAutenticado, motivo?: string): Promise<Contrato> {
    const justificativa = typeof motivo === 'string' ? motivo.trim() : '';
    if (cancelar && (justificativa.length < 15 || justificativa.length > 200))
      throw new BadRequestException('O cancelamento exige justificativa de 15 a 200 caracteres');
    if (!cancelar && motivo !== undefined) validarJustificativaReabertura(motivo);
    return this.auditoria.executarComAuditoria(ator, async manager => {
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm) throw new ConflictException('Reative o contrato arquivado antes de alterar seu cancelamento');
      const chave = cancelar ? 'cancelarContrato' : 'reverterCancelamentoContrato';
      if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
        const vinculo = await manager.getRepository(PermissaoContrato)
          .findOneBy({ usuarioId: ator.id, contratoId: id });
        if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar,
          vinculo.permissoesDetalhadas)[chave])
          throw new ForbiddenException('Sem permissão específica para esta decisão de cancelamento');
      }
      if (cancelar && !['PLANEJAMENTO', 'EM_EXECUCAO'].includes(contrato.status))
        throw new ConflictException('Não é possível cancelar contrato com decisão final ou situação administrativa incompatível');
      if (!cancelar && contrato.status !== 'CANCELADO')
        throw new ConflictException('O contrato não está cancelado');
      const anterior = { status: contrato.status, reabertoEm: contrato.reabertoEm ?? null };
      contrato.status = (cancelar ? 'CANCELADO' : 'PLANEJAMENTO') as Contrato['status'];
      // A reversão abre revisão administrativa; cancelamento não deve exibir
      // tag de revisão enquanto estiver em vigor.
      contrato.reabertoEm = cancelar ? null : new Date();
      const salvo = await repo.save(contrato);
      return { resultado: salvo, evento: {
        acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO, entidadeTipo: 'CONTRATO' as const,
        entidadeId: id, dadosAnteriores: anterior,
        dadosPosteriores: { status: salvo.status, reabertoEm: salvo.reabertoEm,
          decisao: cancelar ? 'CANCELAMENTO_EXPLICITO' : 'REVERSAO_DE_CANCELAMENTO',
          ...(justificativa ? { justificativa } : {}) },
      } };
    });
  }

  /** Encerramento antecipado NÃO é conclusão total. Mantém os estados dos filhos.
   * Uma competência de conclusão explícita, razão obrigatória e lock serializam a decisão. */
  async encerrarAntecipadamente(id: string, motivo: string, ator: UsuarioAutenticado): Promise<Contrato> {
    const justificativa = typeof motivo === 'string' ? motivo.trim() : '';
    if (justificativa.length < 15 || justificativa.length > 200)
      throw new BadRequestException('Informe uma justificativa de 15 a 200 caracteres');
    return this.auditoria.executarComAuditoria(ator, async manager => {
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm ||
        ['CONCLUIDO', 'ENCERRADO', 'CANCELADO', 'SUSPENSO'].includes(contrato.status))
        throw new ConflictException('Contrato não está em situação elegível ao encerramento antecipado');
      if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
        const vinculo = await manager.getRepository(PermissaoContrato).findOneBy({ usuarioId: ator.id, contratoId: id });
        if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar,
          vinculo.permissoesDetalhadas).encerrarContrato)
          throw new ForbiddenException('Sem permissão específica para encerrar antecipadamente o contrato');
      }
      // Encerramento administrativo não depende de execução ou etapas já cadastradas.
      // Diferentemente de CONCLUIDO, mantém as pendências e sua justificativa na auditoria.
      const anterior = { status: contrato.status, reabertoEm: contrato.reabertoEm ?? null,
        encerradoEm: contrato.encerradoEm ?? null };
      contrato.status = 'ENCERRADO' as Contrato['status'];
      contrato.reabertoEm = null;
      contrato.encerradoEm = new Date();
      contrato.encerradoPor = ator.id;
      contrato.motivoEncerramento = justificativa;
      const salvo = await repo.save(contrato);
      return { resultado: salvo, evento: {
        acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO, entidadeTipo: 'CONTRATO' as const,
        entidadeId: id, dadosAnteriores: anterior,
        dadosPosteriores: { status: salvo.status, encerradoEm: salvo.encerradoEm,
          justificativa, motivo: 'ENCERRAMENTO_ANTECIPADO_SEM_CONCLUSAO_TOTAL' },
      }};
    });
  }

  /** Fecha uma revisão sem concluir o contrato.
   * A comprovação e as conclusões persistidas dos filhos são reavaliadas sob lock;
   * só a confirmação autorizada independente pode alterar status para CONCLUIDO. */
  async fecharRevisao(id: string, ator: UsuarioAutenticado, motivo?: string): Promise<Contrato> {
    if (motivo !== undefined) validarJustificativaReabertura(motivo);
    return this.auditoria.executarComAuditoria(ator, async manager => {
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm || (contrato.status === 'CONCLUIDO' || contrato.status === 'ENCERRADO') || !contrato.reabertoEm)
        throw new ConflictException('Somente contratos em revisão podem encerrar a revisão');
      if (contrato.status === 'SUSPENSO' || contrato.status === 'CANCELADO')
        throw new ConflictException('Contrato suspenso ou cancelado não permite encerrar revisão');
      if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
        const vinculo = await manager.getRepository(PermissaoContrato).findOneBy({ usuarioId: ator.id, contratoId: id });
        if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar,
          vinculo.permissoesDetalhadas).editarContrato)
          throw new ForbiddenException('Sem permissão para encerrar revisão contratual');
      }
      if (!await documentacaoVerificada(manager, id) || await filhosEmRevisao(manager, id))
        throw new ConflictException('Conclua primeiro as etapas, entregáveis e evidências');
      const abertos = await manager.query(`SELECT EXISTS (
        SELECT 1 FROM etapas WHERE contrato_id = $1 AND arquivado_em IS NULL
          AND status IS DISTINCT FROM 'CONCLUIDA') OR EXISTS (
        SELECT 1 FROM entregaveis WHERE contrato_id = $1 AND arquivado_em IS NULL
          AND status_execucao IS DISTINCT FROM 'CONCLUIDO') AS pendentes`, [id]) as Array<{ pendentes: boolean }>;
      if (abertos[0]?.pendentes) throw new ConflictException('Ainda há etapas ou entregáveis não concluídos');
      const anterior = { status: contrato.status, reabertoEm: contrato.reabertoEm };
      contrato.reabertoEm = null;
      const salvo = await repo.save(contrato);
      return { resultado: salvo, evento: {
        acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO, entidadeTipo: 'CONTRATO' as const,
        entidadeId: id, dadosAnteriores: anterior,
        dadosPosteriores: { status: salvo.status, reabertoEm: null, motivo: 'REVISAO_ENCERRADA_PENDENTE_CONCLUSAO', ...(motivo ? { justificativa: motivo.trim() } : {}) },
      } };
    });
  }

  /** Rejeita a aprovação do contrato e devolve a carteira à revisão.
   * A competência é concluirContrato; NÃO usa reabrirContrato, que só se aplica
   * a contratos já concluídos. Histórico e filhos permanecem intactos. */
  async devolverParaRevisao(id: string, ator: UsuarioAutenticado): Promise<Contrato> {
    return this.auditoria.executarComAuditoria(ator, async manager => {
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm || contrato.reabertoEm ||
        contrato.status === 'CONCLUIDO' || contrato.status === 'ENCERRADO' || contrato.status === 'SUSPENSO' || contrato.status === 'CANCELADO')
        throw new ConflictException('Somente contrato pendente de conclusão pode ser devolvido para revisão');
      if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
        const vinculo = await manager.getRepository(PermissaoContrato).findOneBy({ usuarioId: ator.id, contratoId: id });
        if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).concluirContrato)
          throw new ForbiddenException('Sem permissão para deliberar sobre a conclusão contratual');
      }
      if (!await documentacaoVerificada(manager, id) || await filhosEmRevisao(manager, id))
        throw new ConflictException('O contrato não está pendente de conclusão; regularize antes seus filhos');
      const abertos = await manager.query(`SELECT EXISTS (
        SELECT 1 FROM etapas WHERE contrato_id = $1 AND arquivado_em IS NULL
          AND status IS DISTINCT FROM 'CONCLUIDA') OR EXISTS (
        SELECT 1 FROM entregaveis WHERE contrato_id = $1 AND arquivado_em IS NULL
          AND status_execucao IS DISTINCT FROM 'CONCLUIDO') AS pendentes`, [id]) as Array<{ pendentes: boolean }>;
      if (abertos[0]?.pendentes) throw new ConflictException('O contrato não está pronto para decisão');
      const anterior = { status: contrato.status, reabertoEm: contrato.reabertoEm ?? null };
      contrato.reabertoEm = new Date();
      const salvo = await repo.save(contrato);
      return { resultado: salvo, evento: {
        acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO, entidadeTipo: 'CONTRATO' as const,
        entidadeId: id, dadosAnteriores: anterior,
        dadosPosteriores: { status: salvo.status, reabertoEm: salvo.reabertoEm, motivo: 'DEVOLVIDO_PARA_REVISAO' },
      } };
    });
  }

  /** Reabertura OPERACIONAL explícita, auditada, sem alterar comprovações. */
  async reabrir(id: string, ator: UsuarioAutenticado, motivo?: string): Promise<Contrato> {
    if (motivo !== undefined) validarJustificativaReabertura(motivo);
    return this.auditoria.executarComAuditoria(ator, async manager => {
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm) throw new ConflictException('Reative o contrato arquivado antes de reabri-lo');
      if (contrato.reabertoEm) throw new ConflictException('Contrato já foi reaberto');
      if (contrato.status !== 'CONCLUIDO' && contrato.status !== 'ENCERRADO')
        throw new ConflictException('Somente contratos com decisão final podem ser reabertos');
      const anterior = contrato.status;
      contrato.status = 'PLANEJAMENTO' as Contrato['status'];
      contrato.encerradoEm = null;
      contrato.encerradoPor = null;
      // Motivo anterior permanece no histórico da auditoria; campo limpo na reabertura.
      contrato.motivoEncerramento = null;
      contrato.reabertoEm = new Date();
      const salvo = await repo.save(contrato);
      return { resultado: salvo, evento: {
        acao: AcaoAuditoria.CONTRATO_REABERTO, entidadeTipo: 'CONTRATO' as const,
        entidadeId: id, dadosAnteriores: { status: anterior, reabertoEm: null },
        dadosPosteriores: { status: salvo.status, reabertoEm: salvo.reabertoEm, ...(motivo ? { justificativa: motivo.trim() } : {}) },
      } };
    });
  }

  /** Admin ou delegação explícita; guard valida antes desta chamada.
   * A trava é mantida no contrato com auditoria na mesma transação.
   * O mesmo lock de linha é usado pelo serviço de reordenação. */
  async alterarBloqueioOrdem(id: string, bloqueada: boolean, ator: UsuarioAutenticado): Promise<Contrato> {
    return this.auditoria.executarComAuditoria(ator, async (manager) => {
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.createQueryBuilder('c')
        .setLock('pessimistic_write').where('c.id = :id', { id }).getOne();
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm) throw new ConflictException('Contrato arquivado não pode ter sua ordem alterada.');
      if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
        const vinculo = await manager.getRepository(PermissaoContrato).findOneBy({ usuarioId: ator.id, contratoId: id });
        if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).bloquearOrdemEtapas) {
          throw new ForbiddenException('Sem permissão para bloquear ou liberar a ordem deste contrato.');
        }
      }
      const anterior = Boolean(contrato.ordemEtapasBloqueada);
      contrato.ordemEtapasBloqueada = bloqueada;
      const salvo = await repo.save(contrato);
      return { resultado: salvo, evento: {
        acao: AcaoAuditoria.CONTRATO_ORDEM_ETAPAS_ALTERADA,
        entidadeTipo: 'CONTRATO' as const, entidadeId: id,
        dadosAnteriores: { ordemEtapasBloqueada: anterior },
        dadosPosteriores: { ordemEtapasBloqueada: bloqueada },
      } };
    });
  }

  async atualizar(
    id: string,
    dto: AtualizarContratoDto,
    ator: UsuarioAutenticado,
  ): Promise<Contrato> {
    return this.auditoria.executarComAuditoria(ator, async (manager) => {
      const repo = manager.getRepository(Contrato);
      const existente = await repo.findOneBy({ id });
      if (!existente) throw new NotFoundException('Contrato não encontrado');
      if (existente.arquivadoEm) throw new ConflictException('Contrato arquivado. Reative antes de editar.');
      if (existente.status === 'CONCLUIDO' || existente.status === 'ENCERRADO' || existente.status === 'CANCELADO' || existente.status === 'SUSPENSO' ||
        (existente.reabertoEm === null && await documentacaoVerificada(manager, id)))
        throw new ConflictException('Contrato concluído: reabra antes de editar.');
      if (dto.responsavelInternoId !== undefined) {
        if (ator.perfil !== PerfilUsuario.ADMINISTRADOR && dto.responsavelInternoId !== existente.responsavelInternoId) {
          throw new ForbiddenException('Somente Administrador pode alterar o responsável interno');
        }
        if (dto.responsavelInternoId !== existente.responsavelInternoId) {
          await this.validarResponsavel(manager, dto.responsavelInternoId);
        }
      }

      const inicioAnterior = existente.inicioVigencia;
      const terminoAnterior = existente.terminoVigencia;
      const statusAnterior = existente.status;
      const revisaoAnterior = existente.reabertoEm;

      // Vigência combinada — o DTO parcial não vê o registro atual.
      const inicioVigencia = dto.inicioVigencia ?? inicioAnterior;
      const terminoVigencia = dto.terminoVigencia ?? terminoAnterior;
      this.validarVigencia(inicioVigencia, terminoVigencia);

      const antes = serializarContrato(existente);
      if (dto.status !== undefined && dto.status !== 'PLANEJAMENTO' && dto.status !== 'EM_EXECUCAO')
        throw new ForbiddenException('Este status exige uma transição específica autorizada; não pode ser definido pela edição comum');
      if (dto.retomarOperacao) {
        throw new ConflictException('A revisão só pode ser encerrada pela ação Fechar novamente.');
      }
      aplicarAtualizacao(existente, dto);
      existente.inicioVigencia = inicioVigencia;
      existente.terminoVigencia = terminoVigencia;

      const salvo = await salvarContrato(repo, existente);
      const depois = serializarContrato(salvo);

      // Eventos específicos exigidos pelo PRD, na mesma transação.
      // RB-19: alteração de status; RB-18: alteração de prazo; EC-02 preserva
      // os valores anteriores na trilha.
      if (salvo.status !== statusAnterior) {
        await this.auditoria.registrarNaTransacao(manager, ator, {
          acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO,
          entidadeTipo: 'CONTRATO',
          entidadeId: salvo.id,
          dadosAnteriores: { status: statusAnterior, ...(revisaoAnterior ? { reabertoEm: revisaoAnterior } : {}) },
          dadosPosteriores: { status: salvo.status },
        });
      }
      if (
        salvo.inicioVigencia !== inicioAnterior ||
        salvo.terminoVigencia !== terminoAnterior
      ) {
        await this.auditoria.registrarNaTransacao(manager, ator, {
          acao: AcaoAuditoria.CONTRATO_PRAZO_ALTERADO,
          entidadeTipo: 'CONTRATO',
          entidadeId: salvo.id,
          dadosAnteriores: {
            inicioVigencia: inicioAnterior,
            terminoVigencia: terminoAnterior,
          },
          dadosPosteriores: {
            inicioVigencia: salvo.inicioVigencia,
            terminoVigencia: salvo.terminoVigencia,
          },
        });
      }

      // Evento principal: snapshot completo para reconstrução.
      return {
        resultado: salvo,
        evento: {
          acao: AcaoAuditoria.CONTRATO_EDITADO,
          entidadeTipo: 'CONTRATO',
          entidadeId: salvo.id,
          dadosAnteriores: antes,
          dadosPosteriores: depois,
        },
      };
    });
  }

  private async validarResponsavel(manager: EntityManager, id: string | null | undefined): Promise<void> {
    if (!id) return; // Responsável é opcional no PRD.
    const responsavel = await manager.getRepository(Usuario).findOneBy({ id, ativo: true });
    if (!responsavel) throw new BadRequestException('Responsável interno inexistente ou inativo');
  }

  /** Calendário real + coerência de vigência (issue + §8.2). */
  private validarVigencia(inicio: string, termino: string): void {
    if (!isCalendarioValido(inicio) || !isCalendarioValido(termino)) {
      throw new BadRequestException('Datas de vigência inválidas');
    }
    if (inicio > termino) {
      throw new BadRequestException(
        'Término da vigência deve ser maior ou igual ao início',
      );
    }
  }
}

/**
 * Save com tradução de códigos SQLSTATE (issue: padronizar 400/409).
 * Fora da classe porque é stateless — não precisa de `this`.
 */
async function salvarContrato(
  repo: Repository<Contrato>,
  contrato: Contrato,
  traduzirUnicidade = true,
): Promise<Contrato> {
  try {
    return await repo.save(contrato);
  } catch (error: unknown) {
    if (error instanceof QueryFailedError) {
      const erroDriver = error.driverError as { code?: string; constraint?: string };
      const codigo =
        erroDriver.code ?? (error as QueryFailedError & { code?: string }).code;

      if (codigo === PG_CHECK_VIOLATION) {
        throw new BadRequestException('Dados violam restrição de integridade');
      }

      if (codigo === PG_UNIQUE_VIOLATION) {
        if (!traduzirUnicidade && erroDriver.constraint === CONSTRAINT_CODIGO_PUBLICO) throw error;
        throw new ConflictException('Registro conflita com outro existente');
      }

      if (codigo === PG_FK_VIOLATION) {
        throw new BadRequestException(
          'Referência inválida (responsável ou contrato)',
        );
      }
    }

    throw error;
  }
}

/**
 * Aplica só chaves presentes no DTO. `undefined` preserva; `null` (só em
 * opcionais) limpa. Campos obrigatórios já foram rejeitados em `null` pelo
 * `@ValidateIf` do DTO.
 */
function aplicarAtualizacao(alvo: Contrato, dto: AtualizarContratoDto): void {
  const camposOpcionais: (keyof AtualizarContratoDto)[] = [
    'processoAdministrativo',
    'unidadeResponsavel',
    'descricao',
    'dataAssinatura',
    'responsavelInternoId',
    'fiscalGestor',
    'observacoes',
  ];
  const camposObrigatorios: (keyof AtualizarContratoDto)[] = [
    'numeroContrato',
    'orgaoContratante',
    'objeto',
    'status',
    'modoCalculo',
  ];

  for (const campo of [...camposOpcionais, ...camposObrigatorios]) {
    if (dto[campo] !== undefined) {
      // @ts-expect-error — atribuição dinâmica homônima DTO ↔ entidade.
      alvo[campo] = dto[campo];
    }
  }
  if (dto.numeroContrato !== undefined)
    alvo.numeroContrato = dto.numeroContrato.trim();
  if (dto.orgaoContratante !== undefined)
    alvo.orgaoContratante = dto.orgaoContratante.trim();
  if (dto.objeto !== undefined) alvo.objeto = dto.objeto.trim();
}

/** Snapshot serializável — evita enviar métodos/entidade crua à auditoria. */
function serializarContrato(contrato: Contrato): Record<string, unknown> {
  return {
    codigoPublico: contrato.codigoPublico,
    numeroContrato: contrato.numeroContrato,
    processoAdministrativo: contrato.processoAdministrativo,
    orgaoContratante: contrato.orgaoContratante,
    unidadeResponsavel: contrato.unidadeResponsavel,
    objeto: contrato.objeto,
    descricao: contrato.descricao,
    dataAssinatura: contrato.dataAssinatura,
    inicioVigencia: contrato.inicioVigencia,
    terminoVigencia: contrato.terminoVigencia,
    status: contrato.status,
    reabertoEm: contrato.reabertoEm,
    responsavelInternoId: contrato.responsavelInternoId,
    fiscalGestor: contrato.fiscalGestor,
    modoCalculo: contrato.modoCalculo,
    observacoes: contrato.observacoes,
    ordemEtapasBloqueada: contrato.ordemEtapasBloqueada,
  };
}

/** `2025-02-30` não é calendário válido apesar de bater o regex. */
function isCalendarioValido(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const d = new Date(`${data}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data;
}
