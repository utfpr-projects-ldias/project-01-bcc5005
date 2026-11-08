import { indicadoresPlanejamento, resumoComprovacao } from './indicadores-planejamento';
import type { Entregavel } from './entregaveis';
const e = (extras: Partial<Entregavel> = {}): Entregavel => ({
  id: 'x', contratoId: 'c', etapaId: 'et', codigo: null, nome: 'X', descricao: null, tipo: 'UNICO',
  responsavelId: null, inicioPrevisto: null, terminoPrevisto: null, quantidadePrevista: null,
  quantidadeRealizada: null, unidadeMedida: null, periodicidade: null, configuracaoPeriodicidade: null,
  peso: null, criterioConclusao: null, statusExecucao: null, percentualExecucao: null,
  situacaoComprovacao: null, observacoes: null, evidenciasEsperadas: [], ...extras,
});
test('null não se transforma em 0% realizado nem em evidência enviada', () => {
  expect(indicadoresPlanejamento([e({evidenciasEsperadas:[{id:'ee', tipoEvidencia:'Foto', descricao:null, obrigatoria:true}]})]))
    .toMatchObject({total:1, comExecucao:0, concluidos:0, esperadas:1, obrigatorias:1, todosComDados:false});
  expect(resumoComprovacao(e())).toBe('Comprovação ainda não acompanhada');
});
test('status de conclusão somente conta quando fornecido pela API', () => {
  expect(indicadoresPlanejamento([e({statusExecucao:'CONCLUIDO', percentualExecucao:'100', situacaoComprovacao:'COMPROVADO'}), e()]))
    .toMatchObject({total:2, comExecucao:1, concluidos:1, todosComDados:false});
  expect(resumoComprovacao(e({situacaoComprovacao:'COMPROVADO'}))).toBe('Comprovação registrada como completa');
});
