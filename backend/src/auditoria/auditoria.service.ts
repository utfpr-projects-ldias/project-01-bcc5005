import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { AcaoAuditoria, TIPO_ENTIDADE_POR_ACAO, type TipoEntidadeAuditada } from './acao-auditoria.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { EventoAuditoria } from './evento-auditoria.entity.js';

export type AlteracaoAuditavel = {
  acao: AcaoAuditoria;
  entidadeTipo: TipoEntidadeAuditada;
  entidadeId: string;
  dadosAnteriores?: Record<string, unknown> | null;
  dadosPosteriores?: Record<string, unknown> | null;
};

/**
 * Contrato de integração v1 — implementado exclusivamente pelo módulo proprietário.
 * O EntityManager é o da transação que grava o evento; consultar a FK persistida,
 * não um contratoId fornecido pelo DTO/cliente. Retornar null se o ID não existir.
 */
export type TipoContextoExtensivel = Exclude<
  TipoEntidadeAuditada, 'CONTRATO' | 'USUARIO' | 'ETAPA'
>;
export type ResolvedorContextoAuditoria = (
  manager: EntityManager,
  entidadeId: string,
) => Promise<string | null>;

const UUID_CONTRATO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Os snapshots são de campos de negócio selecionados pelo serviço chamador.
// Nunca enviar o corpo HTTP bruto, identidade enviada pelo navegador ou credenciais.
const CAMPO_SENSIVEL = /senha|password|token|secret|api.?key|cookie|authorization|credencial|hash|session|sessao|chave.?privada|private.?key/i;
const CHAVE_ESTRUTURAL_PERIGOSA = /^(?:__proto__|constructor|prototype)$/i;
const MAX_JSON = 16_384;

function limparValor(valor: unknown, nivel = 0): unknown {
  if (nivel > 8) throw new Error('Profundidade excessiva em dados de auditoria');
  if (valor === null || typeof valor === 'string' || typeof valor === 'boolean') return valor;
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) throw new Error('Data de auditoria inválida');
    return valor.toISOString();
  }
  if (Array.isArray(valor)) return valor.map((item) => limparValor(item, nivel + 1));
  if (typeof valor === 'object' && valor !== null &&
      (Object.getPrototypeOf(valor) === Object.prototype || Object.getPrototypeOf(valor) === null)) {
    const resultado: Record<string, unknown> = {};
    for (const [chave, conteudo] of Object.entries(valor as Record<string, unknown>)) {
      if (CAMPO_SENSIVEL.test(chave) || CHAVE_ESTRUTURAL_PERIGOSA.test(chave) || conteudo === undefined) continue;
      resultado[chave] = limparValor(conteudo, nivel + 1);
    }
    return resultado;
  }
  throw new Error('Tipo não suportado em dados de auditoria');
}

function snapshotSeguro(dados: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (dados == null) return null;
  if (typeof dados !== 'object' || Array.isArray(dados) ||
      (Object.getPrototypeOf(dados) !== Object.prototype && Object.getPrototypeOf(dados) !== null)) {
    throw new Error('Snapshot de auditoria deve ser objeto simples');
  }
  const limpos = limparValor(dados) as Record<string, unknown>;
  if (JSON.stringify(limpos).length > MAX_JSON) {
    throw new Error('Snapshot de auditoria excedeu o tamanho permitido');
  }
  return limpos;
}

function validarEvento(evento: AlteracaoAuditavel): void {
  if (!Object.values(AcaoAuditoria).includes(evento.acao)) {
    throw new Error('Ação de auditoria inválida');
  }
  const tipoEsperado = TIPO_ENTIDADE_POR_ACAO[evento.acao];
  if (evento.entidadeTipo !== tipoEsperado || typeof evento.entidadeId !== 'string' ||
      !evento.entidadeId.trim() || evento.entidadeId.length > 255 || evento.entidadeId !== evento.entidadeId.trim()) {
    throw new Error('Recurso de auditoria inválido');
  }
}

@Injectable()
export class AuditoriaService {
  private readonly resolvedoresContexto = new Map<
    TipoContextoExtensivel, ResolvedorContextoAuditoria
  >();

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Cada HU/TEC registra UM resolvedor para sua entidade no onModuleInit.
   * Tipos legados e Etapa possuem resolução própria e não podem ser substituídos.
   * O registro falha se dois módulos tentarem se declarar donos do mesmo tipo.
   */
  registrarResolvedorContexto(
    tipo: TipoContextoExtensivel,
    resolvedor: ResolvedorContextoAuditoria,
  ): void {
    const permitidos: readonly string[] = [
      'ENTREGAVEL', 'OCORRENCIA', 'ATIVIDADE', 'DOCUMENTO',
    ];
    if (!permitidos.includes(tipo) || typeof resolvedor !== 'function') {
      throw new Error('Tipo ou resolvedor de auditoria inválido');
    }
    if (this.resolvedoresContexto.has(tipo)) {
      throw new Error(`Resolvedor de auditoria já registrado: ${tipo}`);
    }
    this.resolvedoresContexto.set(tipo, resolvedor);
  }

  /**
   * Forma recomendada para HU05-02: alteração de domínio + evento na MESMA transação.
   * A operação deve usar exclusivamente o EntityManager recebido para escrever dados.
   * Se a gravação da entidade ou do evento falhar, o TypeORM faz rollback de tudo.
   */
  async executarComAuditoria<T>(
    ator: UsuarioAutenticado,
    operacao: (manager: EntityManager) => Promise<{ resultado: T; evento: AlteracaoAuditavel }>,
  ): Promise<T> {
    this.validarAtor(ator);
    return this.dataSource.transaction(async (manager) => {
      const { resultado, evento } = await operacao(manager);
      await this.registrarNaTransacao(manager, ator, evento);
      return resultado;
    });
  }

  /** Para módulos que já controlam a própria transação (mesmo EntityManager). */
  async registrarNaTransacao(
    manager: EntityManager,
    ator: UsuarioAutenticado,
    evento: AlteracaoAuditavel,
  ): Promise<void> {
    this.validarAtor(ator);
    validarEvento(evento);
    const anterior = snapshotSeguro(evento.dadosAnteriores);
    const posterior = snapshotSeguro(evento.dadosPosteriores);
    const contratoId = await this.resolverContratoRaiz(manager, evento);
    const repositorio = manager.getRepository(EventoAuditoria);
    const registro = repositorio.create({
      atorSupertokensUserId: ator.supertokensUserId,
      acao: evento.acao,
      entidadeTipo: evento.entidadeTipo,
      entidadeId: evento.entidadeId,
      contratoId,
      dadosAnteriores: anterior,
      dadosPosteriores: posterior,
    });
    await repositorio.save(registro); // falha propagada: nunca engolir erro de auditoria
  }

  /**
   * Contexto de contrato SEM aceitar contratoId do navegador ou do evento.
   * CONTRATO: o ID vem da própria entidade persistida pelo chamador na transação.
   * ETAPA: resolver pela FK real da Etapa já persistida usando o MESMO manager.
   * USUARIO: não pertence a um contrato único, portanto NULL.
   * Demais entidades: NULL até o módulo dono registrar um resolvedor persistido.
   * Com resolvedor, NULL/ID inválido aborta a transação.
   * É proibido preencher esse campo com DTO, querystring ou chave estrangeira presumida.
   */
  private async resolverContratoRaiz(
    manager: EntityManager,
    evento: AlteracaoAuditavel,
  ): Promise<string | null> {
    if (evento.entidadeTipo === 'CONTRATO') return evento.entidadeId;
    if (evento.entidadeTipo === 'USUARIO') return null;
    if (evento.entidadeTipo === 'ETAPA') {
      const etapa = await manager.getRepository(Etapa).findOne({
        where: { id: evento.entidadeId },
        select: { contratoId: true },
      });
      if (!etapa?.contratoId) {
        throw new Error('Etapa auditada não encontrada no banco para obter contrato raiz');
      }
      return etapa.contratoId;
    }

    // Compatibilidade: até o módulo dono existir, eventos antigos dos tipos
    // operacionais podem continuar sem contexto (NULL). Quando houver adapter,
    // falhas/retornos inválidos bloqueiam a transação para impedir contexto forjado.
    const resolvedor = this.resolvedoresContexto.get(evento.entidadeTipo);
    if (!resolvedor) return null;
    const contratoRaiz = await resolvedor(manager, evento.entidadeId);
    if (typeof contratoRaiz !== 'string' || !UUID_CONTRATO.test(contratoRaiz)) {
      throw new Error('Recurso auditado sem contrato raiz persistido válido');
    }
    return contratoRaiz;
  }

  private validarAtor(ator: UsuarioAutenticado): void {
    if (!ator?.id?.trim() || !ator.supertokensUserId?.trim()) {
      throw new Error('Auditoria exige usuário autenticado e provisionado no servidor');
    }
  }
}
