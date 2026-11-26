import { modalidadeEncerramento } from './modalidade-encerramento';
test.each([[false,false,null],[true,false,'encerrar'],[false,true,'finalizar'],[true,true,'encerrar']] as const)('permissões e elegibilidade %s / %s', (solicitar,finalizar,esperado)=>{
  expect(modalidadeEncerramento(solicitar,finalizar)).toBe(esperado);
});
