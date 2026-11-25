import { diasDeVigencia, formatarVigencia, rotuloPrazoVigencia } from './prazo-vigencia';
const agora=new Date('2026-11-25T02:30:00Z'); // 24/11 às 23h30 em São Paulo
it('usa dias civis de São Paulo em vez da virada UTC',()=>{
  expect(diasDeVigencia('2026-11-25',agora)).toBe(1);
  expect(rotuloPrazoVigencia('2026-11-24',false,agora)).toBe('Vence hoje');
  expect(rotuloPrazoVigencia('2026-11-23',false,agora)).toBe('Vencido há 1 dia');
});
it('não confunde finalização administrativa com vencimento',()=>{
  expect(rotuloPrazoVigencia('2026-11-23',true,agora)).toBe('Fluxo finalizado');
  expect(diasDeVigencia('2026-02-30',agora)).toBeNull();
  expect(rotuloPrazoVigencia(null,false,agora)).toBe('Não informado');
});
it('apresenta datas em formato brasileiro',()=>expect(formatarVigencia('2026-11-01','2026-12-01')).toBe('01/11/2026 – 01/12/2026'));
