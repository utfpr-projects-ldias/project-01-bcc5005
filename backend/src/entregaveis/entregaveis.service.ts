import {
  BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, QueryFailedError, Repository } from 'typeorm';

import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ResolverEscopoContratoService } from '../autorizacao/resolver-escopo-contrato.service.js';
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
import { TipoEntregavel } from './tipo-entregavel.enum.js';

const CAMPOS_MUTAVEIS = [
  'etapaId', 'nome', 'tipo', 'codigo', 'descricao', 'responsavelId',
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
  if (e.peso !== null && (!decimalValido(e.peso, 3, 4) || Number(e.peso) > 100)) {
    throw new BadRequestException('Peso operacional individual deve estar entre 0 e 100');
  }
  if (!Object.values(TipoEntregavel).includes(e.tipo)) throw new BadRequestException('Tipo de entregável inválido');
  if (e.tipo === TipoEntregavel.QUANTITATIVO &&
    (e.quantidadePrevista === null || Number(e.quantidadePrevista) <= 0 || !textoObrigatorio(e.unidadeMedida, 80))) {
    throw new BadRequestException('Quantitativo exige quantidade prevista maior que zero e unidade');
  }
  if (e.tipo === TipoEntregavel.RECORRENTE) {
    if (!e.periodicidade || !configuracaoPeriodicidadeV1Valida(e.configuracaoPeriodicidade)) {
      throw new BadRequestException('Recorrente exige periodicidade fixa e configuração {versao:1}');
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

function visao(e: Entregavel, itens: EvidenciaEsperada[]) {
  return {
    id: e.id, contratoId: e.contratoId, etapaId: e.etapaId,
    codigo: e.codigo, nome: e.nome, descricao: e.descricao, tipo: e.tipo,
    responsavelId: e.responsavelId,
    responsavel: e.responsavel ? { nome: e.responsavel.nome, email: e.responsavel.email } : null,
    inicioPrevisto: e.inicioPrevisto, terminoPrevisto: e.terminoPrevisto,
    quantidadePrevista: e.quantidadePrevista, quantidadeRealizada: e.quantidadeRealizada,
    unidadeMedida: e.unidadeMedida, periodicidade: e.periodicidade,
    configuracaoPeriodicidade: e.configuracaoPeriodicidade, peso: e.peso,
    criterioConclusao: e.criterioConclusao, statusExecucao: e.statusExecucao,
    percentualExecucao: e.percentualExecucao, situacaoComprovacao: e.situacaoComprovacao,
    observacoes: e.observacoes,
    evidenciasEsperadas: itens.map((item) => ({
      id: item.id, tipoEvidencia: item.tipoEvidencia, descricao: item.descricao,
      obrigatoria: item.obrigatoria,
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

  /** Busca exclusivamente funcionários ativos, por contrato autorizado no guard. Não concede vínculos. */
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

  private async bloquearContrato(m: EntityManager, contratoId: string): Promise<void> {
    const contrato = await m.getRepository(Contrato).createQueryBuilder('c')
      .setLock('pessimistic_write').where('c.id = :contratoId', { contratoId }).getOne();
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
  }

  private async validarEtapa(m: EntityManager, contratoId: string, etapaId: string): Promise<void> {
    if (!await m.getRepository(Etapa).findOneBy({ id: etapaId, contratoId })) {
      throw new NotFoundException('Etapa não encontrada neste contrato');
    }
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
    return e;
  }

  private async itens(m: EntityManager, id: string) {
    return m.getRepository(EvidenciaEsperada).find({
      where: { entregavelId: id }, order: { tipoEvidencia: 'ASC', id: 'ASC' },
    });
  }

  async listar(contratoId: string, etapaId?: string) {
    if (!await this.dataSource.getRepository(Contrato).findOneBy({ id: contratoId })) {
      throw new NotFoundException('Contrato não encontrado');
    }
    if (etapaId) await this.validarEtapa(this.dataSource.manager, contratoId, etapaId);
    const registros = await this.entregaveis.find({
      where: etapaId ? { contratoId, etapaId } : { contratoId },
      relations: { responsavel: true },
      order: { etapaId: 'ASC', nome: 'ASC', id: 'ASC' },
    });
    const ids = registros.map((e) => e.id);
    const itens = ids.length ? await this.evidencias.createQueryBuilder('ev')
      .where('ev.entregavelId IN (:...ids)', { ids })
      .orderBy('ev.tipoEvidencia', 'ASC').addOrderBy('ev.id', 'ASC').getMany() : [];
    return registros.map((e) => visao(e, itens.filter((item) => item.entregavelId === e.id)));
  }

  async detalhar(contratoId: string, id: string) {
    const e = await this.entregaveis.findOne({ where: { id, contratoId }, relations: { responsavel: true } });
    if (!e) throw new NotFoundException('Entregável não encontrado');
    return visao(e, await this.itens(this.dataSource.manager, id));
  }

  async criar(contratoId: string, dto: CriarEntregavelDto, ator: UsuarioAutenticado) {
    try {
      return await this.dataSource.transaction(async (m) => {
        await this.bloquearContrato(m, contratoId);
        await this.validarEtapa(m, contratoId, dto.etapaId);
        await this.validarResponsavel(m, dto.responsavelId ?? null);
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
        const salvo = await m.getRepository(Entregavel).save(e);
        await this.auditoria.registrarNaTransacao(m, ator, {
          acao: AcaoAuditoria.ENTREGAVEL_CRIADO, entidadeTipo: 'ENTREGAVEL', entidadeId: salvo.id,
          dadosPosteriores: snapshot(salvo),
        });
        const itens = dto.evidenciasEsperadas?.length
          ? await this.salvarChecklist(m, salvo.id, dto.evidenciasEsperadas, ator) : [];
        return visao(salvo, itens);
      });
    } catch (error) { return erroPostgres(error); }
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
        validarPlanejamento(e);
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
          ? await this.itens(m, id) : await this.salvarChecklist(m, id, dto.evidenciasEsperadas, ator);
        await this.auditoria.registrarNaTransacao(m, ator, {
          acao: AcaoAuditoria.ENTREGAVEL_EDITADO, entidadeTipo: 'ENTREGAVEL', entidadeId: id,
          dadosAnteriores: anterior, dadosPosteriores: snapshot(salvo),
        });
        return visao(salvo, itens);
      });
    } catch (error) { return erroPostgres(error); }
  }

  /** Lista completa, auditada item a item, sob a transação externa. */
  private async salvarChecklist(m: EntityManager, id: string, itens: SubstituirChecklistDto['itens'],
    ator: UsuarioAutenticado) {
        const repo = m.getRepository(EvidenciaEsperada);
        const anteriores = await this.itens(m, id);
        const porId = new Map(anteriores.map((item) => [item.id, item]));
        const enviados = new Set<string>();
        if (!Array.isArray(itens) || itens.length > 10) throw new BadRequestException('Checklist inválido');
        for (const item of itens) {
          if (!textoObrigatorio(item.tipoEvidencia, 100) ||
            (item.descricao != null && !textoObrigatorio(item.descricao, 3000)) ||
            typeof item.obrigatoria !== 'boolean') throw new BadRequestException('Item de evidência esperado inválido');
          if (item.id) {
            if (!porId.has(item.id)) throw new ConflictException('ID de evidência esperada inexistente ou de outro entregável');
            if (enviados.has(item.id)) throw new BadRequestException('Checklist contém ID repetido');
            enviados.add(item.id);
          }
        }
        // Auditoria por item evita truncamento de snapshots quando o checklist é grande.
        // Cada gravação e respectivo evento vivem na mesma transação.
        for (const item of anteriores) {
          if (enviados.has(item.id)) continue;
          await repo.delete({ id: item.id, entregavelId: id });
          await this.auditoria.registrarNaTransacao(m, ator, {
            acao: AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA,
            entidadeTipo: 'ENTREGAVEL', entidadeId: id,
            dadosAnteriores: { itemId: item.id, tipoEvidencia: item.tipoEvidencia,
              descricao: item.descricao, obrigatoria: item.obrigatoria },
            dadosPosteriores: { operacao: 'REMOVER' },
          });
        }
        for (const item of itens) {
          if (item.id) {
            const atual = porId.get(item.id)!;
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
        const itens = await this.salvarChecklist(m, id, dto.itens, ator);
        return visao(e, itens);
      });
    } catch (error) { return erroPostgres(error); }
  }
}
