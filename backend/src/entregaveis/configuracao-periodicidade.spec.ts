import { configuracaoPeriodicidadeV1Valida } from './configuracao-periodicidade';

describe('modalidade da recorrência', () => {
  it.each([{versao:1},{versao:1,modoRegistro:'DESCRITIVO'},{versao:1,modoRegistro:'QUANTITATIVO'}])('aceita %j', valor => {
    expect(configuracaoPeriodicidadeV1Valida(valor)).toBe(true);
  });
  it.each([null,{}, {versao:2},{versao:1,modoRegistro:'OUTRO'},{versao:1,modoRegistro:null},{versao:1,intervalo:2}])('rejeita %j', valor => {
    expect(configuracaoPeriodicidadeV1Valida(valor)).toBe(false);
  });
});
