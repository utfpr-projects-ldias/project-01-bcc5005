import { agruparDiario } from './diario-atividades';
const registros=[{id:'a',dataHora:'2026-11-25T01:00:00Z'},{id:'b',dataHora:'2026-11-24T14:00:00Z'},{id:'c',dataHora:'2026-11-23T13:00:00Z'}];
test('agrupa pelo dia civil brasileiro e não duplica atividade com vários vínculos',()=>{
 const grupos=agruparDiario([...registros,registros[0]],'recentes');
 expect(grupos.map(g=>g.chave)).toEqual(['2026-11-24','2026-11-23']);
 expect(grupos[0].itens.map(a=>a.id)).toEqual(['a','b']);
});
test('ordenação por duração não é destruída pelo agrupamento cronológico',()=>{
 const grupos=agruparDiario([registros[2],registros[0],registros[1]],'duracao-desc');
 expect(grupos).toHaveLength(1);expect(grupos[0].itens.map(a=>a.id)).toEqual(['c','a','b']);
});
test('data inválida não produz dia fictício',()=>expect(agruparDiario([{id:'x',dataHora:'inválida'}],'antigas')[0].chave).toBe('sem-data'));
