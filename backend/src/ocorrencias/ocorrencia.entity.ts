import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { OrigemOcorrencia } from './origem-ocorrencia.enum.js';
import { StatusOcorrencia } from './status-ocorrencia.enum.js';

/**
 * HU09-01 — instância individual de execução de um entregável.
 *
 * A ocorrência representa um acontecimento planejado ou uma execução
 * individual quantitativa. Não substitui o entregável.
 *
 * contratoId é mantido como referência redundante para possibilitar
 * FK composta e garantir integridade contratual no PostgreSQL.
 *
 * Sua correspondência com Entregavel.contratoId é garantida pela FK:
 *
 * (entregavel_id, contrato_id)
 *   -> entregaveis(id, contrato_id)
 *
 * Nenhuma exclusão em cascata pode eliminar o histórico operacional.
 */
@Entity({ name: 'ocorrencias' })
@Index('uq_ocorrencias_id_contrato', ['id', 'contratoId'], { unique: true })
@Index('idx_ocorrencias_agenda_periodo', [
  'contratoId',
  'periodoInicio',
  'periodoFim',
])
@Index('idx_ocorrencias_agenda_data_prevista', [
  'contratoId',
  'dataPrevista',
  'status',
])
@Index('idx_ocorrencias_entregavel_periodo', [
  'entregavelId',
  'periodoInicio',
  'periodoFim',
])
/**
 * Idempotência exclusiva para ocorrências recorrentes.
 *
 * Ocorrências manuais quantitativas ficam fora deste índice.
 *
 * A referência temporal é formada por entregável + período inicial
 * + período final. A V1 não possui revisão histórica independente
 * do planejamento; configuracao_periodicidade.versao identifica
 * somente a estrutura da configuração.
 */
@Index(
  'uq_ocorrencias_recorrente_periodo',
  ['entregavelId', 'periodoInicio', 'periodoFim'],
  {
    unique: true,
    where: `"origem" = 'RECORRENTE'`,
  },
)
@Check('ck_ocorrencias_titulo_nao_vazio', 'length(btrim("titulo")) > 0')
@Check(
  'ck_ocorrencias_periodo_datas',
  '"periodo_inicio" IS NULL OR "periodo_fim" IS NULL OR "periodo_fim" >= "periodo_inicio"',
)
@Check(
  'ck_ocorrencias_recorrente_periodo',
  `"origem" <> 'RECORRENTE' OR
   ("periodo_inicio" IS NOT NULL AND "periodo_fim" IS NOT NULL)`,
)
@Check(
  'ck_ocorrencias_quantidade',
  '"quantidade_realizada" IS NULL OR "quantidade_realizada" >= 0',
)
export class Ocorrencia {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Identificador do entregável de origem.
   */
  @Column({
    name: 'entregavel_id',
    type: 'uuid',
  })
  entregavelId!: string;

  /**
   * Contrato ao qual pertence a ocorrência.
   *
   * Campo utilizado para integridade referencial composta.
   * Seu valor deve ser igual ao contrato do entregável.
   */
  @Column({
    name: 'contrato_id',
    type: 'uuid',
  })
  contratoId!: string;

  /**
   * O relacionamento é obrigatório e não permite exclusão
   * do entregável enquanto houver ocorrências associadas.
   */
  @ManyToOne(() => Entregavel, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn([
    {
      name: 'entregavel_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_ocorrencias_entregavel_contrato',
    },
    {
      name: 'contrato_id',
      referencedColumnName: 'contratoId',
      foreignKeyConstraintName: 'fk_ocorrencias_entregavel_contrato',
    },
  ])
  entregavel!: Entregavel;

  /**
   * Título identificador da execução planejada.
   */
  @Column({
    type: 'varchar',
    length: 255,
  })
  titulo!: string;

  /**
   * Início do período de referência.
   *
   * DATE representa uma data civil, sem horário ou fuso.
   * No driver PostgreSQL, a representação é string ISO.
   */
  @Column({
    name: 'periodo_inicio',
    type: 'date',
    nullable: true,
  })
  periodoInicio!: string | null;

  /**
   * Fim do período de referência.
   */
  @Column({
    name: 'periodo_fim',
    type: 'date',
    nullable: true,
  })
  periodoFim!: string | null;

  /**
   * Data civil prevista para execução.
   */
  @Column({
    name: 'data_prevista',
    type: 'date',
    nullable: true,
  })
  dataPrevista!: string | null;

  /**
   * Data civil em que a execução foi efetivamente realizada.
   */
  @Column({
    name: 'data_realizada',
    type: 'date',
    nullable: true,
  })
  dataRealizada!: string | null;

  /**
   * Situação operacional da ocorrência.
   *
   * Não representa atraso nem situação de comprovação.
   */
  @Column({
    type: 'enum',
    enum: StatusOcorrencia,
    enumName: 'ocorrencias_status_enum',
    nullable: false,
    default: StatusOcorrencia.NAO_INICIADO,
  })
  status!: StatusOcorrencia;

  /**
   * Quantidade efetivamente realizada.
   *
   * NUMERIC(18,3) mantém a mesma precisão utilizada
   * em Entregavel.quantidadeRealizada.
   *
   * NULL representa quantidade ainda não informada.
   */
  @Column({
    name: 'quantidade_realizada',
    type: 'numeric',
    precision: 18,
    scale: 3,
    nullable: true,
  })
  quantidadeRealizada!: string | null;

  /**
   * Observações operacionais da ocorrência.
   */
  @Column({
    type: 'text',
    nullable: true,
  })
  observacoes!: string | null;

  /**
   * Identifica a origem da ocorrência.
   */
  @Column({
    type: 'enum',
    enum: OrigemOcorrencia,
    enumName: 'ocorrencias_origem_enum',
  })
  origem!: OrigemOcorrencia;
}
