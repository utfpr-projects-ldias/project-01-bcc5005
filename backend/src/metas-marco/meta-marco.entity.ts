import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type TipoMetaMarco = 'OCORRENCIA' | 'ATIVIDADE' | 'EVIDENCIA';

@Entity('metas_marco')
@Index('uq_meta_marco_contrato', ['id', 'contratoId'], { unique: true })
@Index('idx_metas_marco_entregavel', ['contratoId', 'entregavelId'])
export class MetaMarco {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'contrato_id', type: 'uuid' }) contratoId!: string;
  @Column({ name: 'entregavel_id', type: 'uuid' }) entregavelId!: string;
  @Column({ type: 'varchar', length: 12 }) tipo!: TipoMetaMarco;
  @Column({ type: 'varchar', length: 60 }) titulo!: string;
  @Column({ name: 'quantidade_exigida', type: 'integer' }) quantidadeExigida!: number;
  @Column({ name: 'data_prevista', type: 'date', nullable: true }) dataPrevista!: string | null;
  @Column({ name: 'inicio_previsto', type: 'date', nullable: true }) inicioPrevisto!: string | null;
  @Column({ name: 'termino_previsto', type: 'date', nullable: true }) terminoPrevisto!: string | null;
  @Column({ type: 'varchar', length: 150, nullable: true }) observacoes!: string | null;
  @Column({ name: 'criado_por', type: 'uuid' }) criadoPor!: string;
  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' }) criadoEm!: Date;
  @Column({ name: 'arquivado_em', type: 'timestamptz', nullable: true }) arquivadoEm!: Date | null;
}

@Entity('vinculos_metas_marco')
@Index('idx_vinculos_metas_marco', ['metaId', 'status'])
export class VinculoMetaMarco {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'meta_id', type: 'uuid' }) metaId!: string;
  @Column({ name: 'contrato_id', type: 'uuid' }) contratoId!: string;
  @Column({ name: 'ocorrencia_id', type: 'uuid', nullable: true }) ocorrenciaId!: string | null;
  @Column({ name: 'atividade_id', type: 'uuid', nullable: true }) atividadeId!: string | null;
  @Column({ name: 'comprovante_id', type: 'uuid', nullable: true }) comprovanteId!: string | null;
  @Column({ type: 'varchar', length: 12, default: 'PENDENTE' }) status!: 'PENDENTE' | 'APROVADO' | 'REJEITADO';
  @Column({ name: 'solicitado_por', type: 'uuid' }) solicitadoPor!: string;
  @CreateDateColumn({ name: 'solicitado_em', type: 'timestamptz' }) solicitadoEm!: Date;
  @Column({ name: 'decidido_por', type: 'uuid', nullable: true }) decididoPor!: string | null;
  @Column({ name: 'decidido_em', type: 'timestamptz', nullable: true }) decididoEm!: Date | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) justificativa!: string | null;
}
