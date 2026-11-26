import { intervaloVigencia, validarDatasNaVigencia } from './vigencia-planejamento';
const v = {inicioVigencia:'2026-11-01',terminoVigencia:'2026-11-30'};
test('informa a vigência civil, inclusive os dias inicial e final',()=>{
  expect(intervaloVigencia(v)).toBe('01/11/2026 a 30/11/2026');
  expect(validarDatasNaVigencia({inicioPrevisto:v.inicioVigencia,terminoPrevisto:v.terminoVigencia},v)).toEqual({});
});
test('marca cada campo fora do intervalo com a origem e os limites',()=>{
  const erros=validarDatasNaVigencia({inicioPrevisto:'2026-10-31',terminoPrevisto:'2026-12-01'},v);
  expect(erros.inicioPrevisto).toContain('01/11/2026 a 30/11/2026');
  expect(erros.terminoPrevisto).toContain('vigência do contrato');
});
test('não impede edição de metadados de um plano histórico',()=>{
  const antigo={inicioPrevisto:'2026-10-01',terminoPrevisto:'2026-11-30'};
  expect(validarDatasNaVigencia(antigo,v,antigo)).toEqual({});
  expect(validarDatasNaVigencia({...antigo,inicioPrevisto:'2026-10-02'},v,antigo)).toHaveProperty('inicioPrevisto');
  expect(validarDatasNaVigencia(antigo)).toEqual({});
});
