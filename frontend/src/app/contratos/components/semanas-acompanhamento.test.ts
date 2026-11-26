import { semanaDe, semanasDoMes, estadoDaSemana, mesesDoAno, limitarDataAcompanhamento } from './semanas-acompanhamento';
test('semana de domingo a sábado, sem perder a identidade em meses diferentes',()=>{
  const s=semanaDe('2026-11-26','2026-11-02','2026-11-30');
  expect(s).toMatchObject({inicio:'2026-11-22',fim:'2026-11-28',rotulo:'22–28',mes:'novembro'});
  expect(semanaDe('2026-12-01','2026-11-01','2026-12-10')).toEqual(semanaDe('2026-11-30','2026-11-01','2026-12-10'));
});
test('vigência limita primeira e última semana',()=>{
  const s=semanasDoMes('2026-11','2026-11-02','2026-11-30');
  expect(s[0].inicio).toBe('2026-11-02'); expect(s.at(-1)?.fim).toBe('2026-11-30');
  expect(s).toHaveLength(5);
});
test('prioriza atraso real, sem transformar dias vazios em atraso',()=>{
 const s=semanaDe('2026-11-26','2026-11-02','2026-11-30');
 expect(estadoDaSemana(s,()=> 'SEM_REGISTROS')).toBe('SEM_REGISTROS');
 expect(estadoDaSemana(s,d=>d===s.inicio?'ATRASADO':'CONCLUIDO')).toBe('ATRASADO');
});

test('meses completos e parciais respeitam a vigência',()=>{
 const meses=mesesDoAno('2026','2026-10-05','2027-01-01');
 expect(meses.map(m=>m.chave)).toEqual(['2026-10','2026-11','2026-12']);
 expect(meses[0]).toMatchObject({inicio:'2026-10-05',fim:'2026-10-31'});
 expect(mesesDoAno('2027','2026-10-05','2027-01-01')[0]).toMatchObject({inicio:'2027-01-01',fim:'2027-01-01'});
 expect(mesesDoAno('2028','2026-10-05','2027-01-01')).toEqual([]);
});
test('Hoje e a navegação permanecem dentro da vigência',()=>{
 expect(limitarDataAcompanhamento('2026-11-26','2026-10-01','2027-01-01')).toBe('2026-11-26');
 expect(limitarDataAcompanhamento('2027-02-01','2026-10-01','2027-01-01')).toBe('2027-01-01');
 expect(limitarDataAcompanhamento('2026-09-30','2026-10-01','2027-01-01')).toBe('2026-10-01');
});
