import { historicoCompativel } from './historico-migrations.js';
const a = { name: 'Primeira1790000000001', timestamp: '1790000000001' };
const b = { name: 'Segunda1790000000002', timestamp: '1790000000002' };
const migrations = [a, b];

describe('histórico de migrations', () => {
  it('aceita histórico fora de ordem e timestamps bigint como texto ou número', () => {
    expect(historicoCompativel(migrations, [{...b,timestamp:Number(b.timestamp)}, a], true)).toBe(true);
  });
  it('permite preencher migration histórica faltante sem liberar prontidão', () => {
    expect(historicoCompativel(migrations, [b], false)).toBe(true);
    expect(historicoCompativel(migrations, [b], true)).toBe(false);
  });
  it('recusa históricos repetidos, divergentes ou desconhecidos', () => {
    for (const linhas of [[a,a],[a,{...b,timestamp:a.timestamp}],[{name:'Estranha1790000000003',timestamp:'1790000000003'}]])
      expect(historicoCompativel(migrations, linhas, false)).toBe(false);
  });
  it('rejeita código com timestamps duplicados ou lista vazia', () => {
    expect(historicoCompativel([a,{name:'Outra1790000000001'}], [], false)).toBe(false);
    expect(historicoCompativel([], [], true)).toBe(false);
  });
});
