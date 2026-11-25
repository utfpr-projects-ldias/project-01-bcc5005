import { calcularDistribuicaoPesos } from './distribuicao-pesos';
test.each([
 [['33,3333','33,3333','33,3334'],100,true],
 [['25','35','40'],100,true],
 [['100','0'],100,true],
 [['99,9999'],99.9999,false],
 [['100',''],100,false],
 [['100','0,00001'],100,false],
 [['101'],0,false],
 [[],0,false],
] as const)('valida distribuição %j', (valores,soma,valida)=>expect(calcularDistribuicaoPesos(valores)).toEqual({soma,valida}));
