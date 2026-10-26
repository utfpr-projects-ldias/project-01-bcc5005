import { SetMetadata } from '@nestjs/common';

export const CHAVE_POLITICA = 'autorizacao:politica';

/** Nunca aceitar política, perfil ou ID de usuário enviado pelo cliente. */
export type AcaoProtegida =
  | 'perfil:proprio'
  | 'usuarios:administrar'
  | 'contratos:criar'
  | 'contratos:listar'
  | 'contratos:visualizar'
  | 'contratos:editar';

export type Politica = {
  acao: AcaoProtegida;
  /** Para visualizar/editar exige identificar contrato nos parâmetros da ROTA. */
  parametroContrato?: string;
};

/** Aplicar em método ou controller; o guard global negará rotas internas sem política. */
export function ExigirPolitica(acao: AcaoProtegida, parametroContrato?: string) {
  return SetMetadata(CHAVE_POLITICA, { acao, parametroContrato } satisfies Politica);
}
