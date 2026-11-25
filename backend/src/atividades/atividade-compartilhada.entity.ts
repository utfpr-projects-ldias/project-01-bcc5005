import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('atividades_compartilhadas')
export class AtividadeCompartilhada {
  @PrimaryColumn('uuid') id!: string;
  @Column({ name: 'criado_por', type: 'uuid' }) criadoPor!: string;
  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' }) criadoEm!: Date;
}
