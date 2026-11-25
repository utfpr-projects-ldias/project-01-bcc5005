import 'reflect-metadata';
import { CHAVE_POLITICA, type Politica } from './politica.decorator.js';
import { POLITICAS_OPERACIONAIS } from './politicas-operacionais.js';
import { ACAO_PERMISSAO, permissoesEfetivas } from './permissoes-granulares.js';
import { OcorrenciasController } from '../ocorrencias/ocorrencias.controller.js';

describe('ativação temporal: política coerente entre rota, guard e autorização', () => {
  it('declara escopo de contrato com ação própria, sem ampliar edição de recursos', () => {
    const politica = Reflect.getMetadata(CHAVE_POLITICA,
      Reflect.get(OcorrenciasController.prototype, 'iniciarPrevistas') as Function) as Politica;
    expect(politica).toEqual({
      acao: 'ocorrencias:iniciar-previstas',
      escopoOperacional: { tipo: 'contrato', parametro: 'contratoId' },
    });
    expect(POLITICAS_OPERACIONAIS[politica.acao as 'ocorrencias:iniciar-previstas']).toMatchObject({
      escopo: 'contrato', classe: 'planejamento', recurso: 'ocorrencia',
    });
    expect(POLITICAS_OPERACIONAIS['ocorrencias:editar'].escopo).toBe('recurso');
  });
  it('usa apenas editarOcorrencias: gestor leitor não herda autorização', () => {
    expect(ACAO_PERMISSAO['ocorrencias:iniciar-previstas']).toBe('editarOcorrencias');
    expect(permissoesEfetivas('ADMINISTRADOR', false, null).editarOcorrencias).toBe(true);
    expect(permissoesEfetivas('GESTOR', true, null).editarOcorrencias).toBe(true);
    expect(permissoesEfetivas('GESTOR', false, null).editarOcorrencias).toBe(false);
    expect(permissoesEfetivas('COLABORADOR', false, null).editarOcorrencias).toBe(false);
    expect(permissoesEfetivas('COLABORADOR', false, { editarOcorrencias: true }).editarOcorrencias).toBe(true);
  });
});
