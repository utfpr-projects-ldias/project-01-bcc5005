import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, In, IsNull, Not, QueryFailedError, Repository } from 'typeorm';

import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { documentacaoVerificada, filhosEmRevisao, concluirEtapaAposFilhos, atividadesPendentesDeVerificacao } from './conclusao-documental.js';
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
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { calcularPeriodosRecorrentes } from '../ocorrencias/ocorrencias.service.js';
import { avaliarAgendaRecorrente } from '../ocorrencias/avaliar-agenda-recorrente.js';
import { ConfiguracaoOcorrencias } from '../ocorrencias/configuracao-ocorrencias.entity.js';
import { EvidenciaEsperada } from './evidencia-esperada.entity.js';
import { ComprovanteEvidencia } from './comprovante-evidencia.entity.js';
import { TipoEntregavel } from './tipo-entregavel.enum.js';
import { aptidaoFisicaParaConclusao } from './conclusao-fisica.js';

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

export function validarPlanejamento(e: Entregavel): void {
  if (!textoObrigatorio(e.nome, 255)) throw new BadRequestException('Nome obrigatório e limitado a 255 caracteres');
  for (const [campo, valor, limite] of [
    ['Código', e.codigo, 50], ['Unidade', e.unidadeMedida, 80],
    ['Descrição', e.descricao, 3000], ['Observações', e.observacoes, 3000],
    ['Critério', e.criterioConclusao, 5000],
  ] as const) {
    if (valor !== null && !textoObrigatorio(valor, limite)) {
      throw new BadRequestException(`${campo} não pode ser vazio e deve respeitar o limite`);
    }
  }
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
  } else if (e.periodicidade !== null || e.configuracaoPeriodicidade !== null) {
    throw new BadRequestException('Periodicidade somente é permitida para entregável recorrente');
  }
  if ((e.tipo === TipoEntregavel.MARCO || e.tipo === TipoEntregavel.CONTINUO) &&
    !textoObrigatorio(e.criterioConclusao, 5000)) {
    throw new BadRequestException('Marco e Contínuo exigem critério textual explícito de conclusão/controle operacional');
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
    quantidadePrevista: e.quantidadePrevista, quantidadeRealizada: e.quantidadeRealizada,
    unidadeMedida: e.unidadeMedida, periodicidade: e.periodicidade,
    configuracaoPeriodicidade: e.configuracaoPeriodicidade, peso: e.peso,
    criterioConclusao: e.criterioConclusao, statusExecucao: e.statusExecucao, motivoFinalizacao: e.motivoFinalizacao ?? null,
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

  private async bloquearContrato(m: EntityManager, contratoId: string, somenteConclusao = false): Promise<void> {
    const contrato = await m.getRepository(Contrato).createQueryBuilder('c')
      .setLock('pessimistic_write').where('c.id = :contratoId', { contratoId }).getOne();
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.arquivadoEm) throw new ConflictException('Contrato arquivado: planejamento bloqueado');
    if ((contrato.status === 'CONCLUIDO' || contrato.status === 'ENCERRADO') ||
      (!somenteConclusao && contrato.reabertoEm === null && await documentacaoVerificada(m, contratoId) && !await filhosEmRevisao(m, contratoId)))
      throw new ConflictException('Contrato concluído: reabra antes de modificar o planejamento');
  }

  private async validarEtapa(m: EntityManager, contratoId: string, etapaId: string, somenteLeitura = false): Promise<void> {
    const etapa = await m.getRepository(Etapa).findOneBy({ id: etapaId, contratoId });
    if (!etapa) throw new NotFoundException('Etapa não encontrada neste contrato');
    if (!somenteLeitura && (etapa.conclusaoSolicitadaEm || etapa.encerramentoSolicitadoEm || etapa.arquivadoEm || etapa.status === 'CONCLUIDA' || etapa.status === 'ENCERRADA' ||
      (etapa.reabertoEm === null && await documentacaoVerificada(m, contratoId, etapaId))))
      throw new ConflictException('Reative ou reabra a etapa antes de alterar entregáveis');
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
    const entregaveis = await this.entregaveis.find({ where: { contratoId, arquivadoEm: IsNull() }, select: { id: true } });
    const ids = entregaveis.map(item => item.id);
    if (!ids.length) return {};
    const evidencias = await this.evidencias.find({
      where: { entregavelId: In(ids), arquivadoEm: IsNull() },
      select: { id: true, entregavelId: true, obrigatoria: true },
    });
    const identificadores = evidencias.map(e => e.id);
    const versoes = identificadores.length ? await this.dataSource.getRepository(ComprovanteEvidencia).find({
      where: { contratoId, evidenciaEsperadaId: In(identificadores) },
      select: { evidenciaEsperadaId: true, status: true },
      order: { criadoEm: 'DESC', id: 'DESC' },
    }) : [];
    const ultima = new Map<string, 'PENDENTE_VERIFICACAO' | 'VERIFICADA'>();
    for (const versao of versoes) if (!ultima.has(versao.evidenciaEsperadaId)) ultima.set(versao.evidenciaEsperadaId, versao.status);
    const resposta: Record<string, { obrigatorias: number; verificadas: number; total: number; verificadasTotal: number }> = {};
    for (const item of entregaveis) resposta[item.id] = { obrigatorias: 0, verificadas: 0, total: 0, verificadasTotal: 0 };
    for (const evidencia of evidencias) {
      const resumo = resposta[evidencia.entregavelId];
      if (!resumo) continue;
      resumo.total += 1;
      const verificada = ultima.get(evidencia.id) === 'VERIFICADA';
      if (verificada) resumo.verificadasTotal += 1;
      if (evidencia.obrigatoria) {
        resumo.obrigatorias += 1;
        if (verificada) resumo.verificadas += 1;
      }
    }
    return resposta;
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
    return registros.map((e) => visao(e, itens.filter((item) => item.entregavelId === e.id && !item.arquivadoEm)));
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
    return visao(e, await this.itens(this.dataSource.manager, id), Boolean(e.arquivadoEm));
  }

  /** Evita que a soma de participações operacionais ativas ultrapasse 100%,
   * mesmo para requisições que não passam pelo formulário React. */
  private async validarPesoNoContrato(m: EntityManager, contratoId: string, peso: string | null | undefined, excetoId?: string) {
    if (peso == null) return;
    const linhas = await m.query(`SELECT COALESCE(SUM(peso), 0)::text AS soma FROM "entregaveis"
      WHERE "contrato_id" = $1 AND "arquivado_em" IS NULL AND ($2::uuid IS NULL OR "id" <> $2::uuid)`,
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
        // O peso operacional representa parcelas da realização contratual.
        // Não permitir criar um entregável extra após todo o contrato estar alocado,
        // mesmo que o cliente tente contornar a interface omitindo o campo peso.
        const ocupacao = await m.query(`SELECT COALESCE(SUM(peso), 0)::numeric AS total FROM entregaveis
          WHERE contrato_id=$1 AND arquivado_em IS NULL`, [contratoId]) as Array<{ total: string }>;
        if (Number(ocupacao[0]?.total ?? 0) >= 99.99999)
          throw new ConflictException('Os entregáveis existentes já representam 100% do contrato. Redistribua os pesos para cadastrar outro entregável.');
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
          // Campos de execução/comprovação INTENCIONALMENTE NULL — responsabilidade de TEC09/TEC10.
          quantidadeRealizada: null, statusExecucao: null, percentualExecucao: null, situacaoComprovacao: null,
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
      await this.bloquearContrato(m, contratoId, true);
      if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
        const vinculo = await m.getRepository(PermissaoContrato).findOneBy({ usuarioId: ator.id, contratoId });
        if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).concluirEntregaveis)
          throw new ForbiddenException('Sem permissão para concluir entregáveis');
      }
      const repo = m.getRepository(Entregavel);
      const e = await repo.findOneBy({ id, contratoId });
      if (!e) throw new NotFoundException('Entregável não encontrado neste contrato');
      if (e.arquivadoEm) throw new ConflictException('Entregável arquivado');
      if (e.statusExecucao !== 'PENDENTE_CONCLUSAO') throw new ConflictException('A conclusão deve ser solicitada antes da aprovação');
      const pai = await m.getRepository(Etapa).findOneBy({ id: e.etapaId, contratoId });
      if (!pai || pai.arquivadoEm || ((['CONCLUIDA','ENCERRADA','FINALIZADA'].includes(pai.status)) && !pai.reabertoEm))
        throw new ConflictException('Reabra a etapa antes de alterar entregáveis');
      if (['CONCLUIDO','FINALIZADO'].includes(e.statusExecucao ?? '') && !e.reabertoEm)
        throw new ConflictException('Entregável já concluído');
      const fisico = await aptidaoFisicaParaConclusao(m, e);
      if (!fisico.apto) throw new ConflictException(fisico.motivo);
      if (!await documentacaoVerificada(m, contratoId, e.etapaId, id))
        throw new ConflictException('Existem evidências pendentes de verificação');
      if (await atividadesPendentesDeVerificacao(m, contratoId, null, id))
        throw new ConflictException('Verifique as atividades registradas neste entregável antes de concluí-lo');
      const revisoes = await m.query(`SELECT EXISTS (
        SELECT 1 FROM evidencias_esperadas WHERE entregavel_id = $1
          AND arquivado_em IS NULL AND reaberto_em IS NOT NULL
      ) AS pendentes`, [id]) as Array<{ pendentes: boolean }>;
      if (revisoes[0]?.pendentes)
        throw new ConflictException('Conclua novamente as evidências em revisão');
      const antes = { statusExecucao: e.statusExecucao, reabertoEm: e.reabertoEm ?? null };
      e.statusExecucao = 'CONCLUIDO' as Entregavel['statusExecucao'];
      e.reabertoEm = null;
      await repo.save(e);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ENTREGAVEL_STATUS_ALTERADO, entidadeTipo: 'ENTREGAVEL', entidadeId: id,
        dadosAnteriores: antes,
        dadosPosteriores: { statusExecucao: e.statusExecucao, reabertoEm: null, motivo: 'CONCLUSAO_EXPLICITA' },
      });
      // Reconcluir o último filho reconclui a etapa na mesma transação;
      // NUNCA conclui automaticamente o contrato.
      const etapaConcluida = await concluirEtapaAposFilhos(m, contratoId, e.etapaId, async (anterior, posterior) => {
        await this.auditoria.registrarNaTransacao(m, ator, {
          acao: AcaoAuditoria.ETAPA_STATUS_ALTERADO, entidadeTipo: 'ETAPA', entidadeId: e.etapaId,
          dadosAnteriores: anterior,
          dadosPosteriores: { ...posterior, motivo: 'CONCLUSAO_DOS_ENTREGAVEIS' },
        });
      });
      return { ...visao(e, await this.itens(m, id)), conclusoes: etapaConcluida ? ['entregável', 'etapa'] : ['entregável'] };
    });
  }

  private async validarPermissaoDecisao(m: EntityManager, contratoId: string, ator: UsuarioAutenticado) {
    if (ator.perfil === PerfilUsuario.ADMINISTRADOR) return;
    const vinculo = await m.findOneBy(PermissaoContrato, { contratoId, usuarioId: ator.id });
    if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).concluirEntregaveis)
      throw new ForbiddenException('Sem permissão para aprovar a finalização do entregável');
  }

  /** Solicitação não substitui a aprovação do Gestor/Administrador. */
  async solicitarConclusao(contratoId: string, id: string, ator: UsuarioAutenticado) {
    return this.dataSource.transaction(async m => {
      await this.bloquearContrato(m, contratoId, true);
      const e = await m.findOne(Entregavel, { where: { contratoId, id }, lock: { mode: 'pessimistic_write' } });
      if (!e || e.arquivadoEm) throw new NotFoundException('Entregável indisponível');
      if (['PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO','CONCLUIDO','FINALIZADO'].includes(e.statusExecucao ?? ''))
        throw new ConflictException('Já existe uma solicitação ou decisão final');
      const fisico = await aptidaoFisicaParaConclusao(m, e);
      if (!fisico.apto) throw new ConflictException(fisico.motivo);
      if (!await documentacaoVerificada(m, contratoId, e.etapaId, id))
        throw new ConflictException('Existem evidências pendentes de verificação');
      const anterior = { statusExecucao: e.statusExecucao };
      e.statusExecucao = 'PENDENTE_CONCLUSAO' as Entregavel['statusExecucao'];
      const salvo = await m.save(Entregavel, e);
      await this.auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.ENTREGAVEL_STATUS_ALTERADO,
        entidadeTipo: 'ENTREGAVEL', entidadeId: id, dadosAnteriores: anterior,
        dadosPosteriores: { statusExecucao: salvo.statusExecucao, solicitadoPor: ator.id } });
      return { ...visao(salvo, await this.itens(m, id)) };
    });
  }

  async solicitarEncerramento(contratoId: string, id: string, motivo: string, ator: UsuarioAutenticado) {
    const justificativa = motivo?.trim() ?? '';
    if (justificativa.length < 15 || justificativa.length > 200)
      throw new BadRequestException('Justifique o encerramento com 15 a 200 caracteres');
    return this.dataSource.transaction(async m => {
      await this.bloquearContrato(m, contratoId, true);
      const e = await m.findOne(Entregavel, { where: { contratoId, id }, lock: { mode: 'pessimistic_write' } });
      if (!e || e.arquivadoEm) throw new NotFoundException('Entregável indisponível');
      if (['PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO','CONCLUIDO','FINALIZADO'].includes(e.statusExecucao ?? ''))
        throw new ConflictException('Já existe uma solicitação ou decisão final');
      const fisico = await aptidaoFisicaParaConclusao(m, e);
      if (fisico.apto && await documentacaoVerificada(m, contratoId, e.etapaId, id))
        throw new ConflictException('A conclusão está disponível. Solicite conclusão em vez de encerramento.');
      const ocorrencias = await m.findBy(Ocorrencia, { contratoId, entregavelId: id, substituidaEm: IsNull() });
      if (e.tipo !== TipoEntregavel.UNICO && !ocorrencias.length)
        throw new ConflictException('Cadastre as ocorrências obrigatórias para este tipo');
      if (ocorrencias.some(o => !['CONCLUIDO','ENCERRADA'].includes(o.status)))
        throw new ConflictException('Resolva as ocorrências antes de solicitar encerramento');
      if (e.tipo === TipoEntregavel.RECORRENTE && e.inicioPrevisto && e.terminoPrevisto && e.periodicidade) {
        const inicioAgenda = e.agendaInicioFuturo ?? e.inicioPrevisto;
        const configuracao = await m.findOneBy(ConfiguracaoOcorrencias, { entregavelId: id, contratoId });
        const fimAgenda = e.agendaInicioFuturo ? configuracao?.terminoPrevisto ?? e.terminoPrevisto : e.terminoPrevisto;
        if (!fimAgenda) throw new ConflictException('Agenda recorrente sem término definido');
        let periodos: ReturnType<typeof calcularPeriodosRecorrentes>;
        try { periodos = calcularPeriodosRecorrentes(inicioAgenda, fimAgenda, e.periodicidade); }
        catch { throw new ConflictException('A agenda recorrente precisa ser regularizada'); }
        if (!avaliarAgendaRecorrente(ocorrencias, periodos, inicioAgenda).completa)
          throw new ConflictException('Gere a agenda recorrente completa antes de encerrar');
      }
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
      await this.bloquearContrato(m, contratoId, true);
      await this.validarPermissaoDecisao(m, contratoId, ator);
      const e = await m.findOne(Entregavel, { where: { contratoId, id }, lock: { mode: 'pessimistic_write' } });
      if (!e || e.arquivadoEm) throw new NotFoundException('Entregável indisponível');
      if (e.statusExecucao !== 'PENDENTE_ENCERRAMENTO') throw new ConflictException('Não há encerramento aguardando aprovação');
      const ocorrencias = await m.findBy(Ocorrencia, { contratoId, entregavelId: id, substituidaEm: IsNull() });
      if (ocorrencias.some(o => !['CONCLUIDO','ENCERRADA'].includes(o.status)))
        throw new ConflictException('Há ocorrências ainda não resolvidas');
      const anterior = { statusExecucao: e.statusExecucao };
      e.statusExecucao = 'FINALIZADO' as Entregavel['statusExecucao'];
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
      if (!etapaPai || etapaPai.arquivadoEm || etapaPai.status === 'CONCLUIDA' ||
        (etapaPai.reabertoEm === null && await documentacaoVerificada(m, contratoId, e.etapaId)))
        throw new ConflictException('Reabra a etapa antes de reabrir seu entregável');
      if (e.reabertoEm) throw new ConflictException('Entregável já foi reaberto');
      const operacional = e.statusExecucao === 'CONCLUIDO' || e.statusExecucao === 'FINALIZADO';
      if (!operacional && !await documentacaoVerificada(m, contratoId, e.etapaId, id))
        throw new ConflictException('Entregável ainda não possui todas as evidências verificadas');
      const anterior = e.statusExecucao;
      if (operacional || e.statusExecucao === 'PENDENTE_CONCLUSAO' || e.statusExecucao === 'PENDENTE_ENCERRAMENTO') e.statusExecucao = 'EM_ANDAMENTO' as Entregavel['statusExecucao'];
      e.motivoFinalizacao = null; e.finalizadoEm = null;
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
    if (!Object.keys(dto).length) throw new BadRequestException('Informe ao menos um campo');
    try {
      return await this.dataSource.transaction(async (m) => {
        await this.bloquearContrato(m, contratoId);
        const e = await this.registro(m, contratoId, id);
        if (['CONCLUIDO','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? '') ||
          (e.reabertoEm === null && await documentacaoVerificada(m, contratoId, e.etapaId, id)))
          throw new ConflictException('Entregável concluído: reabra antes de editar');
        if (dto.tipo !== undefined && dto.tipo !== e.tipo)
          throw new ConflictException('O tipo do entregável é imutável. Para utilizar outro tipo, crie um novo entregável.');
        // A política entregaveis:editar NÃO delega pesos ou o replanejamento
        // recorrente. Comparar contra o estado persistido antes de alterar.
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
        const anterior = snapshot(e);
        const antes = { tipo: e.tipo, etapaId: e.etapaId, periodicidade: e.periodicidade,
          configuracaoPeriodicidade: e.configuracaoPeriodicidade,
          inicioPrevisto: e.inicioPrevisto, terminoPrevisto: e.terminoPrevisto };
        const prazoAnterior = { inicioPrevisto: e.inicioPrevisto, terminoPrevisto: e.terminoPrevisto };
        for (const campo of CAMPOS_MUTAVEIS) {
          if (Object.prototype.hasOwnProperty.call(dto, campo)) {
            const valor = dto[campo];
            if (typeof valor === 'string' && !['quantidadePrevista', 'peso', 'inicioPrevisto', 'terminoPrevisto'].includes(campo)) {
              (e as unknown as Record<Campo, unknown>)[campo] = valor.trim();
            } else {
              (e as unknown as Record<Campo, unknown>)[campo] = valor;
            }
          }
        }
        if (e.tipo !== antes.tipo && (e.percentualExecucao != null || e.quantidadeRealizada != null || e.dataEfetivaMarco != null)) throw new ConflictException('Tipo não pode mudar após registrar execução física. Preserve o histórico.');
        validarPlanejamento(e);
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
        if (!Array.isArray(itens) || itens.length > 10 || itens.length + anteriores.filter(item => Boolean(item.arquivadoEm)).length > 10)
          throw new BadRequestException('Máximo de dez evidências por entregável, incluindo arquivadas');
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
        const itens = await this.salvarChecklist(m, contratoId, id, dto.itens, ator);
        return visao(e, itens);
      });
    } catch (error) { return erroPostgres(error); }
  }
}
