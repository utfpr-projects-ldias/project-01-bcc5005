import { z } from 'zod';

/** Alinhado ao CreateAtividadeDto (class-validator) e às regras HU08 no backend. */
export const TIPOS_ATIVIDADE = ['Reunião', 'Visita técnica', 'Entrega parcial', 'Vistoria', 'Outro'] as const;
const obrigatorio = (nome: string, max: number) => z.string().trim().min(1, `${nome} é obrigatório.`)
  .max(max, `${nome} aceita no máximo ${max} caracteres.`);
const opcional = (nome: string, max: number) => z.string().trim()
  .max(max, `${nome} aceita no máximo ${max} caracteres.`);
export const atividadeSchema = z.object({
  titulo: obrigatorio('Título', 120),
  dataHora: z.string().min(1, 'Informe data e hora.').refine(s => Number.isFinite(new Date(s).getTime()), 'Data e hora inválidas.'),
  tipo: z.enum(TIPOS_ATIVIDADE),
  descricao: obrigatorio('Descrição', 1500),
  responsavel: opcional('Responsável', 120),
  duracao: opcional('Duração', 50),
  participantes: opcional('Participantes', 2000).superRefine((valor, ctx) => {
    const pessoas = valor.split(',').map(p => p.trim()).filter(Boolean);
    if (pessoas.length > 20) ctx.addIssue({ code: 'custom', message: 'Informe no máximo 20 participantes.' });
    if (pessoas.some(p => p.length > 100)) ctx.addIssue({ code: 'custom', message: 'Cada participante pode ter até 100 caracteres.' });
  }),
  local: opcional('Local', 160),
  observacoes: opcional('Observações', 1000),
  ocorrenciaId: z.string().uuid().nullable().optional(),
  ocorrenciaIds: z.array(z.string().uuid()).refine(ids => new Set(ids).size === ids.length, 'Ocorrências repetidas.').optional(),
  quantidadeExecucao: z.string().regex(/^\d{1,15}(?:\.\d{1,3})?$/, 'Informe uma quantidade válida.').nullable().optional(),
  entregavelIds: z.array(z.string().uuid()).min(1, 'Selecione pelo menos um entregável.')
    .refine(ids => new Set(ids.map(id => id.toLowerCase())).size === ids.length, 'Entregáveis repetidos.'),
});
export type FormularioAtividade = z.input<typeof atividadeSchema>;
export const justificativaAtividadeSchema = z.string().trim().min(15, 'Justificativa deve ter no mínimo 15 caracteres.')
  .max(200, 'Justificativa aceita no máximo 200 caracteres.');
