import { nomeContaSchema, emailContaSchema, senhaContaSchema } from './validacao-conta';
test('limites de conta são validados no Zod sem exigir sobrenome',()=>{
  expect(nomeContaSchema.safeParse('  Maria  ').success).toBe(true);
  expect(nomeContaSchema.safeParse('A'.repeat(30)).success).toBe(true);
  expect(nomeContaSchema.safeParse('A'.repeat(31)).success).toBe(false);
  expect(emailContaSchema.safeParse('a'.repeat(28)+'@example.com').success).toBe(true);
  expect(emailContaSchema.safeParse('a'.repeat(29)+'@example.com').success).toBe(false);
  expect(senhaContaSchema.safeParse('Aa1!'+ 'x'.repeat(26)).success).toBe(true);
  expect(senhaContaSchema.safeParse('Aa1!'+ 'x'.repeat(27)).success).toBe(false);
  expect(senhaContaSchema.safeParse('a'.repeat(30)).success).toBe(false);
});
