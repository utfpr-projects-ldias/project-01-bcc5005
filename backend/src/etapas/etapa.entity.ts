import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { Contrato } from '../contratos/contrato.entity.js';
import { StatusEtapa } from './status-etapa.enum.js';

/**
 * HU06-01 — Modelo persistente de uma etapa de execução contratual (RF-05).
 *
 * A etapa depende de um Contrato existente, e o seu UUID será referenciado por
 * Entregavel.etapaId na HU07. Nenhum vínculo com entregáveis é antecipado aqui.
 * A unicidade de (contratoId, sequencia) é DEFERRABLE para permitir, na HU06-02,
 * reordenação atômica usando SET CONSTRAINTS ... DEFERRED numa transação.
 *
 * Campos escolhidos como opcionais: codigo, descricao, inicioPrevisto,
 * terminoPrevisto, observacoes. O PRD §8.2 não define obrigatoriedade desses
 * campos. O codigo, quando presente, NÃO é único por decisão técnica provisória.
 */
@Entity({ name: 'etapas' })
@Unique('uq_etapas_contrato_sequencia', ['contratoId', 'sequencia'], {
  deferrable: 'INITIALLY IMMEDIATE',
})
@Index('idx_etapas_contrato_inicio_previsto', ['contratoId', 'inicioPrevisto'])
@Check('ck_etapas_sequencia_positiva', '"sequencia" > 0')
@Check('ck_etapas_nome_nao_vazio', 'length(btrim("nome")) > 0')
@Check(
  'ck_etapas_codigo_nao_vazio',
  '"codigo" IS NULL OR length(btrim("codigo")) > 0',
)
@Check(
  'ck_etapas_datas_previstas',
  '"inicio_previsto" IS NULL OR "termino_previsto" IS NULL OR "termino_previsto" >= "inicio_previsto"',
)
export class Etapa {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'contrato_id', type: 'uuid' })
  contratoId!: string;

  @ManyToOne(() => Contrato, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'contrato_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_etapas_contrato',
  })
  contrato!: Contrato;

  @Column({ type: 'varchar', length: 50, nullable: true })
  codigo!: string | null;

  @Column({ type: 'varchar', length: 255 })
  nome!: string;

  @Column({ type: 'text', nullable: true })
  descricao!: string | null;

  /** Ordem explícita, começando em 1 e única dentro do contrato. */
  @Column({ type: 'integer' })
  sequencia!: number;

  /** Datas civis ISO YYYY-MM-DD, não instantes UTC. */
  @Column({ name: 'inicio_previsto', type: 'date', nullable: true })
  inicioPrevisto!: string | null;

  @Column({ name: 'termino_previsto', type: 'date', nullable: true })
  terminoPrevisto!: string | null;

  @Column({
    type: 'enum',
    enum: StatusEtapa,
    enumName: 'etapas_status_enum',
    default: StatusEtapa.PLANEJADA,
  })
  status!: StatusEtapa;

  @Column({ type: 'text', nullable: true })
  observacoes!: string | null;
}
