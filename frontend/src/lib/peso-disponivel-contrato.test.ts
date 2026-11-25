import { pesoDisponivelContrato, saldoPesosRascunho } from './peso-disponivel-contrato';
test('contabiliza pesos de etapas diferentes, exclui o próprio item e arquivados', () => {
  const itens = [{ id: 'a', peso: '25', arquivadoEm: null }, { id: 'b', peso: '35', arquivadoEm: null },
    { id: 'arquivado', peso: '40', arquivadoEm: '2026-11-01' }];
  expect(pesoDisponivelContrato(itens)).toBe(40);
  expect(pesoDisponivelContrato(itens, 'a')).toBe(65);
  expect(pesoDisponivelContrato(undefined, 'a')).toBeNull();
});

test('saldo projetado usa o peso digitado, ignora arquivados e identifica excedente',()=>{
  const itens=[{id:'a',peso:'20'},{id:'b',peso:'15'},{id:'c',peso:'90',arquivadoEm:'2026-11-01'}];
  expect(saldoPesosRascunho(itens,'a','20')).toBe(65);
  expect(saldoPesosRascunho(itens,'a','0')).toBe(85);
  expect(saldoPesosRascunho(itens,'a','')).toBe(85);
  expect(saldoPesosRascunho(itens,undefined,'70')).toBe(-5);
  expect(saldoPesosRascunho(undefined,'a','20')).toBeNull();
});

test('B05: preserva quatro casas e exclui entregável de etapa arquivada', () => {
  const itens = [{id:'a',peso:'33.3333'}, {id:'b',peso:'33.3333'}, {id:'c',peso:'33.3333'}, {id:'d',peso:'100',etapaArquivada:true}];
  expect(pesoDisponivelContrato(itens)).toBe(0.0001);
  expect(saldoPesosRascunho(itens,undefined,'0,0001')).toBe(0);
});
