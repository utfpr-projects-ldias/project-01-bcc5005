import { configuracaoPeriodicidadeV1Valida, configuracoesPeriodicidadeEquivalentes } from './configuracao-periodicidade.js';

describe('modalidade da recorrência', () => {
  it.each([{versao:1},{versao:1,modoRegistro:'DESCRITIVO'},{versao:1,modoRegistro:'QUANTITATIVO'}])('aceita %j', valor => {
    expect(configuracaoPeriodicidadeV1Valida(valor)).toBe(true);
  });
  it.each([null,{}, {versao:2},{versao:1,modoRegistro:'OUTRO'},{versao:1,modoRegistro:null},{versao:1,intervalo:2}])('rejeita %j', valor => {
    expect(configuracaoPeriodicidadeV1Valida(valor)).toBe(false);
  });
});


it('ignora ordem de chaves mas não inventa modalidade para configuração legada', () => {
  expect(configuracoesPeriodicidadeEquivalentes({versao:1,modoRegistro:'DESCRITIVO'},{modoRegistro:'DESCRITIVO',versao:1})).toBe(true);
  expect(configuracoesPeriodicidadeEquivalentes({versao:1},{versao:1,modoRegistro:'DESCRITIVO'})).toBe(false);
});
