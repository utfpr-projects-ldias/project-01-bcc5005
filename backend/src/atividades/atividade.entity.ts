import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  UpdateDateColumn, 
  ManyToMany, 
  JoinTable 
} from 'typeorm';
import { Entregavel } from '../entregaveis/entregavel.entity.js'; 

@Entity('atividades')
export class AtividadeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  contratoId: string;

  @Column({ type: 'varchar' })
  titulo: string;

  @Column({ type: 'timestamp' })
  dataHora: Date;

  @Column({ type: 'text' })
  descricao: string;

  @Column({ type: 'varchar' })
  tipo: string;

  @Column({ type: 'varchar' })
  responsavel: string;

  @Column({ type: 'simple-array', nullable: true })
  participantes: string[];

  @Column({ type: 'varchar', nullable: true })
  local: string;

  @Column({ type: 'varchar', nullable: true })
  duracao: string;

  @Column({ type: 'text', nullable: true })
  observacoes?: string;

  @ManyToMany(() => Entregavel, { cascade: true })
  @JoinTable({
    name: 'atividade_entregaveis',
    joinColumn: { name: 'atividadeId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'entregavelId', referencedColumnName: 'id' },
  })
  entregaveis: Entregavel[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}