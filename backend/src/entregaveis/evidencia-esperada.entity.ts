import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Entregavel } from './entregavel.entity.js';

/**
 * Checklist PLANEJADO de HU07: NÃO é evidência enviada, arquivo ou prova real.
 * A ausência/presença destes itens NÃO calcula comprovação (TEC10).
 */
@Entity({ name: 'evidencias_esperadas' })
@Index('idx_evidencias_esperadas_entregavel', ['entregavelId'])
@Check('ck_evidencias_esperadas_tipo_nao_vazio', 'length(btrim("tipo_evidencia")) > 0')
@Check('ck_evidencias_esperadas_descricao_nao_vazia', '"descricao" IS NULL OR length(btrim("descricao")) > 0')
export class EvidenciaEsperada {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'entregavel_id', type: 'uuid' })
  entregavelId!: string;

  @ManyToOne(() => Entregavel, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'entregavel_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_evidencias_esperadas_entregavel' })
  entregavel!: Entregavel;

  @Column({ name: 'tipo_evidencia', type: 'varchar', length: 100 })
  tipoEvidencia!: string;

  @Column({ type: 'text', nullable: true })
  descricao!: string | null;

  @Column({ type: 'boolean', default: false })
  obrigatoria!: boolean;
}
