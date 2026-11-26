import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type TipoMetaMarco = 'DESCRITIVA' | 'QUANTITATIVA';
export type TipoRegistroMeta = 'OCORRENCIA' | 'ATIVIDADE' | 'EVIDENCIA';
export type EstadoMetaMarco = 'ABERTA' | 'PENDENTE_CONCLUSAO' | 'PENDENTE_CONCLUSAO_PARCIAL' | 'PENDENTE_ENCERRAMENTO' | 'PENDENTE_REGULARIZACAO' | 'CONCLUIDA' | 'CONCLUIDA_PARCIALMENTE' | 'ENCERRADA';

@Entity('metas_marco')
@Index('uq_meta_marco_contrato', ['id', 'contratoId'], { unique: true })
@Index('idx_metas_marco_entregavel', ['contratoId', 'entregavelId'])
export class MetaMarco {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'contrato_id', type: 'uuid' }) contratoId!: string;
  @Column({ name: 'entregavel_id', type: 'uuid' }) entregavelId!: string;
  @Column({ type: 'varchar', length: 12 }) tipo!: TipoMetaMarco;
  @Column({ type: 'varchar', length: 60 }) titulo!: string;
  /** Peso em centésimos de ponto percentual (10000 = 100%). */
  @Column({ name: 'peso_centesimos', type: 'integer' }) pesoCentesimos!: number;
  @Column({ name: 'quantidade_prevista', type: 'numeric', precision: 18, scale: 3, nullable: true }) quantidadePrevista!: string | null;
  @Column({ name: 'unidade_medida', type: 'varchar', length: 40, nullable: true }) unidadeMedida!: string | null;
  @Column({ name: 'criterio_conclusao', type: 'varchar', length: 1000 }) criterioConclusao!: string;
  @Column({ name: 'provas_exigidas', type: 'integer', default: 0 }) provasExigidas!: number;
  @Column({ name: 'estado', type: 'varchar', length: 32, default: 'ABERTA' }) estado!: EstadoMetaMarco;
  @Column({ name: 'justificativa_estado', type: 'varchar', length: 1000, nullable: true }) justificativaEstado!: string | null;
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
  @Column({ name: 'evidencia_esperada_id', type: 'uuid', nullable: true }) evidenciaEsperadaId!: string | null;
  @Column({ type: 'varchar', length: 12, default: 'PENDENTE' }) status!: 'PENDENTE' | 'APROVADO' | 'REJEITADO';
  @Column({ name: 'solicitado_por', type: 'uuid' }) solicitadoPor!: string;
  @CreateDateColumn({ name: 'solicitado_em', type: 'timestamptz' }) solicitadoEm!: Date;
  @Column({ name: 'decidido_por', type: 'uuid', nullable: true }) decididoPor!: string | null;
  @Column({ name: 'decidido_em', type: 'timestamptz', nullable: true }) decididoEm!: Date | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) justificativa!: string | null;
}
