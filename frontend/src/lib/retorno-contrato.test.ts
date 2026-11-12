import { consumirRetornoContrato, guardarRetornoContrato, lerRetornoContrato, limparRetornoContrato } from './retorno-contrato';
test('salva somente coordenadas e consome uma única vez', () => {
  const inicial=window.scrollY;
  Object.defineProperty(window,'scrollY',{configurable:true,value:600});
  try {
    guardarRetornoContrato('c1');
    expect(consumirRetornoContrato('c1')).toEqual({x:window.scrollX,y:600});
    expect(consumirRetornoContrato('c1')).toBeNull();
  } finally {Object.defineProperty(window,'scrollY',{configurable:true,value:inicial});}
});

test('a leitura não destrutiva sobrevive a renderizações intermediárias', () => {
  guardarRetornoContrato('qa-persistente');
  const primeiro = lerRetornoContrato('qa-persistente');
  expect(primeiro).not.toBeNull();
  expect(lerRetornoContrato('qa-persistente')).toEqual(primeiro);
  limparRetornoContrato('qa-persistente');
  expect(lerRetornoContrato('qa-persistente')).toBeNull();
});
