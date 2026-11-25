import { registrarFalhaPersistencia } from '../database/falha-persistencia.js';
import { FASES_OPERACIONAIS_CONTRATO } from './fases-operacionais.js';
import { estadoEdicaoContrato } from './estado-edicao-contrato.js';
import { impactoVigencia } from '../ocorrencias/impacto-vigencia.js';
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
import { documentacaoVerificada, filhosEmRevisao, atividadesPendentesDeVerificacao } from '../entregaveis/conclusao-documental.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ExecucaoService } from '../execucao/execucao.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { PermissaoContrato } from '../autorizacao/permissao-contrato.entity.js';
import { bloquearIdentidade, bloquearIdentidadeEAcl, exigirPermissaoTransacional } from '../autorizacao/permissao-transacional.js';
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
// Códigos de cinco dígitos existentes permanecem imutáveis; a sequência integer
// admite novos códigos até dez dígitos.
const LIMITE_CODIGO_PUBLICO = 2147483647;
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
    private readonly execucao: ExecucaoService,
  ) {}

  async criar(
    dto: CriarContratoDto,
    ator: UsuarioAutenticado,
  ): Promise<Contrato> {
    this.validarVigencia(dto.inicioVigencia, dto.terminoVigencia);
    if (!dto.numeroContrato?.trim() || !dto.orgaoContratante?.trim() || !dto.objeto?.trim())
      throw new BadRequestException('Número, contratante e objeto são obrigatórios');
    // Estados finais e administrativos nunca são aceitos no cadastro inicial.
    if (dto.status !== 'PLANEJAMENTO' && dto.status !== 'EM_EXECUCAO')
      throw new BadRequestException('O contrato deve iniciar em Planejamento ou Em execução');

    return this.auditoria.executarComAuditoria(ator, async manager => {
      if ((await bloquearIdentidade(manager, ator)).perfil !== PerfilUsuario.ADMINISTRADOR)
        throw new ForbiddenException('Somente Administrador pode realizar esta operação');
      const repo = manager.getRepository(Contrato);
      await this.validarResponsavel(manager, dto.responsavelInternoId);
      // A sequência PG é atômica entre processos, não depende do relógio nem de
      // números aleatórios. Preserve códigos históricos; não reutilize lacunas.
      let numeros: Array<{numero: number|string}>;
      try {
        numeros = await manager.query("SELECT nextval('seq_contratos_codigo_publico')::integer AS numero");
      } catch (erro) {
        if (erro instanceof QueryFailedError && (erro.driverError as {code?: string}).code === '2200H')
          throw new ConflictException('Limite de códigos públicos de contrato atingido');
        throw erro;
      }
      const numero = Number(numeros[0]?.numero);
      if (!Number.isSafeInteger(numero) || numero < 0 || numero > LIMITE_CODIGO_PUBLICO) {
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
      const salvo = await salvarContrato(repo, contrato);
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

  /** Solicitações persistidas, não elegibilidade para uma nova aprovação.
   * A decisão continua revalidando os critérios sob lock no serviço de conclusão. */
  async pendentesConclusao(ator: UsuarioAutenticado): Promise<string[]> {
    return (await this.listar(ator)).filter(c => Boolean(c.conclusaoSolicitadaEm) && !c.arquivadoEm && !c.reabertoEm &&
      !['CONCLUIDO','FINALIZADO','ENCERRADO','SUSPENSO','CANCELADO'].includes(c.status)).map(c => c.id);
  }

  /** Eventos do próprio contrato, sem entregar snapshots JSONB ou credenciais.
   * ACL de leitura da raiz + permissão administrativa/edição para trilha RF-42. */
  async historico(id: string, ator: UsuarioAutenticado, antes?: string) {
    await this.detalhar(id);
    if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
      const vinculo = await this.contratos.manager.getRepository(PermissaoContrato)
        .findOneBy({ usuarioId: ator.id, contratoId: id });
      if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar,
        vinculo.permissoesDetalhadas).editarContrato)
        throw new ForbiddenException('Sem permissão para consultar a rastreabilidade contratual');
    }
    // Cursor imutável, restrito ao mesmo contrato. A comparação é feita no banco
    // para preservar a precisão do timestamptz e a ordem de eventos simultâneos.
    if (antes !== undefined && (typeof antes !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(antes)))
      throw new BadRequestException('Cursor de histórico inválido');
    const repoHistorico = this.contratos.manager.getRepository(EventoAuditoria);
    const eventos = antes
      ? await repoHistorico.createQueryBuilder('evento')
        .where('evento.contrato_id = :id', { id })
        .andWhere(`(evento.registrado_em, evento.id) < (SELECT referencia.registrado_em, referencia.id FROM eventos_auditoria referencia WHERE referencia.contrato_id = :id AND referencia.id = :antes)`, { antes })
        .orderBy('evento.registradoEm', 'DESC').addOrderBy('evento.id', 'DESC').take(100).getMany()
      : await repoHistorico.find({ where: { contratoId: id }, order: { registradoEm: 'DESC', id: 'DESC' }, take: 100 });
    const rotulos: Record<string, string> = {
      USUARIO_PERMISSAO_CONCEDIDA: 'Permissões contratuais atualizadas', USUARIO_PERMISSAO_REVOGADA: 'Vínculo contratual revogado',
      CONTRATO_CRIADO: 'Contrato cadastrado', CONTRATO_EDITADO: 'Contrato atualizado',
      CONTRATO_PRAZO_ALTERADO: 'Prazo do contrato alterado',
      CONTRATO_STATUS_ALTERADO: 'Situação do contrato alterada',
      CONTRATO_ARQUIVADO: 'Contrato arquivado', CONTRATO_REATIVADO: 'Contrato reativado',
      CONTRATO_REABERTO: 'Contrato reaberto', CONTRATO_EXCLUIDO: 'Contrato excluído',
      DOCUMENTO_ANEXADO: 'Documento anexado', DOCUMENTO_METADADOS_ALTERADOS: 'Metadados do documento alterados',
      DOCUMENTO_VERIFICADO: 'Documento verificado', DOCUMENTO_REABERTO: 'Verificação do documento reaberta',
      DOCUMENTO_ARQUIVADO: 'Documento arquivado', DOCUMENTO_REATIVADO: 'Documento reativado',
      CONTRATO_ORDEM_ETAPAS_ALTERADA: 'Bloqueio da ordem das etapas alterado',
      ETAPA_CRIADA: 'Etapa cadastrada', ETAPA_EDITADA: 'Dados da etapa editados',
      ETAPA_ARQUIVADA: 'Etapa arquivada', ETAPA_REATIVADA: 'Etapa reativada',
      ETAPA_REORDENADA: 'Posição da etapa alterada',
      ETAPA_REABERTA: 'Etapa reaberta', ETAPA_STATUS_ALTERADO: 'Situação da etapa alterada',
      ETAPA_PRAZO_ALTERADO: 'Prazos da etapa alterados',
      ETAPA_EXCLUIDA: 'Etapa excluída',
      ENTREGAVEL_CRIADO: 'Entregável cadastrado',
      ENTREGAVEL_EDITADO: 'Dados do entregável editados',
      ENTREGAVEL_PRAZO_ALTERADO: 'Prazo do entregável alterado',
      ENTREGAVEL_STATUS_ALTERADO: 'Situação do entregável alterada',
      ENTREGAVEL_PESO_ALTERADO: 'Peso operacional do entregável alterado',
      ENTREGAVEL_EXECUCAO_ATUALIZADA: 'Execução do entregável atualizada',
      ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA: 'Evidência esperada configurada',
      ENTREGAVEL_EVIDENCIA_ESPERADA_ARQUIVADA: 'Evidência esperada arquivada',
      ENTREGAVEL_EVIDENCIA_ESPERADA_REATIVADA: 'Evidência esperada reativada',
      ENTREGAVEL_EVIDENCIA_ESPERADA_EXCLUIDA: 'Evidência esperada excluída',
      ENTREGAVEL_COMPROVANTE_ENVIADO: 'Comprovante de evidência enviado',
      ENTREGAVEL_COMPROVANTE_VERIFICADO: 'Comprovante de evidência verificado',
      ENTREGAVEL_COMPROVANTE_REABERTO: 'Comprovante de evidência reaberto para verificação',
      ENTREGAVEL_ARQUIVADO: 'Entregável arquivado',
      ENTREGAVEL_REATIVADO: 'Entregável reativado',
      ENTREGAVEL_REABERTO: 'Entregável reaberto',
      ENTREGAVEL_EXCLUIDO: 'Entregável excluído',
      DOCUMENTO_SUBSTITUIDO: 'Arquivo do documento substituído',
      DOCUMENTO_EXCLUIDO: 'Documento excluído',
      OCORRENCIA_CRIADA: 'Ocorrência criada', OCORRENCIA_GERADA: 'Ocorrência gerada',
      OCORRENCIA_EDITADA: 'Ocorrência editada', OCORRENCIA_REPROGRAMADA: 'Ocorrência reprogramada',
      OCORRENCIA_STATUS_ALTERADO: 'Situação da ocorrência alterada',
      OCORRENCIA_EXECUCAO_REGISTRADA: 'Execução da ocorrência registrada',
      ATIVIDADE_CRIADA: 'Atividade registrada', ATIVIDADE_EDITADA: 'Atividade editada',
      ATIVIDADE_VINCULOS_ALTERADOS: 'Entregáveis da atividade alterados',
      ATIVIDADE_VERIFICADA: 'Atividade verificada', ATIVIDADE_REABERTA: 'Atividade reaberta',
      ATIVIDADE_ARQUIVADA: 'Atividade arquivada', ATIVIDADE_REATIVADA: 'Atividade reativada',
      ATIVIDADE_EXCLUIDA: 'Atividade excluída logicamente',
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
        COALESCE(a.dados_posteriores->>'nome', a.dados_anteriores->>'nome',
          a.dados_posteriores->>'titulo', a.dados_anteriores->>'titulo') AS nome_evento,
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
        : valor === 'CONCLUIDA' ? 'Concluída' : valor === 'PLANEJADA' ? 'Planejada'
        : valor === 'EM_ANDAMENTO' ? 'Em andamento' : valor === 'VERIFICADA' ? 'Verificada'
        : valor === 'PENDENTE_VERIFICACAO' ? 'Pendente de verificação'
        : valor === 'REGISTRADA' ? 'Registrada' : valor === 'ARQUIVADA' ? 'Arquivada'
        : valor;
      const motivo = depoisEvento['motivo'];
      const posicao = (valor: unknown): string =>
        typeof valor === 'number' && Number.isFinite(valor) ? String(valor) :
        typeof valor === 'string' && /^\d+$/.test(valor) ? valor : '?';
      const mudancaVisivel = evento.acao === AcaoAuditoria.CONTRATO_ORDEM_ETAPAS_ALTERADA
        ? [antesEvento['ordemEtapasBloqueada'] ? 'Bloqueada' : 'Liberada',
           depoisEvento['ordemEtapasBloqueada'] ? 'Bloqueada' : 'Liberada']
        : evento.acao === AcaoAuditoria.ETAPA_REORDENADA
          ? [`Posição ${posicao(antesEvento['sequencia'])}`, `Posição ${posicao(depoisEvento['sequencia'])}`]
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
        : motivo === 'SOLICITACAO_ENCERRAMENTO_ADMINISTRATIVO'
          ? [fase(statusAntes) ?? 'Situação anterior', 'Pendente de encerramento']
        : motivo === 'ENCERRAMENTO_ADMINISTRATIVO_APROVADO'
          ? ['Pendente de encerramento', 'Encerrado']
        : motivo === 'ENCERRAMENTO_DEVOLVIDO_PARA_REVISAO'
          ? ['Pendente de encerramento', `Em revisão · ${fase(statusDepois) ?? 'Planejamento'}`]
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
      // Expõe somente os NOMES dos campos públicos alterados, nunca os valores
      // dos snapshots imutáveis (que podem conter dados privados/identificadores).
      const camposExibiveis: Record<string, string> = {
        nome: 'nome', titulo: 'título', descricao: 'descrição', tipo: 'tipo',
        inicioPrevisto: 'início previsto', terminoPrevisto: 'término previsto',
        peso: 'peso', pesoOperacional: 'peso operacional', dataHora: 'data e hora',
        responsavel: 'responsável', local: 'local', duracao: 'duração',
        participantes: 'participantes', observacoes: 'observações',
        obrigatoria: 'obrigatoriedade', tipoEvidencia: 'tipo da evidência',
        entregavelIds: 'vínculos com entregáveis', status: 'situação',
        statusExecucao: 'execução',
      };
      const camposModificados = Object.entries(camposExibiveis)
        .filter(([campo]) => Object.hasOwn(antesEvento, campo) && Object.hasOwn(depoisEvento, campo)
          && JSON.stringify(antesEvento[campo]) !== JSON.stringify(depoisEvento[campo]))
        .map(([, rotulo]) => rotulo);
      const detalheModificacao = camposModificados.length && /(?:_EDITAD[OA]|_ALTERAD[OA]|_CONFIGURADA|_ATUALIZADA)$/.test(evento.acao)
        ? ` · Campos alterados: ${camposModificados.join(', ')}` : '';
      const nome = tipo === 'CONTRATO' || tipo === 'DOCUMENTO' ? null : tipo === 'ETAPA'
        ? contexto?.etapa ?? contexto?.nome_evento ?? 'Etapa histórica'
        : contexto?.entregavel ?? contexto?.nome_evento ?? (tipo === 'ATIVIDADE' ? 'Atividade histórica' : 'Entregável histórico');
      return {
        id: evento.id, acao: evento.acao,
        descricao: (rotulos[evento.acao] ?? (tipo === 'DOCUMENTO' ? 'Evento documental registrado' : tipo === 'ETAPA' ? 'Evento de etapa registrado' :
          tipo === 'ENTREGAVEL' ? `Evento ${evento.acao} no entregável` : `Evento ${evento.acao} registrado`)) + detalheModificacao,
        ocorridoEm: evento.registradoEm, entidadeTipo: tipo,
        ator: autor ? { nome: autor.nome ?? 'Nome não informado', email: autor.email } : null,
        contexto: [contexto?.etapa && tipo !== 'ETAPA' ? `Etapa: ${contexto.etapa}` : null,
          nome ? `${tipo === 'ETAPA' ? 'Etapa' : tipo === 'ATIVIDADE' ? 'Atividade' : 'Entregável'}: ${nome}` : null,
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
      if ((await bloquearIdentidade(manager, ator)).perfil !== PerfilUsuario.ADMINISTRADOR)
        throw new ForbiddenException('Somente Administrador pode realizar esta operação');
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (arquivar && (contrato.conclusaoSolicitadaEm || contrato.encerramentoSolicitado)) throw new ConflictException('Decida a solicitação de conclusão ou encerramento antes de arquivar');
      if (contrato.status === 'CANCELADO') throw new ConflictException('Contrato cancelado requer reversão específica antes de arquivar');
      if (contrato.status === 'SUSPENSO') throw new ConflictException('Retome o contrato suspenso antes de arquivar');
      // Arquivamento administrativo não modifica status físico, evidências nem
      // auditoria. Um contrato finalizado também pode ser arquivado pelo ADMIN.

      if (Boolean(contrato.arquivadoEm) === arquivar) {
        throw new ConflictException(arquivar ? 'Contrato já está arquivado' : 'Contrato não está arquivado');
      }
      if (arquivar) await this.exigirSemDecisoesDescendentes(manager, id);
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

  private async decisoesDescendentesPendentes(manager: EntityManager, id: string): Promise<boolean> {
    const [r] = await manager.query(`SELECT EXISTS(SELECT 1 FROM etapas t WHERE t.contrato_id=$1 AND t.arquivado_em IS NULL
      AND (t.conclusao_solicitada_em IS NOT NULL OR t.encerramento_solicitado_em IS NOT NULL))
      OR EXISTS(SELECT 1 FROM entregaveis e JOIN etapas t ON t.id=e.etapa_id AND t.contrato_id=e.contrato_id
        WHERE e.contrato_id=$1 AND e.arquivado_em IS NULL AND t.arquivado_em IS NULL
        AND (e.regularizacao_documental_solicitada OR e.status_execucao IN ('PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO')))
      OR EXISTS(SELECT 1 FROM ocorrencias o JOIN entregaveis e ON e.id=o.entregavel_id AND e.contrato_id=o.contrato_id
        JOIN etapas t ON t.id=e.etapa_id AND t.contrato_id=e.contrato_id
        WHERE o.contrato_id=$1 AND o.substituida_em IS NULL AND e.arquivado_em IS NULL AND t.arquivado_em IS NULL
        AND (o.regularizacao_documental_solicitada OR o.status IN ('PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO')))
      OR EXISTS(SELECT 1 FROM atividades a
        WHERE a."contratoId"=$1 AND a."excluidaEm" IS NULL AND a."arquivadaEm" IS NULL
        AND a.status='PENDENTE_CONCLUSAO') AS possui`, [id]);
    return Boolean(r?.possui);
  }

  private async exigirSemDecisoesDescendentes(manager: EntityManager, id: string): Promise<void> {
    if (await this.decisoesDescendentesPendentes(manager, id)) throw new ConflictException('Decida as solicitações das etapas, entregáveis, ocorrências e atividades antes de prosseguir');
  }

  /** Conclusão exige 100% físico pelo mesmo motor TEC09 do dashboard,
   * além dos estados e da comprovação documental. Nunca estimar progresso. */
  private async avancoIntegral(manager: EntityManager, id: string): Promise<boolean> {
    const resultado = await this.execucao.consultarNaTransacao(manager, id);
    return resultado.avanco === 100 && resultado.integralEstrito === true && !resultado.configuracaoPendente &&
      resultado.entregaveis.length > 0 &&
      resultado.entregaveis.every(e => e.percentualExecucao === 100 && e.statusEntregavel === 'CONCLUIDO');
  }

  /** Uma única avaliação de elegibilidade, compartilhada pelo pedido e pela aprovação.
   * Nunca presume que uma porcentagem de execução equivale a comprovação. */
  private async pendenciasParaConclusao(manager: EntityManager, id: string, documentos?: boolean): Promise<string[]> {
    const pendencias: string[] = [];
    if (!(documentos ?? await documentacaoVerificada(manager, id)) || await filhosEmRevisao(manager, id))
      pendencias.push('Existem obrigações documentais pendentes ou registros em revisão.');
    if (await atividadesPendentesDeVerificacao(manager, id))
      pendencias.push('Existem atividades ainda não verificadas.');
    const etapas = await manager.query(`SELECT EXISTS (
      SELECT 1 FROM etapas WHERE contrato_id=$1 AND arquivado_em IS NULL AND (status IS DISTINCT FROM 'CONCLUIDA' OR conclusao_solicitada_em IS NOT NULL OR encerramento_solicitado_em IS NOT NULL)
    ) AS pendentes`, [id]) as Array<{ pendentes: boolean }>;
    if (etapas[0]?.pendentes) pendencias.push('Todas as etapas ativas precisam estar concluídas.');
    if (await this.decisoesDescendentesPendentes(manager, id)) pendencias.push('Existem solicitações pendentes nos registros descendentes.');
    const entregaveis = await manager.query(`SELECT EXISTS (
      SELECT 1 FROM entregaveis e JOIN etapas t ON t.id=e.etapa_id AND t.contrato_id=e.contrato_id WHERE e.contrato_id=$1 AND e.arquivado_em IS NULL AND t.arquivado_em IS NULL AND (e.regularizacao_documental_solicitada OR e.status_execucao IS DISTINCT FROM 'CONCLUIDO')
    ) AS pendentes`, [id]) as Array<{ pendentes: boolean }>;
    if (entregaveis[0]?.pendentes) pendencias.push('Todos os entregáveis ativos precisam estar concluídos.');
    const principal = await manager.query(`SELECT EXISTS (
      SELECT 1 FROM documentos_contratuais WHERE contrato_id=$1 AND categoria='CONTRATO_PRINCIPAL'
      AND arquivado_em IS NULL AND verificado_em IS NOT NULL AND reaberto_em IS NULL
    ) AS verificado`, [id]) as Array<{ verificado: boolean }>;
    if (!principal[0]?.verificado) pendencias.push('Anexe e verifique o PDF principal do contrato.');
    if (pendencias.length === 0 && !await this.avancoIntegral(manager, id))
      pendencias.push('A execução física precisa estar calculada em 100%, com todos os entregáveis concluídos.');
    return pendencias;
  }

  private async pendenciasParaConclusaoParcial(manager: EntityManager, id: string, documentos?: boolean): Promise<string[]> {
    const pendencias: string[] = [];
    documentos ??= await documentacaoVerificada(manager, id);
    const [r] = await manager.query(`SELECT
      EXISTS(SELECT 1 FROM etapas t WHERE t.contrato_id=$1 AND t.arquivado_em IS NULL AND (t.reaberto_em IS NOT NULL OR t.conclusao_solicitada_em IS NOT NULL OR t.encerramento_solicitado_em IS NOT NULL OR t.status NOT IN ('CONCLUIDA','CONCLUIDO_PARCIALMENTE') OR NOT EXISTS(SELECT 1 FROM entregaveis e WHERE e.etapa_id=t.id AND e.contrato_id=t.contrato_id AND e.arquivado_em IS NULL))) OR
      EXISTS(SELECT 1 FROM entregaveis e JOIN etapas t ON t.id=e.etapa_id AND t.contrato_id=e.contrato_id WHERE e.contrato_id=$1 AND e.arquivado_em IS NULL AND t.arquivado_em IS NULL AND (e.reaberto_em IS NOT NULL OR e.regularizacao_documental_solicitada OR e.status_execucao IS NULL OR e.status_execucao NOT IN ('CONCLUIDO','CONCLUIDO_PARCIALMENTE'))) AS pendentes,
      EXISTS(SELECT 1 FROM documentos_contratuais WHERE contrato_id=$1 AND categoria='CONTRATO_PRINCIPAL' AND arquivado_em IS NULL AND verificado_em IS NOT NULL AND reaberto_em IS NULL) AS principal`, [id]) as Array<{pendentes:boolean;principal:boolean}>;
    if (!r || r.pendentes) pendencias.push('Conclua operacionalmente todos os filhos antes de solicitar conclusão parcial.');
    if (await this.decisoesDescendentesPendentes(manager, id)) pendencias.push('Existem solicitações pendentes nos registros descendentes.');
    if (documentos && r?.principal) pendencias.push('A documentação está completa: solicite conclusão integral.');
    if (await atividadesPendentesDeVerificacao(manager,id)) pendencias.push('Existem atividades ainda não verificadas.');
    const progresso = await this.execucao.consultarNaTransacao(manager,id);
    if (progresso.avanco !== 100 || !progresso.integralFisicoEstrito || progresso.configuracaoPendente) pendencias.push('A conclusão parcial exige 100% físico em todos os entregáveis.');
    return pendencias;
  }

  async consultarElegibilidadeConclusao(id: string): Promise<{apto: boolean; aptoParcial?: boolean; podeEncerrarAntecipadamente: boolean; podeFinalizar: boolean; pendencias: string[]; solicitada: boolean}> {
    return this.contratos.manager.transaction('REPEATABLE READ', async manager => {
      const contrato = await manager.getRepository(Contrato).findOneBy({id});
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      const solicitada = Boolean(contrato.conclusaoSolicitadaEm || contrato.encerramentoSolicitado);
      const bloqueado = Boolean(contrato.arquivadoEm ||
        ['CONCLUIDO','FINALIZADO','ENCERRADO','SUSPENSO','CANCELADO'].includes(contrato.status));
      const documentos = bloqueado ? false : await documentacaoVerificada(manager, id);
      const pendencias = bloqueado ? ['O contrato não está aberto para solicitar conclusão.'] :
        await this.pendenciasParaConclusao(manager, id, documentos);
      const podeEncerrarAntecipadamente = !solicitada && !bloqueado && FASES_OPERACIONAIS_CONTRATO.includes(contrato.status) && !await this.decisoesDescendentesPendentes(manager, id);
      const podeFinalizar = podeEncerrarAntecipadamente && await this.pendenciaFinalizacao(manager, id) === null;
      return { apto: pendencias.length === 0 && !solicitada, podeEncerrarAntecipadamente, podeFinalizar,
        pendencias, aptoParcial: contrato.status !== 'CONCLUIDO_PARCIALMENTE' && !bloqueado && !solicitada && pendencias.length > 0 && (await this.pendenciasParaConclusaoParcial(manager,id,documentos)).length === 0, solicitada };
    });
  }

  async solicitarConclusao(id: string, ator: UsuarioAutenticado, parcial = false): Promise<Contrato> {
    return this.auditoria.executarComAuditoria(ator, async manager => {
      await exigirPermissaoTransacional(manager, id, ator, 'editarContrato');
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm ||
          ![...FASES_OPERACIONAIS_CONTRATO, ...(!parcial ? ['CONCLUIDO_PARCIALMENTE'] : [])].includes(contrato.status))
        throw new ConflictException('Contrato não está aberto para conclusão');
      if (contrato.conclusaoSolicitadaEm || contrato.encerramentoSolicitado) throw new ConflictException('Já existe uma solicitação de decisão pendente');
      const pendencias = parcial ? await this.pendenciasParaConclusaoParcial(manager,id) : await this.pendenciasParaConclusao(manager, id);
      if (pendencias.length) throw new ConflictException(pendencias[0]);
      const revisaoAnterior = contrato.reabertoEm ?? null;
      // O pedido substitui o fechamento intermediário da revisão, sem conceder aprovação.
      // A mesma avaliação de pendências protege ambos os caminhos.
      contrato.reabertoEm = null;
      contrato.conclusaoSolicitadaEm = new Date();
      contrato.conclusaoSolicitadaPor = ator.id;
      contrato.conclusaoParcialSolicitada = parcial;
      contrato.encerramentoSolicitado = false;
      contrato.tipoEncerramentoSolicitado = null;
      const salvo = await repo.save(contrato);
      return { resultado: salvo, evento: { acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO,
        entidadeTipo: 'CONTRATO' as const, entidadeId: id,
        dadosAnteriores: { conclusaoSolicitadaEm: null, reabertoEm: revisaoAnterior },
        dadosPosteriores: { conclusaoSolicitadaEm: salvo.conclusaoSolicitadaEm, reabertoEm: null, solicitadaPor: ator.id,
          tipo: parcial ? 'SOLICITACAO_CONCLUSAO_PARCIAL' : 'SOLICITACAO_CONCLUSAO' } } };
    });
  }

  /** Conclusão explícita pelo responsável autorizado, somente após comprovação total.
   * Nunca confunde um checklist 100% com uma decisão operacional de conclusão. */
  async concluir(id: string, ator: UsuarioAutenticado): Promise<Contrato> {
    return this.auditoria.executarComAuditoria(ator, async manager => {
      await exigirPermissaoTransacional(manager, id, ator, 'concluirContrato');
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm) throw new ConflictException('Reative o contrato arquivado antes de concluir');
      if ((['CONCLUIDO', 'ENCERRADO', 'FINALIZADO'].includes(contrato.status) || (contrato.status === 'CONCLUIDO_PARCIALMENTE' && (!contrato.conclusaoSolicitadaEm || contrato.conclusaoParcialSolicitada))) && !contrato.reabertoEm) throw new ConflictException('Contrato já possui decisão final');
      if (contrato.reabertoEm) throw new ConflictException('Encerre a revisão antes de concluir o contrato');
      if (!contrato.conclusaoSolicitadaEm) throw new ConflictException('Solicite a conclusão antes da aprovação');
      if (contrato.status === 'SUSPENSO' || contrato.status === 'CANCELADO')
        throw new ConflictException('Contrato suspenso ou cancelado não pode ser concluído');
      if (contrato.encerramentoSolicitado) {
        if (!contrato.tipoEncerramentoSolicitado)
          throw new ConflictException('Solicitação legada sem modalidade identificável. Devolva para revisão e solicite novamente.');
        if (contrato.tipoEncerramentoSolicitado === 'FINALIZACAO')
          await this.exigirElegibilidadeFinalizacao(manager, id);
        else await this.exigirSemDecisoesDescendentes(manager, id);
        const justificativa = contrato.motivoEncerramento?.trim() ?? '';
        if (justificativa.length < 15 || justificativa.length > 200)
          throw new ConflictException('Solicitação de encerramento sem justificativa válida');
        const anterior = snapshotDecisao(contrato);
        contrato.status = 'ENCERRADO' as Contrato['status'];
        contrato.reabertoEm = null;
        contrato.encerradoEm = new Date();
        contrato.encerradoPor = ator.id;
        contrato.conclusaoSolicitadaEm = null;
        contrato.conclusaoSolicitadaPor = null;
        contrato.conclusaoParcialSolicitada = false;
        contrato.encerramentoSolicitado = false;
        contrato.tipoEncerramentoSolicitado = null;
        const salvo = await repo.save(contrato);
        return { resultado: salvo, evento: { acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO,
          entidadeTipo: 'CONTRATO' as const, entidadeId: id, dadosAnteriores: anterior,
          dadosPosteriores: { status: salvo.status, encerramentoSolicitado: false, encerradoEm: salvo.encerradoEm,
            justificativa, modalidade: anterior.tipoEncerramentoSolicitado, aprovadoPor: ator.id, motivo: 'ENCERRAMENTO_ADMINISTRATIVO_APROVADO' } } };
      }
      const parcial = Boolean(contrato.conclusaoParcialSolicitada);
      const pendencias = parcial ? await this.pendenciasParaConclusaoParcial(manager, id) : await this.pendenciasParaConclusao(manager, id);
      if (pendencias.length) throw new ConflictException(pendencias[0]);
      const anterior = snapshotDecisao(contrato);
      contrato.status = (parcial ? 'CONCLUIDO_PARCIALMENTE' : 'CONCLUIDO') as Contrato['status'];
      contrato.reabertoEm = null;
      contrato.conclusaoSolicitadaEm = null;
      contrato.conclusaoSolicitadaPor = null;
      contrato.conclusaoParcialSolicitada = false;
      contrato.tipoEncerramentoSolicitado = null;
      const salvo = await repo.save(contrato);
      return { resultado: salvo, evento: {
        acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO, entidadeTipo: 'CONTRATO' as const,
        entidadeId: id, dadosAnteriores: anterior,
        dadosPosteriores: { status: salvo.status, reabertoEm: null, motivo: 'CONCLUSAO_EXPLICITA' },
      }};
    });
  }

  private async pendenciaFinalizacao(manager: EntityManager, id: string): Promise<string | null> {
      const pendencias = await manager.query(`
        SELECT
          EXISTS(SELECT 1 FROM etapas WHERE contrato_id=$1 AND arquivado_em IS NULL
                 AND (reaberto_em IS NOT NULL OR conclusao_solicitada_em IS NOT NULL OR encerramento_solicitado_em IS NOT NULL OR status NOT IN ('CONCLUIDA','CONCLUIDO_PARCIALMENTE','FINALIZADA','ENCERRADA'))) AS etapa_pendente,
          EXISTS(SELECT 1 FROM entregaveis e JOIN etapas t ON t.id=e.etapa_id AND t.contrato_id=e.contrato_id WHERE e.contrato_id=$1 AND e.arquivado_em IS NULL AND t.arquivado_em IS NULL
                 AND t.status <> 'ENCERRADA'
                 AND (e.status_execucao IS NULL OR e.reaberto_em IS NOT NULL OR e.regularizacao_documental_solicitada OR e.status_execucao NOT IN ('CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO'))) AS entregavel_pendente,
          EXISTS(SELECT 1 FROM entregaveis e JOIN etapas t ON t.id=e.etapa_id AND t.contrato_id=e.contrato_id WHERE e.contrato_id=$1 AND e.arquivado_em IS NULL AND t.arquivado_em IS NULL
                 AND e.status_execucao='FINALIZADO') OR EXISTS(SELECT 1 FROM etapas WHERE contrato_id=$1 AND arquivado_em IS NULL AND status IN ('FINALIZADA','ENCERRADA')) AS parcialmente_finalizado,
          EXISTS(SELECT 1 FROM entregaveis e JOIN etapas t ON t.id=e.etapa_id AND t.contrato_id=e.contrato_id WHERE e.contrato_id=$1 AND e.arquivado_em IS NULL AND t.arquivado_em IS NULL) OR EXISTS(SELECT 1 FROM etapas WHERE contrato_id=$1 AND arquivado_em IS NULL AND status='ENCERRADA') AS tem_entregaveis`, [id]) as Array<{
            etapa_pendente: boolean; entregavel_pendente: boolean; parcialmente_finalizado: boolean; tem_entregaveis: boolean;
          }>;
      const p = pendencias[0];
      if (!p?.tem_entregaveis || p.etapa_pendente || p.entregavel_pendente)
        return 'Conclua ou finalize todas as etapas e entregáveis antes de finalizar o contrato';
      if (!p.parcialmente_finalizado) return 'Todas as entregas foram concluídas; utilize Concluir contrato';
      return null;
  }

  private async exigirElegibilidadeFinalizacao(manager: EntityManager, id: string): Promise<void> {
    const pendencia = await this.pendenciaFinalizacao(manager, id);
    if (pendencia) throw new ConflictException(pendencia);
    await this.exigirSemDecisoesDescendentes(manager, id);
  }

  /** Solicitação de fechamento administrativo após resolver todos os filhos.
   * A aprovação posterior preserva o avanço físico real, obtido pela TEC09. */
  async finalizar(id: string, motivo: string, ator: UsuarioAutenticado): Promise<Contrato> {
    const justificativa = motivo?.trim() ?? '';
    if (justificativa.length < 15 || justificativa.length > 200)
      throw new BadRequestException('Justifique a finalização parcial (15 a 200 caracteres)');
    return this.auditoria.executarComAuditoria(ator, async manager => {
      await exigirPermissaoTransacional(manager, id, ator, 'concluirContrato');
      const contrato = await manager.findOne(Contrato, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato || contrato.arquivadoEm) throw new NotFoundException('Contrato indisponível');
      if (!FASES_OPERACIONAIS_CONTRATO.includes(contrato.status) || contrato.conclusaoSolicitadaEm)
        throw new ConflictException('Contrato já encerrado, suspenso, cancelado ou aguardando aprovação');
      await this.exigirElegibilidadeFinalizacao(manager, id);
      const anterior = { status: contrato.status, reabertoEm: contrato.reabertoEm ?? null, encerramentoSolicitado: false };
      contrato.reabertoEm = null;
      contrato.conclusaoSolicitadaEm = new Date(); contrato.conclusaoSolicitadaPor = ator.id;
      contrato.conclusaoParcialSolicitada = false; contrato.encerramentoSolicitado = true;
      contrato.tipoEncerramentoSolicitado = 'FINALIZACAO';
      contrato.motivoEncerramento = justificativa;
      const salvo = await manager.save(Contrato, contrato);
      return { resultado: salvo, evento: { acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO,
        entidadeTipo: 'CONTRATO' as const, entidadeId: id,
        dadosAnteriores: anterior, dadosPosteriores: { status: salvo.status, justificativa,
          encerramentoSolicitado: true, conclusaoSolicitadaEm: salvo.conclusaoSolicitadaEm,
          solicitadoPor: ator.id, modalidade: contrato.tipoEncerramentoSolicitado, motivo: 'SOLICITACAO_ENCERRAMENTO_ADMINISTRATIVO' } } };
    });
  }

  /** Suspensão do contrato, independente de arquivamento/conclusão/cancelamento.
   * O estado anterior permanece no evento imutável, permitindo retomar sem
   * coluna adicional. Lock do contrato serializa decisões concorrentes. */
  async alterarSuspensao(id: string, suspender: boolean, ator: UsuarioAutenticado, motivo?: string): Promise<Contrato> {
    if (!suspender && motivo !== undefined) validarJustificativaReabertura(motivo);
    return this.auditoria.executarComAuditoria(ator, async manager => {
      await exigirPermissaoTransacional(manager, id, ator, suspender ? 'suspenderContrato' : 'retomarContrato');
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm) throw new ConflictException('Reative o contrato arquivado antes de alterar a suspensão');
      const anterior = contrato.status;
      const revisaoAnterior = contrato.reabertoEm ?? null;
      if (suspender) {
        if (contrato.conclusaoSolicitadaEm) throw new ConflictException('Decida a solicitação de conclusão antes de suspender');
        if (!FASES_OPERACIONAIS_CONTRATO.includes(anterior))
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
      await exigirPermissaoTransacional(manager, id, ator, cancelar ? 'cancelarContrato' : 'reverterCancelamentoContrato');
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm) throw new ConflictException('Reative o contrato arquivado antes de alterar seu cancelamento');
      if (cancelar && contrato.conclusaoSolicitadaEm) throw new ConflictException('Decida a solicitação de conclusão antes de cancelar');
      if (cancelar && !FASES_OPERACIONAIS_CONTRATO.includes(contrato.status))
        throw new ConflictException('Não é possível cancelar contrato com decisão final ou situação administrativa incompatível');
      if (!cancelar && contrato.status !== 'CANCELADO')
        throw new ConflictException('O contrato não está cancelado');
      const anterior = { status: contrato.status, reabertoEm: contrato.reabertoEm ?? null };
      if (cancelar) {
        contrato.status = 'CANCELADO' as Contrato['status'];
      } else {
        const [evento] = await manager.query(`SELECT dados_anteriores->>'status' AS anterior FROM eventos_auditoria
          WHERE contrato_id=$1 AND entidade_tipo='CONTRATO' AND acao=$2
            AND dados_posteriores->>'status'='CANCELADO'
            AND dados_posteriores->>'decisao'='CANCELAMENTO_EXPLICITO'
          ORDER BY registrado_em DESC,id DESC LIMIT 1`, [id,AcaoAuditoria.CONTRATO_STATUS_ALTERADO]);
        if (!FASES_OPERACIONAIS_CONTRATO.includes(evento?.anterior))
          throw new ConflictException('Cancelamento histórico sem situação anterior identificável; requer análise administrativa');
        contrato.status = evento.anterior as Contrato['status'];
      }
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

  /** A fase preparatória não é mais oferecida. O endpoint antigo não pode
   * transformar um contrato em encerramento sem solicitação e justificativa. */
  async iniciarEncerramento(_id: string, _ator: UsuarioAutenticado): Promise<Contrato> {
    throw new ConflictException('Utilize Solicitar encerramento, com justificativa e aprovação autorizada.');
  }

  /** Encerramento antecipado NÃO é conclusão total. Mantém os estados dos filhos.
   * Uma competência de conclusão explícita, razão obrigatória e lock serializam a decisão. */
  async encerrarAntecipadamente(id: string, motivo: string, ator: UsuarioAutenticado): Promise<Contrato> {
    const justificativa = typeof motivo === 'string' ? motivo.trim() : '';
    if (justificativa.length < 15 || justificativa.length > 200)
      throw new BadRequestException('Informe uma justificativa de 15 a 200 caracteres');
    return this.auditoria.executarComAuditoria(ator, async manager => {
      await exigirPermissaoTransacional(manager, id, ator, 'encerrarContrato');
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm || contrato.conclusaoSolicitadaEm ||
        ['CONCLUIDO', 'CONCLUIDO_PARCIALMENTE', 'FINALIZADO', 'ENCERRADO', 'CANCELADO', 'SUSPENSO'].includes(contrato.status))
        throw new ConflictException('Contrato não está em situação elegível ao encerramento antecipado');
      await this.exigirSemDecisoesDescendentes(manager, id);
      // Solicitar não é aprovar. Mantém a fase anterior e bloqueia novas operações pela trava de decisão existente.
      const anterior = { status: contrato.status, reabertoEm: contrato.reabertoEm ?? null,
        encerramentoSolicitado: false };
      contrato.reabertoEm = null;
      contrato.conclusaoSolicitadaEm = new Date();
      contrato.conclusaoSolicitadaPor = ator.id;
      contrato.conclusaoParcialSolicitada = false;
      contrato.encerramentoSolicitado = true;
      contrato.tipoEncerramentoSolicitado = 'ANTECIPADO';
      contrato.motivoEncerramento = justificativa;
      const salvo = await repo.save(contrato);
      return { resultado: salvo, evento: {
        acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO, entidadeTipo: 'CONTRATO' as const,
        entidadeId: id, dadosAnteriores: anterior,
        dadosPosteriores: { status: salvo.status, encerramentoSolicitado: true,
          conclusaoSolicitadaEm: salvo.conclusaoSolicitadaEm, solicitadoPor: ator.id,
          justificativa, modalidade: contrato.tipoEncerramentoSolicitado, motivo: 'SOLICITACAO_ENCERRAMENTO_ADMINISTRATIVO' },
      }};
    });
  }

  /** Fecha uma revisão sem concluir o contrato.
   * A comprovação e as conclusões persistidas dos filhos são reavaliadas sob lock;
   * só a confirmação autorizada independente pode alterar status para CONCLUIDO. */
  async fecharRevisao(id: string, ator: UsuarioAutenticado, motivo?: string): Promise<Contrato> {
    if (motivo !== undefined) validarJustificativaReabertura(motivo);
    return this.auditoria.executarComAuditoria(ator, async manager => {
      await exigirPermissaoTransacional(manager, id, ator, 'editarContrato');
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm || contrato.conclusaoSolicitadaEm || (['CONCLUIDO','CONCLUIDO_PARCIALMENTE','ENCERRADO','FINALIZADO'].includes(contrato.status)) || !contrato.reabertoEm)
        throw new ConflictException('Somente contratos em revisão podem encerrar a revisão');
      if (contrato.status === 'SUSPENSO' || contrato.status === 'CANCELADO')
        throw new ConflictException('Contrato suspenso ou cancelado não permite encerrar revisão');
      const pendencias = await this.pendenciasParaConclusao(manager, id);
      if (pendencias.length) throw new ConflictException(pendencias[0]);
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
      await exigirPermissaoTransacional(manager, id, ator, 'concluirContrato');
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm || contrato.reabertoEm || !contrato.conclusaoSolicitadaEm ||
        contrato.status === 'CONCLUIDO' || contrato.status === 'ENCERRADO' || contrato.status === 'SUSPENSO' || contrato.status === 'CANCELADO')
        throw new ConflictException('Somente contrato pendente de conclusão pode ser devolvido para revisão');
      const anterior = snapshotDecisao(contrato);
      const eraEncerramento = Boolean(contrato.encerramentoSolicitado);
      if (eraEncerramento) contrato.motivoEncerramento = null;
      contrato.encerramentoSolicitado = false;
      contrato.tipoEncerramentoSolicitado = null;
      contrato.reabertoEm = contrato.status === 'CONCLUIDO_PARCIALMENTE' ? null : new Date();
      contrato.conclusaoSolicitadaEm = null;
      contrato.conclusaoSolicitadaPor = null;
      contrato.conclusaoParcialSolicitada = false;
      const salvo = await repo.save(contrato);
      return { resultado: salvo, evento: {
        acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO, entidadeTipo: 'CONTRATO' as const,
        entidadeId: id, dadosAnteriores: anterior,
        dadosPosteriores: { status: salvo.status, reabertoEm: salvo.reabertoEm, motivo: eraEncerramento ? 'ENCERRAMENTO_DEVOLVIDO_PARA_REVISAO' : contrato.status === 'CONCLUIDO_PARCIALMENTE' ? 'REGULARIZACAO_DOCUMENTAL_DEVOLVIDA' : 'DEVOLVIDO_PARA_REVISAO' },
      } };
    });
  }

  /** Reabertura OPERACIONAL explícita, auditada, sem alterar comprovações. */
  async reabrir(id: string, ator: UsuarioAutenticado, motivo?: string): Promise<Contrato> {
    if (motivo !== undefined) validarJustificativaReabertura(motivo);
    return this.auditoria.executarComAuditoria(ator, async manager => {
      await exigirPermissaoTransacional(manager, id, ator, 'reabrirContrato');
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm) throw new ConflictException('Reative o contrato arquivado antes de reabri-lo');
      if (contrato.reabertoEm) throw new ConflictException('Contrato já foi reaberto');
      if (contrato.conclusaoSolicitadaEm) throw new ConflictException('Decida a solicitação pendente antes de reabrir');
      if (!['CONCLUIDO', 'CONCLUIDO_PARCIALMENTE', 'ENCERRADO', 'FINALIZADO'].includes(contrato.status))
        throw new ConflictException('Somente contratos finalizados ou com decisão final podem ser reabertos');
      const anterior = snapshotDecisao(contrato);
      contrato.status = 'PLANEJAMENTO' as Contrato['status'];
      contrato.encerradoEm = null;
      contrato.encerradoPor = null;
      // Motivo anterior permanece no histórico da auditoria; campo limpo na reabertura.
      contrato.motivoEncerramento = null;
      contrato.reabertoEm = new Date();
      const salvo = await repo.save(contrato);
      return { resultado: salvo, evento: {
        acao: AcaoAuditoria.CONTRATO_REABERTO, entidadeTipo: 'CONTRATO' as const,
        entidadeId: id, dadosAnteriores: anterior,
        dadosPosteriores: { status: salvo.status, reabertoEm: salvo.reabertoEm, ...(motivo ? { justificativa: motivo.trim() } : {}) },
      } };
    });
  }

  /** Admin ou delegação explícita; guard valida antes desta chamada.
   * A trava é mantida no contrato com auditoria na mesma transação.
   * O mesmo lock de linha é usado pelo serviço de reordenação. */
  async alterarBloqueioOrdem(id: string, bloqueada: boolean, ator: UsuarioAutenticado): Promise<Contrato> {
    return this.auditoria.executarComAuditoria(ator, async (manager) => {
      await exigirPermissaoTransacional(manager, id, ator, 'bloquearOrdemEtapas');
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.createQueryBuilder('c')
        .setLock('pessimistic_write').where('c.id = :id', { id }).getOne();
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm) throw new ConflictException('Contrato arquivado não pode ter sua ordem alterada.');
      if (contrato.conclusaoSolicitadaEm || contrato.encerramentoSolicitado || !FASES_OPERACIONAIS_CONTRATO.includes(contrato.status)) throw new ConflictException('Resolva a situação do contrato antes de alterar a ordem');
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

  async consultarImpactoVigencia(id: string, dto: AtualizarContratoDto) {
    return this.contratos.manager.transaction('REPEATABLE READ', async m => {
      const c = await m.findOneBy(Contrato, { id });
      if (!c) throw new NotFoundException('Contrato não encontrado');
      const inicio = dto.inicioVigencia ?? c.inicioVigencia;
      const fim = dto.terminoVigencia ?? c.terminoVigencia;
      this.validarVigencia(inicio, fim);
      return impactoVigencia(m, c, inicio, fim);
    });
  }

  async atualizar(
    id: string,
    dto: AtualizarContratoDto,
    ator: UsuarioAutenticado,
  ): Promise<Contrato> {
    return this.auditoria.executarComAuditoria(ator, async (manager) => {
      const permissoes = await bloquearIdentidadeEAcl(manager, id, ator);
      if (!permissoes.editarContrato) throw new ForbiddenException('Sem permissão para editar contrato');
      const repo = manager.getRepository(Contrato);
      // Mesmo lock raiz usado por alterações de pesos, ocorrências e entregáveis.
      await manager.query('SELECT id FROM contratos WHERE id = $1 FOR UPDATE', [id]);
      const existente = await repo.findOneBy({ id });
      if (!existente) throw new NotFoundException('Contrato não encontrado');
      if (dto.estadoAnterior !== undefined && dto.estadoAnterior !== estadoEdicaoContrato(existente))
        throw new ConflictException('O contrato foi alterado após a abertura do formulário. Reabra a edição antes de salvar.');
      if (existente.arquivadoEm) throw new ConflictException('Contrato arquivado. Reative antes de editar.');
      if (existente.conclusaoSolicitadaEm || existente.encerramentoSolicitado) throw new ConflictException('Decida a solicitação de conclusão ou encerramento antes de editar o contrato');
      // Não inferir conclusão a partir do checklist documental. O estado
      // operacional só fica bloqueado após decisão expressa de encerramento.
      if (['CONCLUIDO','CONCLUIDO_PARCIALMENTE','ENCERRADO','FINALIZADO','CANCELADO','SUSPENSO'].includes(existente.status))
        throw new ConflictException('Contrato finalizado, cancelado ou suspenso: reabra ou retome antes de editar.');
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
      if (inicioVigencia !== inicioAnterior || terminoVigencia !== terminoAnterior) {
        const impacto = await impactoVigencia(manager, existente, inicioVigencia, terminoVigencia);
        if ((impacto.total || impacto.planos) && dto.confirmacaoVigencia !== impacto.confirmacao) throw new ConflictException('Confirme o impacto da vigência sobre o planejamento.');
        if (impacto.bloqueado) throw new ConflictException('Vigência atinge planejamento futuro. Replaneje os registros afetados antes de alterar o contrato.');
      }

      const antes = serializarContrato(existente);
      if (dto.status !== undefined && dto.status !== 'PLANEJAMENTO' && dto.status !== 'EM_EXECUCAO')
        throw new ForbiddenException('Este status exige uma transição específica autorizada; não pode ser definido pela edição comum');
      if (dto.retomarOperacao) {
        throw new ConflictException('A revisão só pode ser encerrada pela ação Fechar novamente.');
      }
      if (dto.modoCalculo !== undefined && dto.modoCalculo !== existente.modoCalculo)
        throw new ConflictException('Altere o modo de cálculo em Editar execução, com a versão dos pesos.');
      aplicarAtualizacao(existente, dto);
      existente.inicioVigencia = inicioVigencia;
      existente.terminoVigencia = terminoVigencia;

      if (!existente.numeroContrato.trim() || !existente.orgaoContratante.trim() || !existente.objeto.trim())
        throw new BadRequestException('Número, contratante e objeto são obrigatórios');
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
): Promise<Contrato> {
  try {
    return await repo.save(contrato);
  } catch (error: unknown) {
    if (error instanceof QueryFailedError) {
      registrarFalhaPersistencia('ContratosService', error);
      const erroDriver = error.driverError as { code?: string; constraint?: string };
      const codigo =
        erroDriver.code ?? (error as QueryFailedError & { code?: string }).code;

      if (['40P01', '40001', '55P03'].includes(codigo ?? '')) throw new ConflictException('Alteração concorrente; atualize e tente novamente');

      if (codigo === PG_CHECK_VIOLATION) {
        throw new BadRequestException('Dados violam restrição de integridade');
      }

      if (codigo === PG_UNIQUE_VIOLATION) {
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

/** Dados da solicitação antes de consumi-la; a decisão anterior permanece rastreável. */
function snapshotDecisao(c: Contrato): Record<string, unknown> {
  return { status:c.status, reabertoEm:c.reabertoEm ?? null,
    conclusaoSolicitadaEm:c.conclusaoSolicitadaEm ?? null, solicitadoPor:c.conclusaoSolicitadaPor ?? null,
    conclusaoParcialSolicitada:Boolean(c.conclusaoParcialSolicitada), encerramentoSolicitado:Boolean(c.encerramentoSolicitado),
    tipoEncerramentoSolicitado:c.tipoEncerramentoSolicitado ?? null, motivoEncerramento:c.motivoEncerramento ?? null,
    encerradoEm:c.encerradoEm ?? null, encerradoPor:c.encerradoPor ?? null };
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
