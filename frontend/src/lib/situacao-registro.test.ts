import { situacaoRegistro, opcoesSituacaoRegistros } from './situacao-registro';

describe('situações de registros', () => {
  test.each<[string,string,string|undefined,string]>([
    ['MANUAL','REJEITADO',undefined,'Em revisão'],
    ['EVIDENCIA','PENDENTE','EM_REVISAO','Em revisão'],
    ['ATIVIDADE','INATIVO','ARQUIVADO','Arquivado'],
    ['EVIDENCIA','INATIVO','ARQUIVADO','Arquivado'],
    ['EVIDENCIA','INATIVO','SUBSTITUIDO','Substituído'],
    ['ATIVIDADE','INATIVO','EXCLUIDO','Excluído'],
    ['MANUAL','INATIVO',undefined,'Sem efeito'],
    ['MANUAL','LEGADO',undefined,'Reconhecido'],
    ['ATIVIDADE','APROVADO','VERIFICADA','Verificada'],
    ['OCORRENCIA','APROVADO',undefined,'Concluída'],
  ])('%s %s %s: %s', (origem,situacao,estado,esperado) => {
    expect(situacaoRegistro(origem,situacao,estado)).toBe(esperado);
  });
  test('filtros incluem apenas situações existentes, sem duplicatas', () => {
    expect(opcoesSituacaoRegistros([
      {origem:'MANUAL',situacao:'REJEITADO'},
      {origem:'EVIDENCIA',situacao:'REJEITADO'},
      {origem:'ATIVIDADE',situacao:'INATIVO',situacaoRegistro:'ARQUIVADO'},
    ])).toEqual(['Arquivado','Em revisão']);
  });
});
