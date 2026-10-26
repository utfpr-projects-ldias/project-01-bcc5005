import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { AcaoAuditoria, type TipoEntidadeAuditada } from './acao-auditoria.js';
import { EventoAuditoria } from './evento-auditoria.entity.js';

export type AlteracaoAuditavel = {
  acao: AcaoAuditoria;
  entidadeTipo: TipoEntidadeAuditada;
  entidadeId: string;
  dadosAnteriores?: Record<string, unknown> | null;
  dadosPosteriores?: Record<string, unknown> | null;
};

// Os snapshots são de campos de negócio selecionados pelo serviço chamador.
// Nunca enviar o corpo HTTP bruto, identidade enviada pelo navegador ou credenciais.
const CAMPO_SENSIVEL = /senha|password|token|secret|api.?key|cookie|authorization|credencial|hash|session|sessao/i;
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
      if (CAMPO_SENSIVEL.test(chave) || conteudo === undefined) continue;
      resultado[chave] = limparValor(conteudo, nivel + 1);
    }
    return resultado;
  }
  throw new Error('Tipo não suportado em dados de auditoria');
}

function snapshotSeguro(dados: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (dados == null) return null;
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
  const tipoEsperado = evento.acao.startsWith('CONTRATO_') ? 'CONTRATO' : 'USUARIO';
  if (evento.entidadeTipo !== tipoEsperado || !evento.entidadeId?.trim()) {
    throw new Error('Recurso de auditoria inválido');
  }
}

@Injectable()
export class AuditoriaService {
  constructor(private readonly dataSource: DataSource) {}

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
    const repositorio = manager.getRepository(EventoAuditoria);
    const registro = repositorio.create({
      atorSupertokensUserId: ator.supertokensUserId,
      acao: evento.acao,
      entidadeTipo: evento.entidadeTipo,
      entidadeId: evento.entidadeId,
      dadosAnteriores: anterior,
      dadosPosteriores: posterior,
    });
    await repositorio.save(registro); // falha propagada: nunca engolir erro de auditoria
  }

  private validarAtor(ator: UsuarioAutenticado): void {
    if (!ator?.id?.trim() || !ator.supertokensUserId?.trim()) {
      throw new Error('Auditoria exige usuário autenticado e provisionado no servidor');
    }
  }
}
