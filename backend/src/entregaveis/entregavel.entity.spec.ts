import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { Etapa } from '../etapas/etapa.entity.js';
import { configuracaoPeriodicidadeV1Valida } from './configuracao-periodicidade.js';
import { Entregavel } from './entregavel.entity.js';
import { EvidenciaEsperada } from './evidencia-esperada.entity.js';
import { TipoEntregavel } from './tipo-entregavel.enum.js';

const metadata = getMetadataArgsStorage();
const coluna = (alvo: Function, propriedade: string) =>
  metadata.columns.find(item => item.target === alvo && item.propertyName === propriedade);

describe('HU07-01 — entidades e contrato de planejamento', () => {
  it('expõe exatamente os cinco tipos do PRD e bloqueia personalização v1', () => {
    expect(Object.values(TipoEntregavel)).toEqual([
      'UNICO', 'QUANTITATIVO', 'RECORRENTE', 'CONTINUO', 'MARCO',
    ]);
    expect(configuracaoPeriodicidadeV1Valida({ versao: 1 })).toBe(true);
    for (const valor of [null, [], { versao: 2 }, { versao: '1' },
      { versao: 1, intervalo: 3 }, { versao: 1, dias: [1, 3] }, {}]) {
      expect(configuracaoPeriodicidadeV1Valida(valor)).toBe(false);
    }
  });

  it('tem contrato/etapa obrigatórios e vínculo composto no mesmo contrato', () => {
    expect(metadata.tables.find(item => item.target === Entregavel)?.name).toBe('entregaveis');
    expect(coluna(Entregavel, 'contratoId')?.options).toMatchObject({ name: 'contrato_id', type: 'uuid' });
    expect(coluna(Entregavel, 'etapaId')?.options).toMatchObject({ name: 'etapa_id', type: 'uuid' });
    const etapa = metadata.relations.find(item => item.target === Entregavel && item.propertyName === 'etapa');
    expect(etapa?.options).toMatchObject({ nullable: false, onDelete: 'RESTRICT' });
    const pares = metadata.joinColumns.filter(item => item.target === Entregavel && item.propertyName === 'etapa');
    expect(pares.map(item => [item.name, item.referencedColumnName])).toEqual([
      ['etapa_id', 'id'], ['contrato_id', 'contratoId'],
    ]);
    expect(metadata.uniques.find(item => item.target === Etapa && item.name === 'uq_etapas_id_contrato')?.columns)
      .toEqual(['id', 'contratoId']);
  });

  it('usa decimal para quantidades, peso, progresso; datas civis; execução/prova independentes', () => {
    expect(coluna(Entregavel, 'quantidadePrevista')?.options)
      .toMatchObject({ type: 'numeric', precision: 18, scale: 3, nullable: true });
    expect(coluna(Entregavel, 'quantidadeRealizada')?.options)
      .toMatchObject({ type: 'numeric', precision: 18, scale: 3, nullable: true });
    expect(coluna(Entregavel, 'peso')?.options)
      .toMatchObject({ type: 'numeric', precision: 7, scale: 4, nullable: true });
    expect(coluna(Entregavel, 'percentualExecucao')?.options)
      .toMatchObject({ type: 'numeric', precision: 5, scale: 2, nullable: true });
    expect(coluna(Entregavel, 'inicioPrevisto')?.options)
      .toMatchObject({ type: 'date', nullable: true });
    expect(coluna(Entregavel, 'terminoPrevisto')?.options)
      .toMatchObject({ type: 'date', nullable: true });
    for (const prop of ['statusExecucao', 'percentualExecucao', 'situacaoComprovacao']) {
      expect(coluna(Entregavel, prop)?.options.nullable).toBe(true);
      expect(coluna(Entregavel, prop)?.options.default).toBeUndefined();
    }
  });

  it('evidência esperada tem FK RESTRICT sem upload, comprovação ou exclusão cascata', () => {
    expect(metadata.tables.find(item => item.target === EvidenciaEsperada)?.name).toBe('evidencias_esperadas');
    expect(coluna(EvidenciaEsperada, 'entregavelId')?.options)
      .toMatchObject({ name: 'entregavel_id', type: 'uuid' });
    expect(coluna(EvidenciaEsperada, 'obrigatoria')?.options).toMatchObject({ type: 'boolean', default: false });
    expect(metadata.relations.find(item => item.target === EvidenciaEsperada && item.propertyName === 'entregavel')?.options)
      .toMatchObject({ nullable: false, onDelete: 'RESTRICT' });
    const props = metadata.columns.filter(c => c.target === EvidenciaEsperada).map(c => c.propertyName);
    expect(props).toEqual(expect.arrayContaining(['id', 'entregavelId', 'tipoEvidencia', 'descricao', 'obrigatoria']));
    expect(props).not.toEqual(expect.arrayContaining(['arquivo', 'url', 'hash', 'comprovacao']));
  });
});
