import { z } from 'zod';

export const LIMITES_CONTA = { nome: 30, email: 40, senha: 30, senhaMinima: 12 } as const;
export const nomeContaSchema = z.string().transform(v => v.trim().replace(/\s+/g, ' ')).pipe(z.string()
  .min(3, 'Informe um nome válido (mínimo de 3 caracteres).').max(LIMITES_CONTA.nome, 'Nome: máximo de 30 caracteres.')
  .regex(/^\p{L}[\p{L}\p{M}’'.-]*(?: +\p{L}[\p{L}\p{M}’'.-]*)*$/u, 'Informe um nome válido.'));
export const emailContaSchema = z.string().trim().toLowerCase().pipe(z.email('Informe um e-mail válido.').max(LIMITES_CONTA.email, 'E-mail: máximo de 40 caracteres.'));
export const senhaContaSchema = z.string().min(LIMITES_CONTA.senhaMinima, 'A senha precisa ter ao menos 12 caracteres.')
  .max(LIMITES_CONTA.senha, 'A senha deve ter no máximo 30 caracteres.')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).+$/, 'Use maiúscula, minúscula, número e símbolo.');
