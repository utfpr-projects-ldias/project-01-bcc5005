import { z } from 'zod';
import type { DadosContrato } from './contratos';

/** Limites de UX alinhados aos DTOs do NestJS. Textos longos: convenção da equipe,
 * não limites estipulados pelo PRD; podem ser refinados com o cliente. */
export const LIMITES_CONTRATO = {
  numeroContrato: 25, processoAdministrativo: 25, orgaoContratante: 30,
  unidadeResponsavel: 30, objeto: 50, descricao: 400,
  fiscalGestor: 25, observacoes: 200,
} as const;

function dataCivilValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [ano, mes, dia] = valor.split('-').map(Number);
  if (ano < 1 || ano > 9999 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const data = new Date(0);
  data.setUTCHours(0, 0, 0, 0);
  data.setUTCFullYear(ano, mes - 1, dia);
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

const dataObrigatoria = z.string().refine(dataCivilValida, 'Informe uma data válida.');
const textoObrigatorio = (rotulo: string, max: number) => z.string().trim()
  .min(1, `${rotulo} é obrigatório.`).max(max, `${rotulo}: máximo de ${max} caracteres.`);
const textoOpcional = (rotulo: string, max: number) => z.string().trim()
  .max(max, `${rotulo}: máximo de ${max} caracteres.`).nullable();

export const contratoSchema = z.object({
  numeroContrato: textoObrigatorio('Número do contrato', LIMITES_CONTRATO.numeroContrato).regex(/^\d+$/, 'Use somente números no número do contrato.'),
  processoAdministrativo: textoOpcional('Processo administrativo', LIMITES_CONTRATO.processoAdministrativo),
  orgaoContratante: textoObrigatorio('Órgão contratante', LIMITES_CONTRATO.orgaoContratante),
  unidadeResponsavel: textoOpcional('Unidade responsável', LIMITES_CONTRATO.unidadeResponsavel),
  objeto: textoObrigatorio('Objeto', LIMITES_CONTRATO.objeto),
  descricao: textoOpcional('Descrição', LIMITES_CONTRATO.descricao),
  dataAssinatura: dataObrigatoria.nullable(),
  inicioVigencia: dataObrigatoria,
  terminoVigencia: dataObrigatoria,
  status: z.enum(['PLANEJAMENTO', 'EM_EXECUCAO', 'EM_ENCERRAMENTO', 'CONCLUIDO', 'ENCERRADO', 'SUSPENSO', 'CANCELADO']),
  responsavelInternoId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Selecione um responsável interno válido.').nullable(),
  fiscalGestor: textoOpcional('Fiscal/gestor público', LIMITES_CONTRATO.fiscalGestor),
  modoCalculo: z.enum(['SIMPLES', 'PONDERADO']),
  observacoes: textoOpcional('Observações', LIMITES_CONTRATO.observacoes),
}).refine(d => d.terminoVigencia >= d.inicioVigencia,
  { path: ['terminoVigencia'], message: 'O término não pode ser anterior ao início da vigência.' });

export const duracaoMesesSchema = z.coerce.number().int('A duração deve ser inteira.')
  .min(1, 'A duração mínima é 1 mês.').max(1200, 'A duração máxima é 1200 meses.');

export type ErrosContrato = Partial<Record<keyof DadosContrato | 'meses', string>>;

/** Valores legados maiores que o limite novo permanecem legíveis e não são
 * reenviados quando outro campo é alterado. Textos novos/alterados obedecem
 * integralmente ao limite reduzido. */
export function validarContrato(dados: DadosContrato, inicial?: Partial<DadosContrato>):
  | { sucesso: true; dados: DadosContrato }
  | { sucesso: false; erros: ErrosContrato } {
  const legado: Partial<Record<keyof DadosContrato, string>> = {};
  const paraValidar = { ...dados };
  if (inicial) for (const chave of Object.keys(LIMITES_CONTRATO) as Array<keyof typeof LIMITES_CONTRATO>) {
    const atual = dados[chave];
    const anterior = inicial[chave];
    if (typeof atual === 'string' && atual === anterior &&
      (atual.length > LIMITES_CONTRATO[chave] || (chave === 'numeroContrato' && !/^\d+$/.test(atual)))) {
      legado[chave] = atual;
      (paraValidar as unknown as Record<string, unknown>)[chave] = chave === 'numeroContrato' ? '1' : atual.slice(0, LIMITES_CONTRATO[chave]);
    }
  }
  const resultado = contratoSchema.safeParse(paraValidar);
  if (resultado.success) {
    const d = resultado.data;
    return { sucesso: true, dados: {
      ...d, ...legado,
      processoAdministrativo: legado.processoAdministrativo ?? (d.processoAdministrativo || null),
      unidadeResponsavel: legado.unidadeResponsavel ?? (d.unidadeResponsavel || null),
      descricao: legado.descricao ?? (d.descricao || null),
      fiscalGestor: legado.fiscalGestor ?? (d.fiscalGestor || null),
      observacoes: legado.observacoes ?? (d.observacoes || null),
    } };
  }
  const erros: ErrosContrato = {};
  for (const issue of resultado.error.issues) {
    const campo = issue.path[0] as keyof DadosContrato;
    if (campo && !erros[campo]) erros[campo] = issue.message;
  }
  return { sucesso: false, erros };
}
