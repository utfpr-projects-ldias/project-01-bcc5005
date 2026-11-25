import { exigirSaldoQuantidadeDireta } from './quantidade-evidencias.js';
import { iniciarHierarquiaOperacional } from '../execucao/inicio-operacional.js';
import { listarEvidenciasConsolidadas } from './consulta-evidencias-consolidadas.js';
import { resumirFisicoEntregavel } from '../execucao/resumo-fisico-entregavel.js';
import { ConfiguracaoOcorrencias } from '../ocorrencias/configuracao-ocorrencias.entity.js';
import { StatusExecucaoEntregavel } from './status-execucao-entregavel.enum.js';
import { indicadoresPrazoEntregavel } from './estado-operacional-entregavel.js';
import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, In, IsNull, Not, QueryFailedError, Repository } from 'typeorm';
import { chavesDefinidas } from '../common/chaves-definidas.js';
import { hojeCivil } from '../common/data-civil.js';

import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { documentacaoVerificada, atividadesPendentesDeVerificacao, requisitosDocumentaisObrigatorios } from './conclusao-documental.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { EventoAuditoria } from '../auditoria/evento-auditoria.entity.js';
import { ResolverEscopoContratoService } from '../autorizacao/resolver-escopo-contrato.service.js';
import { PermissaoContrato } from '../autorizacao/permissao-contrato.entity.js';
import { permissoesEfetivas } from '../autorizacao/permissoes-granulares.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { configuracaoPeriodicidadeV1Valida } from './configuracao-periodicidade.js';
import type {
  CriarEntregavelDto, EditarEntregavelDto, SubstituirChecklistDto,
} from './dto/planejamento-entregavel.dto.js';
import { Entregavel } from './entregavel.entity.js';
import { EvidenciaEsperada } from './evidencia-esperada.entity.js';
import { ComprovanteEvidencia } from './comprovante-evidencia.entity.js';
import { TipoEntregavel } from './tipo-entregavel.enum.js';
import { aptidaoFisicaParaConclusao } from './conclusao-fisica.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { resumoMedicao } from '../ocorrencias/medicao-ocorrencia.js';

const CAMPOS_MUTAVEIS = [
  'etapaId', 'nome', 'codigo', 'descricao', 'responsavelId',
  'inicioPrevisto', 'terminoPrevisto', 'quantidadePrevista', 'unidadeMedida',
  'periodicidade', 'configuracaoPeriodicidade', 'peso', 'criterioConclusao', 'observacoes',
] as const;
type Campo = typeof CAMPOS_MUTAVEIS[number];

function dataCivilValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

/** Conserva precisão decimal: PostgreSQL NUMERIC permanece string na API. */
function decimalValido(valor: string, inteiroMax: number, casas: number): boolean {
  const regex = new RegExp(`^(?:0|[1-9]\\d{0,${inteiroMax - 1}})(?:\\.\\d{1,${casas}})?$`);
  return regex.test(valor);
}

function textoObrigatorio(valor: string | null, limite: number): boolean {
  return typeof valor === 'string' && valor.trim().length > 0 && valor.length <= limite;
}

export function validarMetadadosEntregavel(e: Entregavel, nomeAnterior?: string, campos?: readonly string[]): void {
  const validar = (campo: string) => !campos || campos.includes(campo);
  if (validar('nome') && (typeof e.nome !== 'string' || !e.nome.trim() || (e.nome.length > 42 && e.nome !== nomeAnterior)))
    throw new BadRequestException('Nome obrigatório e limitado a 42 caracteres');
  for (const [chave, campo, valor, limite] of [
    ['codigo', 'Código', e.codigo, 50], ['unidadeMedida', 'Unidade', e.unidadeMedida, 80],
    ['descricao', 'Descrição', e.descricao, 3000], ['observacoes', 'Observações', e.observacoes, 3000],
    ['criterioConclusao', 'Critério', e.criterioConclusao, 5000],
  ] as const) {
    if (validar(chave) && valor !== null && !textoObrigatorio(valor, limite)) {
      throw new BadRequestException(`${campo} não pode ser vazio e deve respeitar o limite`);
    }
  }
  if (validar('criterioConclusao') && (e.tipo === TipoEntregavel.MARCO || e.tipo === TipoEntregavel.CONTINUO) && !textoObrigatorio(e.criterioConclusao, 5000))
    throw new BadRequestException('Marco e Contínuo exigem critério textual explícito de conclusão/controle operacional');
}

export function validarPlanejamento(e: Entregavel, nomeAnterior?: string): void {
  validarMetadadosEntregavel(e, nomeAnterior);
  if (!e.inicioPrevisto) throw new BadRequestException('Início previsto é obrigatório para todos os entregáveis');
  if (e.tipo === TipoEntregavel.CONTINUO && !e.terminoPrevisto)
    throw new BadRequestException('Entregável contínuo exige término previsto');
  for (const data of [e.inicioPrevisto, e.terminoPrevisto]) {
    if (data !== null && !dataCivilValida(data)) throw new BadRequestException('Data civil inválida');
  }
  if (e.inicioPrevisto && e.terminoPrevisto && e.inicioPrevisto > e.terminoPrevisto) {
    throw new BadRequestException('Término previsto anterior ao início previsto');
  }
  if (e.quantidadePrevista !== null &&
      (!decimalValido(e.quantidadePrevista, 15, 3) || Number(e.quantidadePrevista) < 0)) {
    throw new BadRequestException('Quantidade prevista inválida: decimal positivo com até três casas');
  }
  if (e.peso === null || !decimalValido(e.peso, 3, 4) || Number(e.peso) > 100) {
    throw new BadRequestException('Peso operacional individual deve estar entre 0 e 100');
  }
  if (!Object.values(TipoEntregavel).includes(e.tipo)) throw new BadRequestException('Tipo de entregável inválido');
  if (e.tipo === TipoEntregavel.QUANTITATIVO &&
      (e.quantidadePrevista === null || Number(e.quantidadePrevista) <= 0 ||
       !textoObrigatorio(e.unidadeMedida, 80))) {
    throw new BadRequestException('Entregável quantitativo exige quantidade prevista positiva e unidade de medida');
  }
  if (e.tipo === TipoEntregavel.RECORRENTE) {
    if (!e.periodicidade || !configuracaoPeriodicidadeV1Valida(e.configuracaoPeriodicidade) ||
        !e.inicioPrevisto || !e.terminoPrevisto) {
      throw new BadRequestException('Entregável recorrente exige periodicidade e intervalo previsto');
    }
    if (e.configuracaoPeriodicidade?.modoRegistro === 'QUANTITATIVO' && !textoObrigatorio(e.unidadeMedida, 80)) throw new BadRequestException('Recorrente quantitativo exige unidade de medida');
  } else if (e.periodicidade !== null || e.configuracaoPeriodicidade !== null) {
    throw new BadRequestException('Periodicidade somente é permitida para entregável recorrente');
  }
  // Progresso/status/quantidade realizada não são alterados por este CRUD de planejamento (TEC09/TEC10).
}

function visao(e: Entregavel, itens: EvidenciaEsperada[], incluirArquivadas = false) {
  return {
    id: e.id, contratoId: e.contratoId, etapaId: e.etapaId, codigoPublico: e.codigoPublico,
    codigo: e.codigo, nome: e.nome, descricao: e.descricao, tipo: e.tipo,
    responsavelId: e.responsavelId,
    responsavel: e.responsavel ? { nome: e.responsavel.nome, email: e.responsavel.email } : null,
    inicioPrevisto: e.inicioPrevisto, terminoPrevisto: e.terminoPrevisto,
    quantidadePrevista: e.quantidadePrevista, quantidadeRealizada: e.quantidadeRealizada, quantidadeDiretaIntegrada:Boolean(e.quantidadeDiretaIntegrada),
    unidadeMedida: e.unidadeMedida, periodicidade: e.periodicidade,
    configuracaoPeriodicidade: e.configuracaoPeriodicidade, peso: e.peso,
    criterioConclusao: e.criterioConclusao, statusExecucao: e.statusExecucao ?? StatusExecucaoEntregavel.NAO_INICIADO, ...indicadoresPrazoEntregavel(e, e.statusExecucao ?? StatusExecucaoEntregavel.NAO_INICIADO), regularizacaoDocumentalSolicitada: Boolean(e.regularizacaoDocumentalSolicitada), motivoFinalizacao: e.motivoFinalizacao ?? null,
    percentualExecucao: e.percentualExecucao, situacaoComprovacao: e.situacaoComprovacao,
    observacoes: e.observacoes, arquivadoEm: e.arquivadoEm ?? null, reabertoEm: e.reabertoEm ?? null,
    evidenciasEsperadas: itens.filter((item) => incluirArquivadas || !item.arquivadoEm).map((item) => ({
      id: item.id, codigoPublico: item.codigoPublico, tipoEvidencia: item.tipoEvidencia, descricao: item.descricao,
      obrigatoria: item.obrigatoria, arquivadoEm: item.arquivadoEm ?? null, reabertoEm: item.reabertoEm ?? null,
    })),
  };
}

function snapshot(e: Entregavel) {
  const resultado: Record<string, unknown> = {};
  for (const campo of CAMPOS_MUTAVEIS) resultado[campo] = e[campo];
  return resultado;
}

function erroPostgres(error: unknown): never {
  if (error instanceof QueryFailedError) {
    const codigo = (error.driverError as { code?: string }).code;
    if (['23505', '40P01', '40001'].includes(codigo ?? '')) {
      throw new ConflictException('Alteração concorrente ou duplicada; atualize e tente novamente');
    }
    if (codigo === '23503') throw new ConflictException('O registro possui vínculo dependente ou foi alterado concorrentemente');
    if (['23514', '22P02', '22007', '22008', '22003'].includes(codigo ?? '')) {
      throw new BadRequestException('Parâmetros de planejamento inválidos');
    }
  }
  throw error;
}

@Injectable()
export class EntregaveisService implements OnModuleInit {
  constructor(
    @InjectRepository(Entregavel) private readonly entregaveis: Repository<Entregavel>,
    @InjectRepository(EvidenciaEsperada) private readonly evidencias: Repository<EvidenciaEsperada>,
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly escopos: ResolverEscopoContratoService,
  ) {}

  /** Linha do tempo do entregável. O guard exige acesso ao entregável NO contrato da URL.
   * Nunca devolve os JSONB internos de auditoria nem eventos de outro contrato. */
  async historico(contratoId: string, entregavelId: string, ator: UsuarioAutenticado) {
    if (!await this.entregaveis.findOne({ where: { id: entregavelId, contratoId }, select: { id: true } }))
      throw new NotFoundException('Entregável não encontrado neste contrato');
    // RF42: eventos de auditoria não são visíveis automaticamente a todos os
    // leitores do contrato. A autorização de leitura do guard é necessária, mas
    // a trilha exige adicionalmente permissão de planejamento do entregável.
    if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
      const vinculo = await this.dataSource.getRepository(PermissaoContrato).findOneBy({
        contratoId, usuarioId: ator.id,
      });
      if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).editarEntregaveis)
        throw new ForbiddenException('Sem permissão para consultar a trilha do entregável');
    }
    const eventos = await this.dataSource.getRepository(EventoAuditoria).find({
      where: { contratoId, entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId },
      order: { registradoEm: 'DESC', id: 'DESC' }, take: 100,
    });
    const autores = [...new Set(eventos.map(e => e.atorSupertokensUserId))];
    const usuarios = autores.length ? await this.dataSource.getRepository(Usuario).find({
      where: { supertokensUserId: In(autores) },
      select: { id: true, supertokensUserId: true, nome: true, email: true },
    }) : [];
    const porSupertokens = new Map(usuarios.map(u => [u.supertokensUserId, u]));
    const idsEvidencias = [...new Set(eventos.flatMap(e => [
      e.dadosAnteriores?.['itemId'], e.dadosPosteriores?.['itemId'],
      e.dadosAnteriores?.['evidenciaEsperadaId'], e.dadosPosteriores?.['evidenciaEsperadaId'],
    ].filter((id): id is string => typeof id === 'string')))];
    const evidencias = idsEvidencias.length ? await this.dataSource.getRepository(EvidenciaEsperada).find({
      where: { id: In(idsEvidencias), entregavelId }, select: { id: true, tipoEvidencia: true },
    }) : [];
    const porEvidencia = new Map(evidencias.map(e => [e.id, e.tipoEvidencia]));
    const idsComprovantes = [...new Set(eventos.flatMap(e => [
      e.dadosAnteriores?.['comprovanteId'], e.dadosPosteriores?.['comprovanteId'],
    ].filter((id): id is string => typeof id === 'string')))];
    const comprovantes = idsComprovantes.length ? await this.dataSource.getRepository(ComprovanteEvidencia).find({
      where: { id: In(idsComprovantes), contratoId, entregavelId },
      select: { id: true, nomeOriginal: true },
    }) : [];
    const porComprovante = new Map(comprovantes.map(c => [c.id, c.nomeOriginal]));
    const rotulos: Partial<Record<AcaoAuditoria, string>> = {
      [AcaoAuditoria.ENTREGAVEL_CRIADO]: 'Entregável cadastrado',
      [AcaoAuditoria.ENTREGAVEL_EDITADO]: 'Planejamento do entregável atualizado',
      [AcaoAuditoria.ENTREGAVEL_PRAZO_ALTERADO]: 'Prazos do entregável atualizados',
      [AcaoAuditoria.ENTREGAVEL_STATUS_ALTERADO]: 'Situação do entregável alterada',
      [AcaoAuditoria.ENTREGAVEL_PESO_ALTERADO]: 'Peso operacional alterado',
      [AcaoAuditoria.ENTREGAVEL_EXECUCAO_ATUALIZADA]: 'Execução física atualizada',
      [AcaoAuditoria.ENTREGAVEL_ARQUIVADO]: 'Entregável arquivado',
      [AcaoAuditoria.ENTREGAVEL_REATIVADO]: 'Entregável reativado',
      [AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA]: 'Evidência planejada atualizada',
      [AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_ARQUIVADA]: 'Evidência arquivada',
      [AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_REATIVADA]: 'Evidência reativada',
      [AcaoAuditoria.ENTREGAVEL_COMPROVANTE_ENVIADO]: 'Comprovante enviado',
      [AcaoAuditoria.ENTREGAVEL_COMPROVANTE_VERIFICADO]: 'Comprovante verificado',
    };
    return eventos.map(e => {
      const dados = e.dadosPosteriores ?? {};
      const anterior = e.dadosAnteriores ?? {};
      const evidenciaId = [dados['evidenciaEsperadaId'], dados['itemId'], anterior['evidenciaEsperadaId'], anterior['itemId']]
        .find((id): id is string => typeof id === 'string');
      const arquivoId = [dados['comprovanteId'], anterior['comprovanteId']]
        .find((id): id is string => typeof id === 'string');
      const ator = porSupertokens.get(e.atorSupertokensUserId);
      // A auditoria guarda o estado no momento do evento. Consultar apenas o
      // nome atual da evidência ocultava renomeações e apagava o contexto de
      // registros antigos; projetar somente os rótulos, nunca os JSONB internos.
      const nomeNoEvento = [dados['tipoEvidencia'], anterior['tipoEvidencia']]
        .find((valor): valor is string => typeof valor === 'string' && valor.trim().length > 0);
      const arquivoNoEvento = [dados['nomeOriginal'], anterior['nomeOriginal']]
        .find((valor): valor is string => typeof valor === 'string' && valor.trim().length > 0);
      const nomeAnterior = [anterior['tipoEvidencia'], anterior['nome']]
        .find((valor): valor is string => typeof valor === 'string' && valor.trim().length > 0);
      const nomeAtual = [dados['tipoEvidencia'], dados['nome']]
        .find((valor): valor is string => typeof valor === 'string' && valor.trim().length > 0);
      return {
        id: e.id, acao: e.acao, descricao: e.acao === AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA && dados['operacao'] === 'CRIAR_ITEM'
          ? 'Evidência cadastrada' : rotulos[e.acao] ?? 'Alteração do entregável registrada',
        ocorridoEm: e.registradoEm,
        ator: ator ? { nome: ator.nome ?? 'Nome não informado', email: ator.email } : null,
        evidenciaNome: evidenciaId ? (nomeNoEvento ?? porEvidencia.get(evidenciaId) ?? null) : null,
        nomeArquivo: arquivoNoEvento ?? (arquivoId ? porComprovante.get(arquivoId) ?? null : null),
        nomeAnterior: nomeAnterior && nomeAtual && nomeAnterior !== nomeAtual ? nomeAnterior : null,
        nomeAtual: nomeAnterior && nomeAtual && nomeAnterior !== nomeAtual ? nomeAtual : null,
        objetoRenomeado: evidenciaId ? 'Evidência' : 'Entregável',
        justificativa: typeof dados['justificativa'] === 'string' ? dados['justificativa'].slice(0, 200) : null,
      };
    });
  }

  /** Busca usuários ativos, inclusive Administrador, apenas para atribuição cadastral. Não concede vínculos. */
  async consultarResponsaveis(busca?: string, pagina = 1) {
    if (typeof busca !== 'undefined' && (typeof busca !== 'string' || busca.length > 100)) {
      throw new BadRequestException('Busca inválida (máximo 100 caracteres)');
    }
    if (!Number.isInteger(pagina) || pagina < 1 || pagina > 1000) {
      throw new BadRequestException('Página inválida');
    }
    const filtro = (busca ?? '').trim();
    const padrao = '%' + filtro.replace(/[%_\\]/g, (caractere) => '\\' + caractere) + '%';
    const where = filtro
      ? [
        { ativo: true, nome: ILike(padrao) },
        { ativo: true, email: ILike(padrao) },
        ...( /^[0-9a-f-]{36}$/i.test(filtro) ? [{ ativo: true, id: filtro }] : []),
      ] : { ativo: true };
    const [itens, total] = await this.dataSource.getRepository(Usuario).findAndCount({
      select: { id: true, nome: true, email: true }, where,
      order: { nome: 'ASC', email: 'ASC' }, take: 20, skip: (pagina - 1) * 20,
    });
    return { itens: itens.map(({ id, nome, email }) => ({ id, nome, email })), pagina, total, totalPaginas: Math.max(1, Math.ceil(total / 20)) };
  }

  onModuleInit(): void {
    // O contrato raiz é resolvido exclusivamente por entidade persistida.
    this.escopos.registrarAdaptador('entregavel', async (id) => {
      const e = await this.entregaveis.findOne({ where: { id }, select: { contratoId: true } });
      return e?.contratoId ?? null;
    });
    this.auditoria.registrarResolvedorContexto('ENTREGAVEL', async (manager, id) => {
      const e = await manager.getRepository(Entregavel).findOne({
        where: { id }, select: { contratoId: true },
      });
      return e?.contratoId ?? null;
    });
  }

  private async bloquearContrato(m: EntityManager, contratoId: string, _somenteConclusao = false, regularizacao = false): Promise<Contrato> {
    const contrato = await m.getRepository(Contrato).createQueryBuilder('c')
      .setLock('pessimistic_write').where('c.id = :contratoId', { contratoId }).getOne();
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.arquivadoEm) throw new ConflictException('Contrato arquivado: planejamento bloqueado');
    if (contrato.conclusaoSolicitadaEm) throw new ConflictException('Resolva a solicitação do contrato antes de modificar seus entregáveis');
    if (['SUSPENSO','CANCELADO'].includes(contrato.status))
      throw new ConflictException('Contrato suspenso ou cancelado: decisão indisponível');
    if ((contrato.status === 'CONCLUIDO' || (!regularizacao && contrato.status === 'CONCLUIDO_PARCIALMENTE')) || contrato.status === 'ENCERRADO' || contrato.status === 'FINALIZADO')
      throw new ConflictException('Contrato finalizado: reabra o contrato antes de modificar o planejamento');
    return contrato;
  }

  private async validarEtapa(m: EntityManager, contratoId: string, etapaId: string, somenteLeitura = false): Promise<void> {
    const etapa = await m.getRepository(Etapa).findOneBy({ id: etapaId, contratoId });
    if (!etapa) throw new NotFoundException('Etapa não encontrada neste contrato');
    if (!somenteLeitura && (etapa.conclusaoSolicitadaEm || etapa.encerramentoSolicitadoEm || etapa.arquivadoEm || (etapa.status === 'CONCLUIDA' || etapa.status === 'CONCLUIDO_PARCIALMENTE') || etapa.status === 'ENCERRADA' ||
      etapa.status === 'FINALIZADA'))
      throw new ConflictException('Etapa finalizada ou com decisão pendente: reabra ou resolva a solicitação antes de alterar entregáveis');
  }

  private async validarResponsavel(m: EntityManager, id: string | null): Promise<void> {
    if (id === null) return;
    if (!await m.getRepository(Usuario).findOneBy({ id, ativo: true })) {
      throw new BadRequestException('Responsável deve ser usuário cadastrado e ativo');
    }
    // Não criar PermissaoContrato automaticamente: responsabilidade cadastral != autorização.
  }

  private async registro(m: EntityManager, contratoId: string, id: string) {
    const e = await m.getRepository(Entregavel).findOneBy({ id, contratoId });
    if (!e) throw new NotFoundException('Entregável não encontrado');
    if (e.arquivadoEm) throw new ConflictException('Reative o entregável antes de editar o planejamento');
    return e;
  }

  private async itens(m: EntityManager, id: string) {
    return m.getRepository(EvidenciaEsperada).find({
      where: { entregavelId: id }, order: { tipoEvidencia: 'ASC', id: 'ASC' },
    });
  }

  /** Comprovação DOCUMENTAL, separada de status/percentual físico (TEC09).
   * Uma nova versão pendente prevalece sobre a verificação de versão anterior. */
  async resumoDocumental(contratoId: string) {
    const contrato = await this.dataSource.getRepository(Contrato).findOneBy({ id: contratoId });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    const linhas = await this.dataSource.manager.query(`SELECT v.*, oc.total AS ocorrencias_total, oc.feitas AS ocorrencias_finalizadas,
        atv.total AS atividades_total, atv.feitas AS atividades_verificadas, atv.ids AS atividades_ids, atv.ids_verificadas AS atividades_ids_verificadas,
        v.obrigatorias + cotas.total AS exigencias_documentais_total,
        v.verificadas + cotas.feitas AS exigencias_documentais_atendidas
      FROM vw_comprovacao_entregavel_r40 v
      JOIN entregaveis e ON e.id=v.entregavel_id AND e.arquivado_em IS NULL
      CROSS JOIN LATERAL (SELECT count(*)::int AS total,
        count(*) FILTER (WHERE o.status IN ('CONCLUIDO','CONCLUIDO_PARCIALMENTE','ENCERRADA'))::int AS feitas
        FROM ocorrencias o WHERE o.entregavel_id=e.id AND o.contrato_id=e.contrato_id AND o.substituida_em IS NULL) oc
      CROSS JOIN LATERAL (SELECT count(*)::int AS total,
        count(*) FILTER (WHERE a.status='VERIFICADA')::int AS feitas,
        COALESCE(array_agg(a.id), '{}') AS ids,
        COALESCE(array_agg(a.id) FILTER (WHERE a.status='VERIFICADA'), '{}') AS ids_verificadas
        FROM atividades a WHERE a."contratoId"=e.contrato_id AND a."excluidaEm" IS NULL AND a.status<>'ARQUIVADA'
        AND (EXISTS (SELECT 1 FROM atividade_entregaveis ae WHERE ae."atividadeId"=a.id AND ae."entregavelId"=e.id AND ae."contratoId"=e.contrato_id)
          OR EXISTS (SELECT 1 FROM ocorrencias o WHERE o.entregavel_id=e.id AND o.contrato_id=e.contrato_id AND o.substituida_em IS NULL
            AND (a."ocorrenciaId"=o.id OR EXISTS (SELECT 1 FROM atividade_ocorrencias ao WHERE ao."atividadeId"=a.id AND ao."ocorrenciaId"=o.id AND ao."contratoId"=e.contrato_id))))) atv
      CROSS JOIN LATERAL (
        SELECT COALESCE(sum(r.f+r.r+r.l),0)::int AS total,
          COALESCE(sum(LEAST(r.f,r.fotos)+LEAST(r.r,r.relatorios)+LEAST(r.l,GREATEST(0,r.provas-LEAST(r.f,r.fotos)-LEAST(r.r,r.relatorios)))),0)::int AS feitas
        FROM (
          SELECT CASE WHEN q.individual THEN COALESCE(q.minimo_fotos,0) WHEN q.minimo>0 AND q.evidencia_exigida='AMBOS' THEN 1 WHEN q.evidencia_exigida='FOTO' THEN q.minimo ELSE 0 END AS f,
            CASE WHEN q.individual THEN COALESCE(q.minimo_relatorios,0) WHEN q.minimo>0 AND q.evidencia_exigida='AMBOS' THEN 1 WHEN q.evidencia_exigida='RELATORIO' THEN q.minimo ELSE 0 END AS r,
            CASE WHEN q.individual THEN COALESCE(q.minimo_evidencias_livres,0) WHEN q.evidencia_exigida='AMBOS' THEN GREATEST(0,q.minimo-2) WHEN q.evidencia_exigida='NENHUMA' THEN q.minimo ELSE 0 END AS l,
            q.fotos,q.relatorios,CASE WHEN q.individual THEN q.provas ELSE q.fotos+q.relatorios END AS provas
          FROM (
            SELECT o.*, (o.minimo_fotos IS NOT NULL OR o.minimo_relatorios IS NOT NULL OR o.minimo_evidencias_livres IS NOT NULL) AS individual,
              COALESCE(o.minimo_evidencias_verificadas, CASE o.evidencia_exigida WHEN 'AMBOS' THEN 2 WHEN 'NENHUMA' THEN 0 ELSE 1 END) AS minimo,
              p.fotos,p.relatorios,p.provas
            FROM ocorrencias o CROSS JOIN LATERAL (
              SELECT count(*)::int AS provas,
                count(*) FILTER (WHERE lower(ev.tipo_evidencia) ~ '(foto|imagem|png|jpeg|jpg)')::int AS fotos,
                count(*) FILTER (WHERE lower(ev.tipo_evidencia) !~ '(foto|imagem|png|jpeg|jpg)' AND lower(ev.tipo_evidencia) ~ '(relat|report)')::int AS relatorios
              FROM vw_provas_ocorrencia_r41 oc
              JOIN comprovantes_evidencia c ON c.id=oc.comprovante_id AND c.contrato_id=oc.contrato_id
              JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id
              WHERE oc.ocorrencia_id=o.id AND oc.contrato_id=o.contrato_id AND c.status='VERIFICADA' AND c.verificado_em IS NOT NULL AND ev.arquivado_em IS NULL AND ev.reaberto_em IS NULL
                AND NOT EXISTS (SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id))
            ) p WHERE o.entregavel_id=e.id AND o.contrato_id=e.contrato_id AND o.substituida_em IS NULL
          ) q
        ) r
      ) cotas
      WHERE v.contrato_id=$1`, [contratoId]) as Array<{
      entregavel_id: string; obrigatorias: number; verificadas: number; total: number; verificadas_total: number;
      ocorrencias_exigidas: number; ocorrencias_atendidas: number; situacao: string;
      ocorrencias_total: number; ocorrencias_finalizadas: number; atividades_total: number; atividades_verificadas: number; atividades_ids?: string[]; atividades_ids_verificadas?: string[]; exigencias_documentais_total: number; exigencias_documentais_atendidas: number;
    }>;
    const resposta = Object.fromEntries(linhas.map(v => [v.entregavel_id, {
      obrigatorias: v.obrigatorias, verificadas: v.verificadas, total: v.total, verificadasTotal: v.verificadas_total,
      ocorrenciasExigidas: v.ocorrencias_exigidas, ocorrenciasAtendidas: v.ocorrencias_atendidas,
      situacaoComprovacao: v.situacao,
      ocorrenciasTotal: v.ocorrencias_total, ocorrenciasFinalizadas: v.ocorrencias_finalizadas,
      atividadesTotal: v.atividades_total, atividadesVerificadas: v.atividades_verificadas,
      ...(v.atividades_ids ? { atividadesIds: v.atividades_ids, atividadesIdsVerificadas: v.atividades_ids_verificadas ?? [] } : {}),
      exigenciasDocumentaisTotal: v.exigencias_documentais_total, exigenciasDocumentaisAtendidas: v.exigencias_documentais_atendidas,
    }]));
    return resposta;
  }

  async evidenciasConsolidadas(contratoId:string,filtros:Record<string,string>) {
    return listarEvidenciasConsolidadas(this.dataSource.manager,contratoId,filtros);
  }

  async listar(contratoId: string, etapaId?: string, arquivados = false) {
    if (!await this.dataSource.getRepository(Contrato).findOneBy({ id: contratoId })) {
      throw new NotFoundException('Contrato não encontrado');
    }
    if (etapaId) await this.validarEtapa(this.dataSource.manager, contratoId, etapaId, true);
    const registros = await this.entregaveis.find({
      where: { contratoId, ...(etapaId ? { etapaId } : {}), arquivadoEm: arquivados ? Not(IsNull()) : IsNull() },
      relations: { responsavel: true },
      order: { etapaId: 'ASC', nome: 'ASC', id: 'ASC' },
    });
    const ids = registros.map((e) => e.id);
    const itens = ids.length ? await this.evidencias.createQueryBuilder('ev')
      .where('ev.entregavelId IN (:...ids)', { ids })
      .orderBy('ev.tipoEvidencia', 'ASC').addOrderBy('ev.id', 'ASC').getMany() : [];
    // A data de cadastro já existe na trilha imutável. Consultá-la em lote
    // apenas para os entregáveis que não possuem as duas datas previstas.
    const semDatas = registros.filter(e => !e.inicioPrevisto || !e.terminoPrevisto).map(e => e.id);
    const criacoes = semDatas.length ? await this.dataSource.getRepository(EventoAuditoria).find({
      where: { contratoId, entidadeTipo: 'ENTREGAVEL', entidadeId: In(semDatas), acao: AcaoAuditoria.ENTREGAVEL_CRIADO },
      select: { entidadeId: true, registradoEm: true }, order: { registradoEm: 'ASC' },
    }) : [];
    const datas = new Map<string, Date>();
    for (const evento of criacoes) if (!datas.has(evento.entidadeId)) datas.set(evento.entidadeId, evento.registradoEm);
    const agenda = ids.length ? await this.dataSource.manager.findBy(Ocorrencia, { contratoId, entregavelId: In(ids), substituidaEm: IsNull() }) : [];
    const configuracoes = ids.length && registros.some(e => e.tipo === TipoEntregavel.RECORRENTE) ? await this.dataSource.manager.findBy(ConfiguracaoOcorrencias, { contratoId, entregavelId: In(ids) }) : [];
    return Promise.all(registros.map(async e => {
      const fisico = await resumirFisicoEntregavel(this.dataSource.manager, e, agenda.filter(o => o.entregavelId === e.id), configuracoes.find(c => c.entregavelId === e.id));
      return { ...visao(e, itens.filter(item => item.entregavelId === e.id && !item.arquivadoEm)), criadoEm: datas.get(e.id) ?? null,
        statusExecucao: fisico.statusEntregavel, atrasado: fisico.atrasado, finalizadoComAtraso: fisico.finalizadoComAtraso };
    }));
  }

  async detalhar(contratoId: string, id: string, ator: UsuarioAutenticado) {
    const e = await this.entregaveis.findOne({ where: { id, contratoId }, relations: { responsavel: true } });
    if (!e) throw new NotFoundException('Entregável não encontrado');
    if (e.arquivadoEm && ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
      const vinculo = await this.dataSource.getRepository(PermissaoContrato).findOneBy({ contratoId, usuarioId: ator.id });
      if (!vinculo || ator.perfil !== PerfilUsuario.GESTOR || !vinculo.podeEditar)
        throw new NotFoundException('Entregável não encontrado');
    }
    // Ao consultar um entregável arquivado, preservar também seu histórico de evidências arquivadas.
    const m = this.dataSource.manager;
    const [itens, agenda, configuracao] = await Promise.all([this.itens(m, id), m.findBy(Ocorrencia, { contratoId, entregavelId: id, substituidaEm: IsNull() }), e.tipo === TipoEntregavel.RECORRENTE ? m.findOneBy(ConfiguracaoOcorrencias, { contratoId, entregavelId: id }) : null]);
    const fisico = await resumirFisicoEntregavel(m, e, agenda, configuracao ?? undefined);
    return { ...visao(e, itens, Boolean(e.arquivadoEm)), statusExecucao: fisico.statusEntregavel, atrasado: fisico.atrasado, finalizadoComAtraso: fisico.finalizadoComAtraso };
  }

  /** Evita que a soma de participações operacionais ativas ultrapasse 100%,
   * mesmo para requisições que não passam pelo formulário React. */
  private async validarPesoNoContrato(m: EntityManager, contratoId: string, peso: string | null | undefined, excetoId?: string) {
    if (peso == null) return;
    // A distribuição de pesos limita apenas o modo PONDERADO. No SIMPLES,
    // novos entregáveis continuam possíveis independentemente da soma histórica.
    const contrato = await m.getRepository(Contrato).findOneBy({ id: contratoId });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.modoCalculo === 'SIMPLES') return;
    const linhas = await m.query(`SELECT COALESCE(SUM(e.peso), 0)::text AS soma FROM entregaveis e JOIN etapas t ON t.id=e.etapa_id AND t.contrato_id=e.contrato_id
      WHERE e.contrato_id = $1 AND e.arquivado_em IS NULL AND t.arquivado_em IS NULL AND ($2::uuid IS NULL OR e.id <> $2::uuid)`,
      [contratoId, excetoId ?? null]) as Array<{ soma: string }>;
    const disponivel = Math.max(0, 100 - Number(linhas[0]?.soma ?? '0'));
    if (Number(peso) > disponivel + 0.00001) throw new BadRequestException(
      `Apenas ${disponivel.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% restante disponível para usar como peso deste entregável.`);
  }

  async criar(contratoId: string, dto: CriarEntregavelDto, ator: UsuarioAutenticado) {
    try {
      return await this.dataSource.transaction(async (m) => {
        await this.bloquearContrato(m, contratoId);
        await this.validarEtapa(m, contratoId, dto.etapaId);
        // A transação já bloqueou a linha do contrato, serializando cadastros
        // concorrentes. Arquivados contam: arquivar não libera capacidade.
        const quantidade = await m.getRepository(Entregavel).count({ where: { contratoId } });
        if (quantidade >= 100) throw new ConflictException('Limite de 100 entregáveis por contrato atingido.');
        // Quantidade de itens e soma ponderada são validações independentes.
        // O limite real de pesos (no modo PONDERADO) é validado abaixo com
        // mensagem específica; nunca alegar conflito de replanejamento aqui.
        await this.validarResponsavel(m, dto.responsavelId ?? null);
        await this.validarPesoNoContrato(m, contratoId, dto.peso);
        if (dto.evidenciasEsperadas?.some((item) => item.id)) {
          throw new BadRequestException('Itens novos do checklist não podem informar ID');
        }
        const e = m.getRepository(Entregavel).create({
          contratoId, etapaId: dto.etapaId, nome: dto.nome.trim(), tipo: dto.tipo,
          codigo: dto.codigo?.trim() ?? null, descricao: dto.descricao?.trim() ?? null,
          responsavelId: dto.responsavelId ?? null,
          inicioPrevisto: dto.inicioPrevisto ?? null, terminoPrevisto: dto.terminoPrevisto ?? null,
          quantidadePrevista: dto.quantidadePrevista ?? null, unidadeMedida: dto.unidadeMedida?.trim() ?? null,
          periodicidade: dto.periodicidade ?? null,
          configuracaoPeriodicidade: (dto.configuracaoPeriodicidade ?? null) as Entregavel['configuracaoPeriodicidade'],
          peso: dto.peso ?? null, criterioConclusao: dto.criterioConclusao?.trim() ?? null,
          observacoes: dto.observacoes?.trim() ?? null,
          // O estado inicial é do sistema; quantidade e medição legada permanecem sem lançamento.
          quantidadeRealizada: null, statusExecucao: StatusExecucaoEntregavel.NAO_INICIADO, percentualExecucao: null, situacaoComprovacao: null,
        });
        validarPlanejamento(e);
        // A agenda recorrente é criada apenas após confirmação explícita na HU09.
        // Cadastrar o entregável não produz automaticamente instâncias de execução.
        const salvo = await m.getRepository(Entregavel).save(e);
        await this.auditoria.registrarNaTransacao(m, ator, {
          acao: AcaoAuditoria.ENTREGAVEL_CRIADO, entidadeTipo: 'ENTREGAVEL', entidadeId: salvo.id,
          dadosPosteriores: snapshot(salvo),
        });
        const itens = dto.evidenciasEsperadas?.length
          ? await this.salvarChecklist(m, contratoId, salvo.id, dto.evidenciasEsperadas, ator) : [];
        return visao(salvo, itens);
      });
    } catch (error) { return erroPostgres(error); }
  }

  /** A mesma delegação concluirEntregaveis serve à conclusão inicial e à reconclusão. */
  async concluir(contratoId: string, id: string, ator: UsuarioAutenticado) {
    return this.dataSource.transaction(async m => {
      const contrato = await this.bloquearContrato(m, contratoId, true, true);
      if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
        const vinculo = await m.getRepository(PermissaoContrato).findOneBy({ usuarioId: ator.id, contratoId });
        if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).concluirEntregaveis)
          throw new ForbiddenException('Sem permissão para concluir entregáveis');
      }
      const repo = m.getRepository(Entregavel);
      const e = await repo.findOneBy({ id, contratoId });
      if (!e) throw new NotFoundException('Entregável não encontrado neste contrato');
      if (e.arquivadoEm) throw new ConflictException('Entregável arquivado');
      const regularizacao = Boolean(e.regularizacaoDocumentalSolicitada && e.statusExecucao === 'CONCLUIDO_PARCIALMENTE');
      if (!regularizacao && !['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL'].includes(e.statusExecucao ?? ''))
        throw new ConflictException('A conclusão deve ser solicitada antes da aprovação');
      await this.validarRegularizacao(m, e, regularizacao, contrato);
      const fisico = await aptidaoFisicaParaConclusao(m, e);
      if (!fisico.apto) throw new ConflictException(fisico.motivo);
      if ((regularizacao || e.statusExecucao === 'PENDENTE_CONCLUSAO') && await requisitosDocumentaisObrigatorios(m, id) > 0 &&
          !await documentacaoVerificada(m, contratoId, e.etapaId, id))
        throw new ConflictException('Existem evidências pendentes de verificação');
      if (await atividadesPendentesDeVerificacao(m, contratoId, null, id))
        throw new ConflictException('Verifique as atividades registradas neste entregável antes de concluí-lo');
      const parcial = e.statusExecucao === 'PENDENTE_CONCLUSAO_PARCIAL';
      const revisoes = await m.query(`SELECT EXISTS (
        SELECT 1 FROM evidencias_esperadas WHERE entregavel_id = $1
          AND arquivado_em IS NULL AND obrigatoria IS TRUE AND reaberto_em IS NOT NULL
      ) AS pendentes`, [id]) as Array<{ pendentes: boolean }>;
      // Uma evidência obrigatória reaberta bloqueia o aceite INTEGRAL, mas
      // constitui justamente uma pendência legítima para a conclusão PARCIAL.
      if (revisoes[0]?.pendentes && !parcial)
        throw new ConflictException('Conclua novamente as evidências obrigatórias em revisão');
      const antes = { statusExecucao: e.statusExecucao, reabertoEm: e.reabertoEm ?? null, regularizacaoDocumentalSolicitada: regularizacao };
      if (parcial && (await requisitosDocumentaisObrigatorios(m, id) === 0 || await documentacaoVerificada(m, contratoId, e.etapaId, id)))
        throw new ConflictException('A documentação está completa: solicite conclusão integral');
      e.statusExecucao = (parcial ? 'CONCLUIDO_PARCIALMENTE' : 'CONCLUIDO') as Entregavel['statusExecucao'];
      // A regularização documental não altera a data da conclusão física anterior.
      if (!regularizacao) e.finalizadoEm = new Date();
      if (e.tipo === TipoEntregavel.MARCO && !e.dataEfetivaMarco) {
        // Atingimento efetivo é uma decisão autorizada, nunca um efeito de mero vínculo.
        e.dataEfetivaMarco = hojeCivil();
      }
      e.regularizacaoDocumentalSolicitada = false;
      e.reabertoEm = null;
      await repo.save(e);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ENTREGAVEL_STATUS_ALTERADO, entidadeTipo: 'ENTREGAVEL', entidadeId: id,
        dadosAnteriores: antes,
        dadosPosteriores: { statusExecucao: e.statusExecucao, finalizadoEm: e.finalizadoEm, reabertoEm: null, regularizacaoDocumentalSolicitada: false, motivo: regularizacao ? 'REGULARIZACAO_DOCUMENTAL_APROVADA' : 'CONCLUSAO_EXPLICITA' },
      });
      await iniciarHierarquiaOperacional(m,this.auditoria,ator,contratoId,id);
      // A aprovação deste entregável inicia, mas não solicita nem conclui a etapa.
      // Etapas têm pedido e decisão com permissões próprios.
      return { ...visao(e, await this.itens(m, id)), conclusoes: ['entregável'] };
    });
  }

  private async validarRegularizacao(m: EntityManager, e: Entregavel, regularizacao: boolean, c: Contrato) {
    if (c?.status === 'CONCLUIDO_PARCIALMENTE' && (!regularizacao || c.conclusaoSolicitadaEm))
      throw new ConflictException('Contrato parcialmente concluído: somente regularização documental é permitida');
    const etapa = await m.getRepository(Etapa).findOneBy({ id: e.etapaId, contratoId: e.contratoId });
    if (!etapa || etapa.arquivadoEm || etapa.conclusaoSolicitadaEm || etapa.encerramentoSolicitadoEm ||
        ['CONCLUIDA','ENCERRADA','FINALIZADA'].includes(etapa.status) ||
        (etapa.status === 'CONCLUIDO_PARCIALMENTE' && !regularizacao))
      throw new ConflictException('Etapa indisponível para esta decisão');
  }

  private async validarPermissaoDecisao(m: EntityManager, contratoId: string, ator: UsuarioAutenticado) {
    if (ator.perfil === PerfilUsuario.ADMINISTRADOR) return;
    const vinculo = await m.findOneBy(PermissaoContrato, { contratoId, usuarioId: ator.id });
    if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).concluirEntregaveis)
      throw new ForbiddenException('Sem permissão para aprovar a finalização do entregável');
  }

  /** Leitura da mesma aptidão física/documental usada pelas decisões. Não solicita nem aprova. */
  async elegibilidadeConclusao(contratoId: string, id: string, ator: UsuarioAutenticado) {
    return this.dataSource.transaction(async m => {
      const e = await m.getRepository(Entregavel).findOneBy({ id, contratoId });
      const contrato = await m.getRepository(Contrato).findOneBy({ id: contratoId });
      if (!e || !contrato) throw new NotFoundException('Entregável não encontrado');
      const regularizacao = e.statusExecucao === 'CONCLUIDO_PARCIALMENTE';
      const etapa = await m.getRepository(Etapa).findOneBy({ id: e.etapaId, contratoId });
      const vinculo = ator.perfil === PerfilUsuario.ADMINISTRADOR ? null :
        await m.getRepository(PermissaoContrato).findOneBy({ contratoId, usuarioId: ator.id });
      if (e.arquivadoEm && ator.perfil !== PerfilUsuario.ADMINISTRADOR && (ator.perfil !== PerfilUsuario.GESTOR || !vinculo?.podeEditar))
        throw new NotFoundException('Entregável não encontrado');
      const permissoes = vinculo ? permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas) : null;
      const solicitar = ator.perfil === PerfilUsuario.ADMINISTRADOR || Boolean(permissoes?.editarEntregaveis);
      const aprovar = ator.perfil === PerfilUsuario.ADMINISTRADOR || Boolean(permissoes?.concluirEntregaveis);
      const impedimentos: string[] = [];
      const pendencias: string[] = [];
      const contratoAtivo = !contrato.arquivadoEm && !contrato.conclusaoSolicitadaEm && !['CONCLUIDO','ENCERRADO','FINALIZADO','CANCELADO','SUSPENSO'].includes(contrato.status);
      const etapaAtiva = Boolean(etapa && !etapa.arquivadoEm && !etapa.conclusaoSolicitadaEm && !etapa.encerramentoSolicitadoEm &&
        !['CONCLUIDA','ENCERRADA','FINALIZADA'].includes(etapa.status) && (etapa.status !== 'CONCLUIDO_PARCIALMENTE' || regularizacao));
      const contextoAtivo = contratoAtivo && etapaAtiva && !e.arquivadoEm &&
        (contrato.status !== 'CONCLUIDO_PARCIALMENTE' || (regularizacao && !contrato.conclusaoSolicitadaEm));
      if (!contextoAtivo) impedimentos.push('O contrato, a etapa ou o entregável não permitem esta decisão no estado atual.');
      const pendente = Boolean(e.regularizacaoDocumentalSolicitada || ['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? ''));
      const aberto = !pendente && !['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO'].includes(e.statusExecucao ?? '');
      if (pendente) impedimentos.push('Já existe uma solicitação aguardando decisão.');
      if (!aberto && !regularizacao && !pendente) impedimentos.push('O entregável já possui uma decisão final.');
      if (!solicitar) impedimentos.push('Sua conta não possui permissão para solicitar conclusão.');
      const fisico = await aptidaoFisicaParaConclusao(m, e);
      if (!fisico.apto) impedimentos.push(fisico.motivo);
      const atividadesPendentes = await atividadesPendentesDeVerificacao(m, contratoId, null, id);
      if (atividadesPendentes) impedimentos.push('Ainda existem atividades não verificadas.');
      const exigencias = await requisitosDocumentaisObrigatorios(m, id);
      const documentacaoCompleta = exigencias === 0 || await documentacaoVerificada(m, contratoId, e.etapaId, id);
      if (!documentacaoCompleta) {
        const itens = await m.query(`SELECT ev.tipo_evidencia AS tipo, ev.reaberto_em AS reaberto, u.status
          FROM evidencias_esperadas ev LEFT JOIN LATERAL (SELECT c.status,c.verificado_em FROM comprovantes_evidencia c
          WHERE c.evidencia_esperada_id=ev.id AND c.contrato_id=$1 ORDER BY c.criado_em DESC,c.id DESC LIMIT 1) u ON TRUE
          WHERE ev.entregavel_id=$2 AND ev.arquivado_em IS NULL AND ev.obrigatoria IS TRUE
          AND (ev.reaberto_em IS NOT NULL OR u.status IS DISTINCT FROM 'VERIFICADA' OR u.verificado_em IS NULL)
          ORDER BY ev.tipo_evidencia,ev.id`, [contratoId,id]) as Array<{tipo:string;reaberto:Date|null;status:string|null}>;
        for (const ev of itens) pendencias.push(`${ev.tipo}: ${!ev.status ? 'comprovante não anexado' : ev.status === 'REJEITADA' ? 'comprovante rejeitado' : ev.reaberto ? 'aguardando nova verificação' : 'comprovante não verificado'}.`);
        const ocorrencias = await m.findBy(Ocorrencia, { contratoId, entregavelId:id, substituidaEm:IsNull() });
        for (const o of ocorrencias) {
          const medicao = await resumoMedicao(m,o);
          if (!medicao.documentacaoAtendida) {
            const individual = o.minimoFotos != null || o.minimoRelatorios != null || o.minimoEvidenciasLivres != null;
            const minimo = o.minimoEvidenciasVerificadas ?? (o.evidenciaExigida === 'AMBOS' ? 2 : !o.evidenciaExigida || o.evidenciaExigida === 'NENHUMA' ? 0 : 1);
            const exigidasFotos = individual ? o.minimoFotos ?? 0 : o.evidenciaExigida === 'FOTO' ? minimo : o.evidenciaExigida === 'AMBOS' && minimo > 0 ? 1 : 0;
            const exigidosRelatorios = individual ? o.minimoRelatorios ?? 0 : o.evidenciaExigida === 'RELATORIO' ? minimo : o.evidenciaExigida === 'AMBOS' && minimo > 0 ? 1 : 0;
            const fotos = Math.max(0, exigidasFotos - medicao.evidenciasFoto);
            const relatorios = Math.max(0, exigidosRelatorios - medicao.evidenciasRelatorio);
            const excedentes = Math.max(0, medicao.evidenciasFoto - exigidasFotos) + Math.max(0, medicao.evidenciasRelatorio - exigidosRelatorios) + (individual ? medicao.evidenciasOutras : 0);
            const livres = Math.max(0, (individual ? o.minimoEvidenciasLivres ?? 0 : Math.max(0, minimo - exigidasFotos - exigidosRelatorios)) - excedentes);
            const detalhes = [fotos ? `${fotos} foto(s)` : '', relatorios ? `${relatorios} relatório(s)` : '', livres ? `${livres} evidência(s) adicional(is)` : ''].filter(Boolean);
            pendencias.push(`${o.titulo}: ${detalhes.length ? detalhes.join(', ')+' pendente(s) de verificação' : 'requisitos documentais não atendidos'}.`);
          }
        }
        if (!pendencias.length) pendencias.push('Há requisitos documentais obrigatórios pendentes.');
      }
      const apto = contextoAtivo && fisico.apto && !atividadesPendentes;
      const podeSolicitarConclusao = solicitar && apto && (aberto || (regularizacao && !pendente)) && documentacaoCompleta;
      const podeSolicitarParcial = solicitar && apto && aberto && !documentacaoCompleta;
      const podeAprovar = aprovar && apto && (e.regularizacaoDocumentalSolicitada || e.statusExecucao === 'PENDENTE_CONCLUSAO' ? documentacaoCompleta : e.statusExecucao === 'PENDENTE_CONCLUSAO_PARCIAL' && !documentacaoCompleta);
      return { podeSolicitarConclusao, podeSolicitarParcial, podeAprovar: Boolean(podeAprovar),
        podeSolicitarEncerramento: solicitar && contextoAtivo && aberto,
        podeAprovarEncerramento: aprovar && contextoAtivo && e.statusExecucao === 'PENDENTE_ENCERRAMENTO',
        impedimentos, pendencias, documentacaoCompleta, situacaoComprovacao: e.situacaoComprovacao,
        semExigencias: exigencias === 0, aptidaoFisica: fisico.apto };
    });
  }

  /** Solicitação não substitui a aprovação do Gestor/Administrador. */
  async solicitarConclusao(contratoId: string, id: string, ator: UsuarioAutenticado) {
    return this.dataSource.transaction(async m => {
      const contrato = await this.bloquearContrato(m, contratoId, true, true);
      const e = await m.findOne(Entregavel, { where: { contratoId, id }, lock: { mode: 'pessimistic_write' } });
      if (!e || e.arquivadoEm) throw new NotFoundException('Entregável indisponível');
      const regularizacao = e.statusExecucao === 'CONCLUIDO_PARCIALMENTE';
      if (e.regularizacaoDocumentalSolicitada || (!regularizacao && ['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO','CONCLUIDO','FINALIZADO'].includes(e.statusExecucao ?? '')))
        throw new ConflictException('Já existe uma solicitação ou decisão final');
      await this.validarRegularizacao(m, e, regularizacao, contrato);
      const fisico = await aptidaoFisicaParaConclusao(m, e);
      if (!fisico.apto) throw new ConflictException(fisico.motivo);
      if (await atividadesPendentesDeVerificacao(m, contratoId, null, id))
        throw new ConflictException('Ainda existem atividades não verificadas');
      if (await requisitosDocumentaisObrigatorios(m, id) > 0 &&
          !await documentacaoVerificada(m, contratoId, e.etapaId, id))
        throw new ConflictException('Existem evidências pendentes de verificação');
      const anterior = { statusExecucao: e.statusExecucao, regularizacaoDocumentalSolicitada: Boolean(e.regularizacaoDocumentalSolicitada) };
      if (regularizacao) e.regularizacaoDocumentalSolicitada = true;
      else e.statusExecucao = 'PENDENTE_CONCLUSAO' as Entregavel['statusExecucao'];
      const salvo = await m.save(Entregavel, e);
      await this.auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.ENTREGAVEL_STATUS_ALTERADO,
        entidadeTipo: 'ENTREGAVEL', entidadeId: id, dadosAnteriores: anterior,
        dadosPosteriores: { statusExecucao: salvo.statusExecucao, regularizacaoDocumentalSolicitada: Boolean(salvo.regularizacaoDocumentalSolicitada), solicitadoPor: ator.id } });
      return { ...visao(salvo, await this.itens(m, id)) };
    });
  }

  /** A conclusão parcial só difere no estado documental; exige 100% físico
   * e decisão autorizada, sem conferir status administrativo de FINALIZADO. */
  async solicitarConclusaoParcial(contratoId: string, id: string, ator: UsuarioAutenticado) {
    return this.dataSource.transaction(async m => {
      await this.bloquearContrato(m, contratoId, true);
      const e = await m.findOne(Entregavel, { where: { contratoId, id }, lock: { mode: 'pessimistic_write' } });
      if (!e || e.arquivadoEm) throw new NotFoundException('Entregável indisponível');
      if (['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO','CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO'].includes(e.statusExecucao ?? ''))
        throw new ConflictException('Já existe uma solicitação ou decisão final');
      const etapa = await m.findOneBy(Etapa, { id: e.etapaId, contratoId });
      if (!etapa || etapa.arquivadoEm || etapa.conclusaoSolicitadaEm || etapa.encerramentoSolicitadoEm ||
          ['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(etapa.status))
        throw new ConflictException('Reabra a etapa ou resolva sua decisão antes de solicitar conclusão parcial');
      const fisico = await aptidaoFisicaParaConclusao(m, e);
      if (!fisico.apto) throw new ConflictException(fisico.motivo);
      if (await atividadesPendentesDeVerificacao(m, contratoId, null, id))
        throw new ConflictException('Ainda existem atividades não verificadas');
      if (await requisitosDocumentaisObrigatorios(m, id) === 0 ||
          await documentacaoVerificada(m, contratoId, e.etapaId, id))
        throw new ConflictException('Não há exigência documental pendente; solicite conclusão integral');
      const anterior = { statusExecucao: e.statusExecucao, situacaoComprovacao: e.situacaoComprovacao };
      e.statusExecucao = 'PENDENTE_CONCLUSAO_PARCIAL' as Entregavel['statusExecucao'];
      const salvo = await m.save(Entregavel, e);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ENTREGAVEL_STATUS_ALTERADO, entidadeTipo: 'ENTREGAVEL', entidadeId: id,
        dadosAnteriores: anterior,
        dadosPosteriores: { statusExecucao: salvo.statusExecucao, solicitacao: 'PARCIAL', solicitadoPor: ator.id },
      });
      return visao(salvo, await this.itens(m, id));
    });
  }

  /** Devolução auditada de uma solicitação; não aprova nem altera a execução física. */
  async devolverSolicitacao(contratoId: string, id: string, motivo: string, ator: UsuarioAutenticado) {
    const justificativa = motivo?.trim() ?? '';
    if (justificativa.length < 15 || justificativa.length > 200)
      throw new BadRequestException('Justifique a devolução com 15 a 200 caracteres');
    return this.dataSource.transaction(async m => {
      const contrato = await this.bloquearContrato(m, contratoId, true, true);
      await this.validarPermissaoDecisao(m, contratoId, ator);
      const e = await m.findOne(Entregavel, { where: { contratoId, id }, lock: { mode: 'pessimistic_write' } });
      if (!e || e.arquivadoEm) throw new NotFoundException('Entregável indisponível');
      const regularizacao = Boolean(e.regularizacaoDocumentalSolicitada && e.statusExecucao === 'CONCLUIDO_PARCIALMENTE');
      await this.validarRegularizacao(m, e, regularizacao, contrato);
      if (!regularizacao && !['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? ''))
        throw new ConflictException('Não existe solicitação pendente para devolver');
      const anterior = { statusExecucao: e.statusExecucao, motivoFinalizacao: e.motivoFinalizacao, regularizacaoDocumentalSolicitada: regularizacao };
      // Não existe EM_REVISAO no enum do entregável: o marcador reabertoEm
      // representa a revisão sem modificar o vocabulário persistido.
      if (regularizacao) e.regularizacaoDocumentalSolicitada = false;
      else {
        e.statusExecucao = 'EM_ANDAMENTO' as Entregavel['statusExecucao'];
        e.reabertoEm = new Date();
        e.motivoFinalizacao = null;
      }
      const salvo = await m.save(Entregavel, e);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ENTREGAVEL_STATUS_ALTERADO, entidadeTipo: 'ENTREGAVEL', entidadeId: id,
        dadosAnteriores: anterior,
        dadosPosteriores: { statusExecucao: salvo.statusExecucao, reabertoEm: salvo.reabertoEm,
          regularizacaoDocumentalSolicitada: false, justificativa, decisao: 'SOLICITACAO_DEVOLVIDA', devolvidoPor: ator.id },
      });
      return visao(salvo, await this.itens(m, id));
    });
  }

  async solicitarEncerramento(contratoId: string, id: string, motivo: string, ator: UsuarioAutenticado) {
    const justificativa = motivo?.trim() ?? '';
    if (justificativa.length < 15 || justificativa.length > 200)
      throw new BadRequestException('Justifique o encerramento com 15 a 200 caracteres');
    return this.dataSource.transaction(async m => {
      const contrato = await this.bloquearContrato(m, contratoId, true);
      const e = await m.findOne(Entregavel, { where: { contratoId, id }, lock: { mode: 'pessimistic_write' } });
      if (!e || e.arquivadoEm) throw new NotFoundException('Entregável indisponível');
      if (['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO','CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO'].includes(e.statusExecucao ?? ''))
        throw new ConflictException('Já existe uma solicitação ou decisão final');
      await this.validarRegularizacao(m, e, false, contrato);
      // Encerramento ADMINISTRATIVO: permite interromper uma execução parcial,
      // inclusive sem ocorrências cadastradas ou com ocorrências em andamento.
      // Não confundir com conclusão física (que possui validações próprias).
      // As ocorrências e respectivas quantidades permanecem auditáveis e intactas.
      const anterior = { statusExecucao: e.statusExecucao };
      e.statusExecucao = 'PENDENTE_ENCERRAMENTO' as Entregavel['statusExecucao'];
      e.motivoFinalizacao = justificativa;
      const salvo = await m.save(Entregavel, e);
      await this.auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.ENTREGAVEL_STATUS_ALTERADO,
        entidadeTipo: 'ENTREGAVEL', entidadeId: id, dadosAnteriores: anterior,
        dadosPosteriores: { statusExecucao: salvo.statusExecucao, justificativa, solicitadoPor: ator.id } });
      return visao(salvo, await this.itens(m, id));
    });
  }

  async aprovarEncerramento(contratoId: string, id: string, ator: UsuarioAutenticado) {
    return this.dataSource.transaction(async m => {
      const contrato = await this.bloquearContrato(m, contratoId, true);
      await this.validarPermissaoDecisao(m, contratoId, ator);
      const e = await m.findOne(Entregavel, { where: { contratoId, id }, lock: { mode: 'pessimistic_write' } });
      if (!e || e.arquivadoEm) throw new NotFoundException('Entregável indisponível');
      if (e.statusExecucao !== 'PENDENTE_ENCERRAMENTO') throw new ConflictException('Não há encerramento aguardando aprovação');
      await this.validarRegularizacao(m, e, false, contrato);
      // Aprovar encerramento não aprova/encerra ocorrências nem altera suas medições.
      // Cada ocorrência conserva o status histórico e continua visível no detalhe.
      const anterior = { statusExecucao: e.statusExecucao };
      e.statusExecucao = 'FINALIZADO' as Entregavel['statusExecucao'];
      e.reabertoEm = null;
      e.finalizadoEm = new Date();
      // Nunca escreve 100% fictício em percentualExecucao: TEC09 calcula a
      // execução real com ocorrências concluídas / quantidades aprovadas.
      const salvo = await m.save(Entregavel, e);
      await this.auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.ENTREGAVEL_STATUS_ALTERADO,
        entidadeTipo: 'ENTREGAVEL', entidadeId: id, dadosAnteriores: anterior,
        dadosPosteriores: { statusExecucao: salvo.statusExecucao, justificativa: e.motivoFinalizacao,
          aprovadoPor: ator.id, finalizadoEm: e.finalizadoEm } });
      return visao(salvo, await this.itens(m, id));
    });
  }

  async reabrir(contratoId: string, id: string, ator: UsuarioAutenticado, motivo?: string) {
    return this.dataSource.transaction(async m => {
      await this.bloquearContrato(m, contratoId);
      const repo = m.getRepository(Entregavel);
      const e = await repo.findOneBy({ id, contratoId });
      if (!e) throw new NotFoundException('Entregável não encontrado neste contrato');
      if (e.arquivadoEm) throw new ConflictException('Reative o entregável arquivado primeiro');
      const etapaPai = await m.getRepository(Etapa).findOneBy({ id: e.etapaId, contratoId });
      if (!etapaPai || etapaPai.arquivadoEm ||
        (!etapaPai.reabertoEm && (['CONCLUIDA', 'CONCLUIDO_PARCIALMENTE', 'ENCERRADA', 'FINALIZADA'].includes(etapaPai.status) ||
          await documentacaoVerificada(m, contratoId, e.etapaId))))
        throw new ConflictException('Reabra a etapa antes de reabrir seu entregável');
      if (e.reabertoEm) throw new ConflictException('Entregável já foi reaberto');
      const operacional = e.statusExecucao === 'CONCLUIDO' || e.statusExecucao === 'CONCLUIDO_PARCIALMENTE' || e.statusExecucao === 'FINALIZADO';
      if (!operacional && !await documentacaoVerificada(m, contratoId, e.etapaId, id))
        throw new ConflictException('Entregável ainda não possui todas as evidências verificadas');
      const anterior = e.statusExecucao;
      if (operacional || e.statusExecucao === 'PENDENTE_CONCLUSAO' || e.statusExecucao === 'PENDENTE_CONCLUSAO_PARCIAL' || e.statusExecucao === 'PENDENTE_ENCERRAMENTO') e.statusExecucao = 'EM_ANDAMENTO' as Entregavel['statusExecucao'];
      e.motivoFinalizacao = null; e.finalizadoEm = null;
      e.regularizacaoDocumentalSolicitada = false;
      e.reabertoEm = new Date();
      await repo.save(e);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ENTREGAVEL_REABERTO, entidadeTipo: 'ENTREGAVEL', entidadeId: id,
        dadosAnteriores: { statusExecucao: anterior, reabertoEm: null },
        dadosPosteriores: { statusExecucao: e.statusExecucao, reabertoEm: e.reabertoEm, ...(motivo ? { justificativa: motivo } : {}) },
      });
      return visao(e, await this.itens(m, id));
    });
  }

  /** Se HU09 já tiver gerado ocorrências, alterações estruturais exigem fluxo de replanejamento próprio. */
  private async impedirReplanejamentoDestrutivo(m: EntityManager, id: string): Promise<void> {
    const schema = await m.query(`SELECT to_regclass('ocorrencias') AS tabela`) as Array<{ tabela: string | null }>;
    if (!schema[0]?.tabela) return; // HU09 ainda não implantada
    const vinculadas = await m.query('SELECT 1 FROM "ocorrencias" WHERE "entregavel_id" = $1 LIMIT 1', [id]) as unknown[];
    if (vinculadas.length) throw new ConflictException('Entregável possui ocorrências: replanejamento depende de confirmação e preservação histórica (HU09)');
  }

  async editar(contratoId: string, id: string, dto: EditarEntregavelDto, ator: UsuarioAutenticado) {
    if (!chavesDefinidas(dto).length) throw new BadRequestException('Informe ao menos um campo');
    try {
      return await this.dataSource.transaction(async (m) => {
        await this.bloquearContrato(m, contratoId);
        const e = await this.registro(m, contratoId, id);
        await this.validarEtapa(m, contratoId, e.etapaId);
        const camposInformados = chavesDefinidas(dto);
        const camposMetadados = new Set(['nome','codigo','descricao','observacoes','criterioConclusao']);
        const somenteMetadados = camposInformados.every(campo => camposMetadados.has(campo));
        const decisaoPendente = Boolean(e.regularizacaoDocumentalSolicitada || ['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? ''));
        const finalizado = decisaoPendente || (!e.reabertoEm && ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO'].includes(e.statusExecucao ?? ''));
        if (finalizado)
          throw new ConflictException('Entregável com decisão pendente ou finalizado. Devolva a solicitação ou reabra antes de editar.');
        if (dto.tipo !== undefined && dto.tipo !== e.tipo)
          throw new ConflictException('O tipo do entregável é imutável. Para utilizar outro tipo, crie um novo entregável.');
        // A política entregaveis:editar NÃO delega pesos ou o replanejamento
        // recorrente. Comparar contra o estado persistido antes de alterar.
        if(dto.unidadeMedida !== undefined && (dto.unidadeMedida?.trim()??null)!==e.unidadeMedida && (e.quantidadeDiretaIntegrada || Number(e.quantidadeRealizada??0)>0 || await m.count(Ocorrencia,{where:{contratoId,entregavelId:id}})>0))throw new ConflictException('Não altere a unidade de um entregável com ocorrências ou medições registradas.');
        const mudaPeso = dto.peso !== undefined && (
          (dto.peso == null) !== (e.peso == null) ||
          (dto.peso != null && e.peso != null && Number(dto.peso) !== Number(e.peso))
        );
        const mudaAgenda = e.tipo === TipoEntregavel.RECORRENTE && (
          (dto.inicioPrevisto !== undefined && dto.inicioPrevisto !== e.inicioPrevisto) ||
          (dto.terminoPrevisto !== undefined && dto.terminoPrevisto !== e.terminoPrevisto) ||
          (dto.periodicidade !== undefined && dto.periodicidade !== e.periodicidade) ||
          (dto.configuracaoPeriodicidade !== undefined && JSON.stringify(dto.configuracaoPeriodicidade) !== JSON.stringify(e.configuracaoPeriodicidade))
        );
        if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
          const vinculo = await m.getRepository(PermissaoContrato).findOneBy({ contratoId, usuarioId: ator.id });
          const permissoes = permissoesEfetivas(ator.perfil, Boolean(vinculo?.podeEditar), vinculo?.permissoesDetalhadas);
          if (!vinculo || !permissoes.editarEntregaveis)
            throw new ForbiddenException('Sem permissão para editar entregáveis deste contrato.');
          if (mudaPeso && !permissoes.configurarPesos)
            throw new ForbiddenException('Sem permissão para alterar o peso operacional.');
          if (mudaAgenda && !permissoes.configurarAgendaOcorrencias)
            throw new ForbiddenException('Sem permissão para replanejar ocorrências recorrentes.');
        }
        // Atualizações textuais não provocam replanejamento de ocorrências,
        // recálculo de pesos ou revalidação de um checklist legado.
        if (somenteMetadados) {
          const anteriorTexto = snapshot(e);
          for (const campo of camposInformados) {
            const valor = (dto as unknown as Record<string, unknown>)[campo];
            (e as unknown as Record<string, unknown>)[campo] = typeof valor === 'string' ? valor.trim() : valor;
          }
          validarMetadadosEntregavel(e, anteriorTexto.nome as string, camposInformados);
          const salvo = await m.getRepository(Entregavel).save(e);
          await this.auditoria.registrarNaTransacao(m, ator, {
            acao: AcaoAuditoria.ENTREGAVEL_EDITADO, entidadeTipo: 'ENTREGAVEL', entidadeId: id,
            dadosAnteriores: anteriorTexto, dadosPosteriores: snapshot(salvo),
          });
          return visao(salvo, await this.itens(m, id));
        }
        const anterior = snapshot(e);
        const nomeAnterior = e.nome;
        const antes = { tipo: e.tipo, etapaId: e.etapaId, periodicidade: e.periodicidade,
          configuracaoPeriodicidade: e.configuracaoPeriodicidade,
          inicioPrevisto: e.inicioPrevisto, terminoPrevisto: e.terminoPrevisto };
        const prazoAnterior = { inicioPrevisto: e.inicioPrevisto, terminoPrevisto: e.terminoPrevisto };
        for (const campo of CAMPOS_MUTAVEIS) {
          // Classes DTO do TS ES2023 possuem propriedades próprias com undefined.
          // Tratar somente propriedades realmente informadas pelo cliente.
          if (dto[campo] !== undefined) {
            const valor = dto[campo];
            if (typeof valor === 'string' && !['quantidadePrevista', 'peso', 'inicioPrevisto', 'terminoPrevisto'].includes(campo)) {
              (e as unknown as Record<Campo, unknown>)[campo] = valor.trim();
            } else {
              (e as unknown as Record<Campo, unknown>)[campo] = valor;
            }
          }
        }
        if (e.tipo !== antes.tipo && (e.execucoesIntegradas || e.percentualExecucao != null || e.quantidadeRealizada != null || e.dataEfetivaMarco != null)) throw new ConflictException('Tipo não pode mudar após registrar execução física. Preserve o histórico.');
        validarPlanejamento(e, nomeAnterior);
        if (e.tipo === TipoEntregavel.QUANTITATIVO && dto.quantidadePrevista !== undefined && Number(e.quantidadePrevista) < Number(anterior.quantidadePrevista)) {
          if (e.quantidadeDiretaIntegrada) await exigirSaldoQuantidadeDireta(m,e);
          const [meta] = await m.query(`SELECT COALESCE(SUM(meta_quantidade),0) > $3::numeric AS excede FROM ocorrencias
            WHERE contrato_id=$1 AND entregavel_id=$2 AND substituida_em IS NULL AND origem='MANUAL_QUANTITATIVA'`,[contratoId,id,e.quantidadePrevista]);
          if (meta?.excede) throw new ConflictException('A nova meta é inferior à quantidade planejada nas ocorrências vigentes. Replaneje as ocorrências primeiro.');
        }
        await this.validarPesoNoContrato(m, contratoId, e.peso, id);
        await this.validarEtapa(m, contratoId, e.etapaId);
        await this.validarResponsavel(m, e.responsavelId);
        if (e.tipo !== antes.tipo || e.etapaId !== antes.etapaId ||
          e.periodicidade !== antes.periodicidade ||
          JSON.stringify(e.configuracaoPeriodicidade) !== JSON.stringify(antes.configuracaoPeriodicidade) ||
          e.inicioPrevisto !== antes.inicioPrevisto || e.terminoPrevisto !== antes.terminoPrevisto) {
          await this.impedirReplanejamentoDestrutivo(m, id);
        }
        const salvo = await m.getRepository(Entregavel).save(e);
        if(salvo.etapaId!==antes.etapaId && salvo.statusExecucao==='EM_ANDAMENTO')await iniciarHierarquiaOperacional(m,this.auditoria,ator,contratoId,salvo.id);
        if (salvo.inicioPrevisto !== prazoAnterior.inicioPrevisto || salvo.terminoPrevisto !== prazoAnterior.terminoPrevisto) {
          await this.auditoria.registrarNaTransacao(m, ator, {
            acao: AcaoAuditoria.ENTREGAVEL_PRAZO_ALTERADO, entidadeTipo: 'ENTREGAVEL', entidadeId: id,
            dadosAnteriores: prazoAnterior,
            dadosPosteriores: { inicioPrevisto: salvo.inicioPrevisto, terminoPrevisto: salvo.terminoPrevisto },
          });
        }
        if (salvo.peso !== anterior.peso) {
          await this.auditoria.registrarNaTransacao(m, ator, {
            acao: AcaoAuditoria.ENTREGAVEL_PESO_ALTERADO, entidadeTipo: 'ENTREGAVEL', entidadeId: id,
            dadosAnteriores: { peso: anterior.peso }, dadosPosteriores: { peso: salvo.peso },
          });
        }
        const itens = dto.evidenciasEsperadas === undefined
          ? await this.itens(m, id) : await this.salvarChecklist(m, contratoId, id, dto.evidenciasEsperadas, ator);
        await this.auditoria.registrarNaTransacao(m, ator, {
          acao: AcaoAuditoria.ENTREGAVEL_EDITADO, entidadeTipo: 'ENTREGAVEL', entidadeId: id,
          dadosAnteriores: anterior, dadosPosteriores: snapshot(salvo),
        });
        return visao(salvo, itens);
      });
    } catch (error) { return erroPostgres(error); }
  }

  /** Lista completa, auditada item a item, sob a transação externa. */
  private async salvarChecklist(m: EntityManager, contratoId: string, id: string, itens: SubstituirChecklistDto['itens'],
    ator: UsuarioAutenticado) {
        const repo = m.getRepository(EvidenciaEsperada);
        const anteriores = await this.itens(m, id);
        const porId = new Map(anteriores.map((item) => [item.id, item]));
        const enviados = new Set<string>();
        if (!Array.isArray(itens) || itens.length > 10)
          throw new BadRequestException('Máximo de dez evidências ativas por entregável');
        for (const item of itens) {
          if (!textoObrigatorio(item.tipoEvidencia, 100) ||
            (item.descricao != null && !textoObrigatorio(item.descricao, item.id ? 3000 : 130)) ||
            typeof item.obrigatoria !== 'boolean') throw new BadRequestException('Item de evidência esperado inválido');
          if (item.id) {
            if (!porId.has(item.id)) throw new ConflictException('ID de evidência esperada inexistente ou de outro entregável');
            if (enviados.has(item.id)) throw new BadRequestException('Checklist contém ID repetido');
            enviados.add(item.id);
          }
        }
        // RF-10: alterar obrigatoriedade exige ADMIN ou delegação expressa, também em
        // criação aninhada e no endpoint legado de substituição integral do checklist.
        const alteraObrigatoriedade = itens.some(item => {
          const anterior = item.id ? porId.get(item.id) : undefined;
          return anterior ? anterior.obrigatoria !== item.obrigatoria : item.obrigatoria === false;
        });
        // Não permitir que edição de ENTREGÁVEL contorne permissões distintas de
        // CADASTRAR/EDITAR EVIDÊNCIA; todas as formas de PATCH/PUT passam aqui.
        const novos = itens.some(item => !item.id);
        const editados = itens.some(item => {
          const anterior = item.id ? porId.get(item.id) : undefined;
          return Boolean(anterior && (anterior.tipoEvidencia !== item.tipoEvidencia.trim() ||
            anterior.descricao !== (item.descricao?.trim() ?? null) || anterior.obrigatoria !== item.obrigatoria));
        });
        if (ator.perfil !== PerfilUsuario.ADMINISTRADOR && (novos || editados || alteraObrigatoriedade)) {
          const vinculo = await m.getRepository(PermissaoContrato).findOneBy({ contratoId, usuarioId: ator.id });
          const permitidas = permissoesEfetivas(ator.perfil, Boolean(vinculo?.podeEditar), vinculo?.permissoesDetalhadas);
          if (!vinculo || (novos && !permitidas.criarEvidencias) || (editados && !permitidas.editarEvidencias))
            throw new ForbiddenException('Sem autorização específica para modificar evidências esperadas');
          if (alteraObrigatoriedade && !vinculo?.permissoesDetalhadas?.alterarObrigatoriedade)
            throw new ForbiddenException('Alterar obrigatoriedade requer autorização específica');
        }
        // Auditoria por item evita truncamento de snapshots quando o checklist é grande.
        // Cada gravação e respectivo evento vivem na mesma transação.
        for (const item of anteriores) {
          if (enviados.has(item.id) || item.arquivadoEm) continue;
          throw new ConflictException(`A evidência ${item.id} não pode ser excluída fisicamente. Utilize o arquivamento individual.`);
        }
        for (const item of itens) {
          if (item.id) {
            const atual = porId.get(item.id)!;
            if (atual.arquivadoEm) throw new ConflictException('Reative a evidência antes de editar seu checklist');
            const antes = { itemId: atual.id, tipoEvidencia: atual.tipoEvidencia,
              descricao: atual.descricao, obrigatoria: atual.obrigatoria };
            if (item.tipoEvidencia.trim() !== atual.tipoEvidencia && await m.getRepository(ComprovanteEvidencia).findOneBy({evidenciaEsperadaId:atual.id,contratoId,entregavelId:id}))
              throw new ConflictException('O tipo de uma evidência com arquivo anexado não pode mudar. Cadastre outra evidência.');
            atual.tipoEvidencia = item.tipoEvidencia.trim();
            atual.descricao = item.descricao?.trim() ?? null;
            atual.obrigatoria = item.obrigatoria;
            if (atual.tipoEvidencia === antes.tipoEvidencia && atual.descricao === antes.descricao &&
              atual.obrigatoria === antes.obrigatoria) continue;
            await repo.save(atual);
            await this.auditoria.registrarNaTransacao(m, ator, {
              acao: AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA,
              entidadeTipo: 'ENTREGAVEL', entidadeId: id,
              dadosAnteriores: antes,
              dadosPosteriores: { operacao: 'EDITAR', itemId: atual.id, tipoEvidencia: atual.tipoEvidencia,
                descricao: atual.descricao, obrigatoria: atual.obrigatoria },
            });
          } else {
            const criado = await repo.save(repo.create({ entregavelId: id,
              tipoEvidencia: item.tipoEvidencia.trim(), descricao: item.descricao?.trim() ?? null,
              obrigatoria: item.obrigatoria,
            }));
            await this.auditoria.registrarNaTransacao(m, ator, {
              acao: AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA,
              entidadeTipo: 'ENTREGAVEL', entidadeId: id,
              dadosAnteriores: { operacao: 'CRIAR' },
              dadosPosteriores: { itemId: criado.id, tipoEvidencia: criado.tipoEvidencia,
                descricao: criado.descricao, obrigatoria: criado.obrigatoria },
            });
          }
        }
        return this.itens(m, id);
  }

  /** PUT para reconfigurar o checklist sem editar outros campos. */
  async substituirChecklist(contratoId: string, id: string, dto: SubstituirChecklistDto, ator: UsuarioAutenticado) {
    try {
      return await this.dataSource.transaction(async (m) => {
        await this.bloquearContrato(m, contratoId);
        const e = await this.registro(m, contratoId, id);
        await this.validarEtapa(m, contratoId, e.etapaId);
        if (e.regularizacaoDocumentalSolicitada || ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? ''))
          throw new ConflictException('Reabra o entregável ou resolva a decisão antes de alterar o checklist');
        const itens = await this.salvarChecklist(m, contratoId, id, dto.itens, ator);
        return visao(e, itens);
      });
    } catch (error) { return erroPostgres(error); }
  }
}
