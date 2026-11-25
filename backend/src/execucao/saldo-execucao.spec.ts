import { describe, expect, it } from '@jest/globals';
import { saldoParcelas } from './saldo-execucao.js';
describe('Saldo de contribuições em centésimos de percentual',()=>{
  it('soma apenas reconhecimento, preservando reserva pendente',()=>{
    expect(saldoParcelas(0,[{reconhecido:8000,reservado:0},{reconhecido:0,reservado:1000}])).toEqual({reconhecido:8000,reservado:1000,saldo:1000});
  });
  it('preserva execução legada e libera saldo na rejeição',()=>{
    expect(saldoParcelas(4500,[{reconhecido:2000,reservado:0},{reconhecido:0,reservado:0}])).toEqual({reconhecido:6500,reservado:0,saldo:3500});
  });
  it('comprovação sem contribuição não aumenta execução',()=>{
    expect(saldoParcelas(0,[{reconhecido:3000,reservado:0},{reconhecido:0,reservado:0}]).reconhecido).toBe(3000);
  });
  it('não arredonda parcelas individualmente nem oculta conflitos',()=>{
    expect(saldoParcelas(0,[{reconhecido:9999,reservado:2}])).toEqual({reconhecido:9999,reservado:2,saldo:0});
  });
});
