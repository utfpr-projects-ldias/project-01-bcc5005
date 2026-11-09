import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';

/**
 * Atividade operacional vinculada a contrato.
 *
 * Nenhum progresso é calculado aqui.
 *
 * HU08: relacionamento N:N com entregáveis.
 * HU09: relacionamento opcional com ocorrência.
 */
@Entity('atividades')
export class AtividadeEntity {

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  contratoId!: string;

  @Column({
    name: 'ocorrenciaId',
    type: 'uuid',
    nullable: true,
  })
  ocorrenciaId!: string | null;

  /**
   * A associação com ocorrência é opcional.
   *
   * A FK composta garante que a ocorrência pertence
   * ao mesmo contrato da atividade.
   *
   * Atividades HU08 preexistentes permanecem com NULL.
   *
   * RESTRICT preserva o histórico operacional.
   */
  @ManyToOne(
    () => Ocorrencia,
    {
      nullable: true,
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn([
    {
      name: 'ocorrenciaId',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_atividades_ocorrencia_contrato',
    },
    {
      name: 'contratoId',
      referencedColumnName: 'contratoId',
      foreignKeyConstraintName: 'fk_atividades_ocorrencia_contrato',
    },
  ])
  ocorrencia!: Ocorrencia | null;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  responsavelId!: string | null;

  @Column({ type: 'varchar' })
  titulo!: string;

  @Column({ type: 'timestamptz' })
  dataHora!: Date;

  @Column({ type: 'text' })
  descricao!: string;

  @Column({ type: 'varchar' })
  tipo!: string;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  responsavel!: string | null;

  @Column({
    type: 'simple-array',
    nullable: true,
  })
  participantes!: string[] | null;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  local!: string | null;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  duracao!: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  observacoes!: string | null;

  /**
   * Uma atividade pode continuar associada
   * a múltiplos entregáveis.
   *
   * Sem cascade: excluir um entregável não pode
   * eliminar registros de atividades.
   */
  @ManyToMany(
    () => Entregavel,
    { cascade: false },
  )
  @JoinTable({
    name: 'atividade_entregaveis',
    joinColumn: {
      name: 'atividadeId',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'entregavelId',
      referencedColumnName: 'id',
    },
  })
  entregaveis!: Entregavel[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}