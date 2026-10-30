import { SetMetadata } from '@nestjs/common';
import type { AcaoOperacional, RecursoOperacional } from './politicas-operacionais.js';

export const CHAVE_POLITICA = 'autorizacao:politica';

/** Nunca aceitar política, perfil ou ID de usuário enviado pelo cliente. */
export type AcaoLegada =
  | 'perfil:proprio'
  | 'usuarios:administrar'
  | 'contratos:criar'
  | 'contratos:listar'
  | 'contratos:visualizar'
  | 'contratos:editar';

export type AcaoProtegida = AcaoLegada | AcaoOperacional;

/**
 * Somente parâmetros da ROTA são confiáveis para identificar o alvo.
 * 'contrato' — listagem/criação em contrato existente;
 * 'recurso' — detalhe/mutação cujo contrato é obtido da entidade persistida.
 * Para rotas aninhadas, parâmetroContratoPai força coerência entre IDs.
 */
export type EscopoOperacional =
  | { tipo: 'contrato'; parametro: string }
  | {
      tipo: 'recurso';
      recurso: RecursoOperacional;
      parametro: string;
      parametroContratoPai?: string;
    };

export type Politica = {
  acao: AcaoProtegida;
  /** Compatibilidade estrita com os controllers antigos. */
  parametroContrato?: string;
  /** Obrigatório para todas as novas ações operacionais. */
  escopoOperacional?: EscopoOperacional;
};

/** Mantido para endpoints existentes; não usar para novas ações operacionais. */
export function ExigirPolitica(acao: AcaoLegada, parametroContrato?: string) {
  return SetMetadata(CHAVE_POLITICA, { acao, parametroContrato } satisfies Politica);
}

/** Declarar sempre uma ação concreta e seu escopo; nunca autorizar por ID do body. */
export function ExigirPoliticaOperacional(acao: AcaoOperacional, escopoOperacional: EscopoOperacional) {
  return SetMetadata(CHAVE_POLITICA, { acao, escopoOperacional } satisfies Politica);
}
