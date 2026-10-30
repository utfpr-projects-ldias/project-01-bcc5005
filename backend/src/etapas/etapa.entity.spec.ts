import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';

import { Etapa } from './etapa.entity.js';
import { StatusEtapa } from './status-etapa.enum.js';

describe('HU06-01 — modelo Etapa', () => {
  const metadata = getMetadataArgsStorage();
  const coluna = (campo: string) =>
    metadata.columns.find((item) => item.target === Etapa && item.propertyName === campo);

  it('representa a tabela etapas sem exigir campos opcionais não impostos pelo PRD', () => {
    expect(metadata.tables.find((item) => item.target === Etapa)?.name).toBe('etapas');
    expect(coluna('contratoId')?.options).toMatchObject({ name: 'contrato_id', type: 'uuid' });
    expect(coluna('nome')?.options).toMatchObject({ type: 'varchar', length: 255 });
    expect(coluna('sequencia')?.options).toMatchObject({ type: 'integer' });
    expect(coluna('inicioPrevisto')?.options).toMatchObject({ name: 'inicio_previsto', type: 'date', nullable: true });
    expect(coluna('terminoPrevisto')?.options).toMatchObject({ name: 'termino_previsto', type: 'date', nullable: true });
    for (const campo of ['codigo', 'descricao', 'inicioPrevisto', 'terminoPrevisto', 'observacoes']) {
      expect(coluna(campo)?.options.nullable).toBe(true);
    }
  });

  it('usa status próprio, sem misturar estados do contrato', () => {
    expect(Object.values(StatusEtapa)).toEqual(['PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA']);
    expect(coluna('status')?.options).toMatchObject({
      type: 'enum', enumName: 'etapas_status_enum', default: StatusEtapa.PLANEJADA,
    });
  });

  it('tem FK RESTRICT e unicidade de ordem adiável por contrato', () => {
    const relacionamento = metadata.relations.find((item) => item.target === Etapa && item.propertyName === 'contrato');
    expect(relacionamento?.options).toMatchObject({ nullable: false, onDelete: 'RESTRICT' });
    const unique = metadata.uniques.find((item) => item.target === Etapa && item.name === 'uq_etapas_contrato_sequencia');
    expect(unique?.columns).toEqual(['contratoId', 'sequencia']);
    expect(unique?.deferrable).toBe('INITIALLY IMMEDIATE');
  });
});
