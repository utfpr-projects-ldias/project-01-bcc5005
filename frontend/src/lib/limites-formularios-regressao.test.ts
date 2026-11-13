import { LIMITES_CONTRATO, contratoSchema, validarContrato } from './validacao-contrato';
import { atividadeSchema } from './validacao-atividade';

const contrato = {
  numeroContrato: '123/2026', processoAdministrativo: null, orgaoContratante: 'Órgão',
  unidadeResponsavel: null, objeto: 'Serviço', descricao: null, dataAssinatura: null,
  inicioVigencia: '2026-01-01', terminoVigencia: '2026-12-31', status: 'PLANEJAMENTO' as const,
  responsavelInternoId: null, fiscalGestor: null, modoCalculo: 'SIMPLES' as const, observacoes: null,
};

test('limites administrativos reduzidos sem alterar números técnicos', () => {
  expect(LIMITES_CONTRATO).toMatchObject({ numeroContrato:25, orgaoContratante:30, objeto:50, descricao:500, observacoes:200 });
  expect(contratoSchema.safeParse({...contrato, numeroContrato: 'X'.repeat(26)}).success).toBe(false);
  expect(contratoSchema.safeParse({...contrato, orgaoContratante: 'X'.repeat(31)}).success).toBe(false);
});

test('texto legado inalterado não impede a edição de outro campo nem é truncado', () => {
  const legado = { ...contrato, numeroContrato: 'X'.repeat(55), orgaoContratante: 'Órgão', objeto: 'Serviço', observacoes: 'Y'.repeat(450) };
  const resultado = validarContrato({...legado, orgaoContratante:'Setor atualizado'}, legado);
  expect(resultado.sucesso).toBe(true);
  if (resultado.sucesso) {
    expect(resultado.dados.numeroContrato).toHaveLength(55);
    expect(resultado.dados.observacoes).toHaveLength(450);
  }
});

test('novo título e descrição de atividade respeitam os limites do negócio', () => {
  const atividade = { titulo:'T'.repeat(51), dataHora:'2026-11-13T10:00:00', tipo:'Vistoria',
    descricao:'A'.repeat(501), responsavel:'', duracao:'', participantes:'', local:'', observacoes:'', entregavelIds: [] };
  const resultado = atividadeSchema.safeParse(atividade);
  expect(resultado.success).toBe(false);
  if (!resultado.success) expect(resultado.error.issues.map(i=>i.path[0])).toEqual(expect.arrayContaining(['titulo','descricao']));
});
