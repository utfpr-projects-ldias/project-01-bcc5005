import { Column, Entity, PrimaryColumn } from 'typeorm';
import { PeriodicidadeEntregavel } from '../entregaveis/periodicidade-entregavel.enum.js';
import { TipoEntregavel } from '../entregaveis/tipo-entregavel.enum.js';

/** Configuração operacional pai das ocorrências de um entregável.
 * Os campos homônimos em Entregavel são projeções para RF-07/08 e TEC09.
 * Alterações devem ser transacionais, sem deixar duas fontes divergentes.
 */
@Entity({ name: 'configuracoes_ocorrencias' })
export class ConfiguracaoOcorrencias {
  @PrimaryColumn({ name: 'entregavel_id', type: 'uuid' }) entregavelId!: string;
  @Column({ name: 'contrato_id', type: 'uuid' }) contratoId!: string;
  @Column({ name: 'tipo_operacional', type: 'varchar', length: 20 }) tipoOperacional!: TipoEntregavel;
  @Column({ name: 'quantidade_prevista', type: 'numeric', precision: 18, scale: 3, nullable: true }) quantidadePrevista!: string | null;
  @Column({ name: 'unidade_medida', type: 'varchar', length: 80, nullable: true }) unidadeMedida!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) periodicidade!: PeriodicidadeEntregavel | null;
  @Column({ name: 'inicio_previsto', type: 'date', nullable: true }) inicioPrevisto!: string | null;
  @Column({ name: 'termino_previsto', type: 'date', nullable: true }) terminoPrevisto!: string | null;
  @Column({ name: 'modo_visualizacao', type: 'varchar', length: 12, default: 'LISTA' })
  modoVisualizacao!: 'LISTA' | 'CALENDARIO';

  @Column({ name: 'atualizado_em' , type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' }) atualizadoEm!: Date;
}
