import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CriarAtividades1795200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tabela de Atividades (PRD §8.2)
    await queryRunner.createTable(
      new Table({
        name: 'atividades',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'contratoId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'titulo',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'dataHora',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'descricao',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'tipo',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'responsavel',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'participantes',
            type: 'text', // Armazenado como array/json serializado conforme padrão do projeto
            isNullable: false,
          },
          {
            name: 'local',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'duracao',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'observacoes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Chave estrangeira para Contratos
    await queryRunner.createForeignKey(
      'atividades',
      new TableForeignKey({
        columnNames: ['contratoId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'contratos',
        onDelete: 'RESTRICT', 
      }),
    );

    // 2. Tabela Pivot N:N (Atividade <-> Entregáveis)
    await queryRunner.createTable(
      new Table({
        name: 'atividade_entregaveis',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'atividadeId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'entregavelId',
            type: 'uuid',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Chaves estrangeiras da tabela pivot
    await queryRunner.createForeignKeys('atividade_entregaveis', [
      new TableForeignKey({
        columnNames: ['atividadeId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'atividades',
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['entregavelId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'entregaveis',
        onDelete: 'CASCADE',
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tabelaPivot = await queryRunner.getTable('atividade_entregaveis');
    if (tabelaPivot) {
      const fks = tabelaPivot.foreignKeys;
      await queryRunner.dropForeignKeys('atividade_entregaveis', fks);
      await queryRunner.dropTable('atividade_entregaveis');
    }

    const tabelaAtividades = await queryRunner.getTable('atividades');
    if (tabelaAtividades) {
      const fks = tabelaAtividades.foreignKeys;
      await queryRunner.dropForeignKeys('atividades', fks);
      await queryRunner.dropTable('atividades');
    }
  }
}
