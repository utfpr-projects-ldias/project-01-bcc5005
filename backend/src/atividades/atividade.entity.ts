import { Column, CreateDateColumn, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Entregavel } from '../entregaveis/entregavel.entity.js';

export type EstadoAtividade = 'REGISTRADA' | 'VERIFICADA' | 'ARQUIVADA';

/** Atividade operacional vinculada a contrato; nenhum progresso é calculado aqui. */
@Entity('atividades')
export class AtividadeEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) contratoId!: string;
  @Column({ type: 'uuid', nullable: true }) responsavelId!: string | null;
  @Column({ type: 'varchar' }) titulo!: string;
  @Column({ type: 'timestamptz' }) dataHora!: Date;
  @Column({ type: 'text' }) descricao!: string;
  @Column({ type: 'varchar' }) tipo!: string;
  @Column({ type: 'varchar', nullable: true }) responsavel!: string | null;
  @Column({ type: 'simple-array', nullable: true }) participantes!: string[] | null;
  @Column({ type: 'varchar', nullable: true }) local!: string | null;
  @Column({ type: 'varchar', nullable: true }) duracao!: string | null;
  @Column({ type: 'text', nullable: true }) observacoes!: string | null;
  @Column({ type: 'varchar', length: 20, default: 'REGISTRADA' }) status!: EstadoAtividade;
  @Column({ type: 'timestamptz', nullable: true }) verificadaEm!: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) arquivadaEm!: Date | null;
  /** Exclusão lógica: auditoria e vínculos N:N nunca são apagados. */
  @Column({ type: 'timestamptz', nullable: true }) excluidaEm!: Date | null;

  /** Sem cascade: excluir um entregável não pode eliminar registros de atividades. */
  @ManyToMany(() => Entregavel, { cascade: false })
  @JoinTable({
    name: 'atividade_entregaveis',
    joinColumn: { name: 'atividadeId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'entregavelId', referencedColumnName: 'id' },
  })
  entregaveis!: Entregavel[];
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
