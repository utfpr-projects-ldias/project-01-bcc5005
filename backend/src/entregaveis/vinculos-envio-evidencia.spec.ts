import { idsVinculadosEnvio } from './vinculos-envio-evidencia.js';
const a='00000000-0000-4000-8000-000000000001';
const b='00000000-0000-4000-8000-000000000002';
describe('vínculos de envio de evidência',()=>{
  it('preserva os dois destinos distintos sem criar vínculos quando ausentes',()=>{
    expect(idsVinculadosEnvio()).toEqual([]);
    expect(idsVinculadosEnvio(`${a},${b}`)).toEqual([a,b]);
  });
  it('rejeita identificadores malformados e repetidos',()=>{
    for(const v of ['', 'invalid', `${a},${a}`, `${a},`])expect(()=>idsVinculadosEnvio(v)).toThrow();
  });
  it('limita o total de destinos',()=>{
    const ids=Array.from({length:101},(_,i)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`);
    expect(idsVinculadosEnvio(ids.slice(0,100).join(','))).toHaveLength(100);
    expect(()=>idsVinculadosEnvio(ids.join(','))).toThrow();
  });
});
