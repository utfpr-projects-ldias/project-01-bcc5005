import { atividadeSchema, justificativaAtividadeSchema } from './validacao-atividade';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const validos = { titulo: ' Reunião ', dataHora: '2026-11-09T10:00', tipo: 'Reunião', descricao: ' Visita ',
  responsavel: '', local: '', duracao: '', participantes: '', observacoes: '', entregavelIds: [id] };

test('Zod aplica limites e normaliza obrigatórios sem exigir opcionais', () => {
  const r = atividadeSchema.safeParse(validos);
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.titulo).toBe('Reunião');
});
test('Zod rejeita atividade sem vínculo, datas inválidas e duplicações', () => {
  expect(atividadeSchema.safeParse({ ...validos, entregavelIds: [] }).success).toBe(false);
  expect(atividadeSchema.safeParse({ ...validos, entregavelIds: [id, id] }).success).toBe(false);
  expect(atividadeSchema.safeParse({ ...validos, dataHora: 'data inválida' }).success).toBe(false);
  expect(atividadeSchema.safeParse({ ...validos, titulo: ' '.repeat(10) }).success).toBe(false);
});
test('justificativa é obrigatória e limitada', () => {
  expect(justificativaAtividadeSchema.safeParse(' ').success).toBe(false);
  expect(justificativaAtividadeSchema.safeParse('x'.repeat(201)).success).toBe(false);
  expect(justificativaAtividadeSchema.safeParse('Conferido').success).toBe(false);
  expect(justificativaAtividadeSchema.safeParse(' Conferido e validado ').success).toBe(true);
});

test('Patch35: campos de atividades não aceitam texto além do limite de interface', () => {
  expect(atividadeSchema.safeParse({ ...validos, titulo:'X'.repeat(61) }).success).toBe(false);
  expect(atividadeSchema.safeParse({ ...validos, descricao:'X'.repeat(751) }).success).toBe(false);
  expect(atividadeSchema.safeParse({ ...validos, local:'X'.repeat(81) }).success).toBe(false);
  expect(atividadeSchema.safeParse({ ...validos, observacoes:'X'.repeat(176) }).success).toBe(false);
});
