import {
  Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';

import { Contrato } from '../contratos/contrato.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import type { ConfiguracaoPeriodicidadeV1 } from './configuracao-periodicidade.js';
import { PeriodicidadeEntregavel } from './periodicidade-entregavel.enum.js';
import { SituacaoComprovacaoEntregavel } from './situacao-comprovacao-entregavel.enum.js';
import { StatusExecucaoEntregavel } from './status-execucao-entregavel.enum.js';
import { TipoEntregavel } from './tipo-entregavel.enum.js';

/**
 * HU07-01 / PRD §8.2 — OBRIGAÇÃO PLANEJADA, não sua execução ou prova real.
 * FK composta (etapa_id, contrato_id) -> etapas(id, contrato_id) impede
 * vínculo cruzado até por SQL direto. Contrato também tem FK própria.
 * Nenhuma remoção em cascata pode destruir histórico operacional.
 */
@Entity({ name: 'entregaveis' })
@Index('idx_entregaveis_contrato_etapa', ['contratoId', 'etapaId'])
@Index('idx_entregaveis_etapa_tipo', ['etapaId', 'tipo'])
@Index('idx_entregaveis_contrato_termino', ['contratoId', 'terminoPrevisto'])
@Index('idx_entregaveis_responsavel', ['responsavelId'])
@Check('ck_entregaveis_nome_nao_vazio', 'length(btrim("nome")) > 0')
@Check('ck_entregaveis_codigo_nao_vazio', '"codigo" IS NULL OR length(btrim("codigo")) > 0')
@Check('ck_entregaveis_datas', '"inicio_previsto" IS NULL OR "termino_previsto" IS NULL OR "termino_previsto" >= "inicio_previsto"')
@Check('ck_entregaveis_quantidades', '("quantidade_prevista" IS NULL OR "quantidade_prevista" >= 0) AND ("quantidade_realizada" IS NULL OR "quantidade_realizada" >= 0)')
@Check('ck_entregaveis_peso', '"peso" IS NULL OR ("peso" >= 0 AND "peso" <= 100)')
@Check('ck_entregaveis_percentual', '"percentual_execucao" IS NULL OR ("percentual_execucao" >= 0 AND "percentual_execucao" <= 100)')
@Check('ck_entregaveis_quantitativo', `"tipo" <> 'QUANTITATIVO' OR ("quantidade_prevista" IS NOT NULL AND "quantidade_prevista" > 0 AND "unidade_medida" IS NOT NULL AND length(btrim("unidade_medida")) > 0)`)
@Check('ck_entregaveis_unidade_nao_vazia', '"unidade_medida" IS NULL OR length(btrim("unidade_medida")) > 0')
@Check('ck_entregaveis_recorrencia', `
  (
    "tipo" = 'RECORRENTE' AND "periodicidade" IS NOT NULL
    AND "configuracao_periodicidade" IS NOT NULL
    AND jsonb_typeof("configuracao_periodicidade") = 'object'
    AND "configuracao_periodicidade" = '{"versao":1}'::jsonb
  ) OR (
    "tipo" <> 'RECORRENTE' AND "periodicidade" IS NULL
    AND "configuracao_periodicidade" IS NULL
  )
`)
export class Entregavel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'contrato_id', type: 'uuid' })
  contratoId!: string;

  @ManyToOne(() => Contrato, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'contrato_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_entregaveis_contrato' })
  contrato!: Contrato;

  @Column({ name: 'etapa_id', type: 'uuid' })
  etapaId!: string;

  @ManyToOne(() => Etapa, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'etapa_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_entregaveis_etapa_contrato' },
    { name: 'contrato_id', referencedColumnName: 'contratoId', foreignKeyConstraintName: 'fk_entregaveis_etapa_contrato' },
  ])
  etapa!: Etapa;

  /** Código não obrigatório até decisão do cliente; não impor unicidade sem regra. */
  @Column({ type: 'varchar', length: 50, nullable: true })
  codigo!: string | null;

  @Column({ type: 'varchar', length: 255 })
  nome!: string;

  @Column({ type: 'text', nullable: true })
  descricao!: string | null;

  @Column({ type: 'enum', enum: TipoEntregavel, enumName: 'entregaveis_tipo_enum' })
  tipo!: TipoEntregavel;

  @Column({ name: 'responsavel_id', type: 'uuid', nullable: true })
  responsavelId!: string | null;

  /** Responsável cadastral não altera PermissaoContrato. HU07-02 validará usuário ativo. */
  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'responsavel_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_entregaveis_responsavel' })
  responsavel!: Usuario | null;

  /** Datas CIVIS ISO, sem conversão indevida de fuso. */
  @Column({ name: 'inicio_previsto', type: 'date', nullable: true })
  inicioPrevisto!: string | null;

  @Column({ name: 'termino_previsto', type: 'date', nullable: true })
  terminoPrevisto!: string | null;

  /** decimal -> string no driver pg; evitar JS float como fonte de verdade. */
  @Column({ name: 'quantidade_prevista', type: 'numeric', precision: 18, scale: 3, nullable: true })
  quantidadePrevista!: string | null;

  @Column({ name: 'quantidade_realizada', type: 'numeric', precision: 18, scale: 3, nullable: true })
  quantidadeRealizada!: string | null;

  @Column({ name: 'unidade_medida', type: 'varchar', length: 80, nullable: true })
  unidadeMedida!: string | null;

  @Column({ type: 'enum', enum: PeriodicidadeEntregavel, enumName: 'entregaveis_periodicidade_enum', nullable: true })
  periodicidade!: PeriodicidadeEntregavel | null;

  @Column({ name: 'configuracao_periodicidade', type: 'jsonb', nullable: true })
  configuracaoPeriodicidade!: ConfiguracaoPeriodicidadeV1 | null;

  /** Peso OPERACIONAL individual. Soma de 100% pertence a TEC09. */
  @Column({ type: 'numeric', precision: 7, scale: 4, nullable: true })
  peso!: string | null;

  @Column({ name: 'criterio_conclusao', type: 'text', nullable: true })
  criterioConclusao!: string | null;

  /** Não presumir avanço ou comprovação nesta HU07 (TEC09/TEC10). */
  @Column({ name: 'status_execucao', type: 'enum', enum: StatusExecucaoEntregavel, enumName: 'entregaveis_status_execucao_enum', nullable: true })
  statusExecucao!: StatusExecucaoEntregavel | null;

  @Column({ name: 'percentual_execucao', type: 'numeric', precision: 5, scale: 2, nullable: true })
  percentualExecucao!: string | null;

  @Column({ name: 'situacao_comprovacao', type: 'enum', enum: SituacaoComprovacaoEntregavel, enumName: 'entregaveis_situacao_comprovacao_enum', nullable: true })
  situacaoComprovacao!: SituacaoComprovacaoEntregavel | null;

  @Column({ type: 'text', nullable: true })
  observacoes!: string | null;
}
