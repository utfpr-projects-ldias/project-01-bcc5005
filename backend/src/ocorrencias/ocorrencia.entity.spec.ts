import 'reflect-metadata';

import { getMetadataArgsStorage } from 'typeorm';

import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { AtividadeEntity } from '../atividades/atividade.entity.js';

import { Ocorrencia } from './ocorrencia.entity.js';
import { OrigemOcorrencia } from './origem-ocorrencia.enum.js';
import { StatusOcorrencia } from './status-ocorrencia.enum.js';

const metadata = getMetadataArgsStorage();

const coluna = (alvo: Function, propriedade: string) =>
  metadata.columns.find(
    (item) =>
      item.target === alvo &&
      item.propertyName === propriedade,
  );

describe('HU09-01 — entidade Ocorrencia', () => {
  it('registra a tabela e os campos fundamentais', () => {
    expect(
      metadata.tables.find(
        (item) => item.target === Ocorrencia,
      )?.name,
    ).toBe('ocorrencias');

    const propriedades = metadata.columns
      .filter((item) => item.target === Ocorrencia)
      .map((item) => item.propertyName);

    expect(propriedades).toEqual(
      expect.arrayContaining([
        'id',
        'entregavelId',
        'contratoId',
        'titulo',
        'periodoInicio',
        'periodoFim',
        'dataPrevista',
        'dataRealizada',
        'status',
        'quantidadeRealizada',
        'observacoes',
        'origem',
      ]),
    );
  });

  it('usa FK obrigatoria e RESTRICT para o entregavel', () => {
    const relacao = metadata.relations.find(
      (item) =>
        item.target === Ocorrencia &&
        item.propertyName === 'entregavel',
    );

    expect(relacao?.relationType).toBe('many-to-one');

    expect(relacao?.options).toMatchObject({
      nullable: false,
      onDelete: 'RESTRICT',
    });

    const colunas = metadata.joinColumns
      .filter(
        (item) =>
          item.target === Ocorrencia &&
          item.propertyName === 'entregavel',
      )
      .map((item) => [
        item.name,
        item.referencedColumnName,
      ]);

    expect(colunas).toEqual([
      ['entregavel_id', 'id'],
      ['contrato_id', 'contratoId'],
    ]);

    expect(coluna(Ocorrencia, 'entregavelId')?.options)
      .toMatchObject({
        name: 'entregavel_id',
        type: 'uuid',
      });

    expect(coluna(Ocorrencia, 'contratoId')?.options)
      .toMatchObject({
        name: 'contrato_id',
        type: 'uuid',
      });
  });

  it('utiliza datas civis e quantidade decimal', () => {
    for (const propriedade of [
      'periodoInicio',
      'periodoFim',
      'dataPrevista',
      'dataRealizada',
    ]) {
      expect(
        coluna(Ocorrencia, propriedade)?.options,
      ).toMatchObject({
        type: 'date',
        nullable: true,
      });
    }

    expect(
      coluna(Ocorrencia, 'quantidadeRealizada')?.options,
    ).toMatchObject({
      name: 'quantidade_realizada',
      type: 'numeric',
      precision: 18,
      scale: 3,
      nullable: true,
    });
  });

  it('diferencia origem recorrente e manual quantitativa', () => {
    expect(Object.values(OrigemOcorrencia)).toEqual([
      'RECORRENTE',
      'MANUAL_QUANTITATIVA',
    ]);

    expect(
      coluna(Ocorrencia, 'origem')?.options,
    ).toMatchObject({
      type: 'enum',
      enumName: 'ocorrencias_origem_enum',
    });
  });

  it('define estados operacionais independentes de atraso', () => {
    expect(Object.values(StatusOcorrencia)).toEqual([
      'NAO_INICIADO',
      'EM_ANDAMENTO',
      'CONCLUIDO',
    ]);

    expect(
      coluna(Ocorrencia, 'status')?.options,
    ).toMatchObject({
      type: 'enum',
      enumName: 'ocorrencias_status_enum',
      nullable: false,
      default: StatusOcorrencia.NAO_INICIADO,
    });
  });

  it('possui índice de idempotência parcial somente para recorrências', () => {
    const indice = metadata.indices.find(
      (item) =>
        item.target === Ocorrencia &&
        item.name === 'uq_ocorrencias_recorrente_periodo',
    );

    expect(indice).toBeDefined();

    expect(indice).toMatchObject({
      unique: true,
      where: `"origem" = 'RECORRENTE'`,
    });

    expect(indice?.columns).toEqual([
      'entregavelId',
      'periodoInicio',
      'periodoFim',
    ]);
  });

  it('possui índice composto necessário à integridade contratual', () => {
    const indice = metadata.indices.find(
      (item) =>
        item.target === Ocorrencia &&
        item.name === 'uq_ocorrencias_id_contrato',
    );

    expect(indice).toMatchObject({
      unique: true,
    });

    expect(indice?.columns).toEqual([
      'id',
      'contratoId',
    ]);
  });

  it('possui verificações de domínio declaradas na entidade', () => {
    const verificacoes = metadata.checks
      .filter((item) => item.target === Ocorrencia)
      .map((item) => item.name);

    expect(verificacoes).toEqual(
      expect.arrayContaining([
        'ck_ocorrencias_titulo_nao_vazio',
        'ck_ocorrencias_periodo_datas',
        'ck_ocorrencias_recorrente_periodo',
        'ck_ocorrencias_quantidade',
      ]),
    );
  });

  it('mantém o vínculo opcional com atividade HU08', () => {
    const relacao = metadata.relations.find(
      (item) =>
        item.target === AtividadeEntity &&
        item.propertyName === 'ocorrencia',
    );

    expect(relacao?.relationType).toBe('many-to-one');

    expect(relacao?.options).toMatchObject({
      nullable: true,
      onDelete: 'RESTRICT',
    });

    expect(
      coluna(AtividadeEntity, 'ocorrenciaId')?.options,
    ).toMatchObject({
      name: 'ocorrenciaId',
      type: 'uuid',
      nullable: true,
    });
  });

  it('não incorpora armazenamento ou dados financeiros à ocorrência', () => {
    const propriedades = metadata.columns
      .filter((item) => item.target === Ocorrencia)
      .map((item) => item.propertyName);

    expect(propriedades).not.toEqual(
      expect.arrayContaining([
        'arquivo',
        'storageKey',
        'url',
        'hash',
        'valorFinanceiro',
        'pagamento',
        'notaFiscal',
      ]),
    );

    expect(
      coluna(Entregavel, 'quantidadePrevista')?.options.type,
    ).toBe('numeric');
  });
});