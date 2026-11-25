import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Parcelas descritivas identificáveis. O percentual legado permanece como saldo anterior. */
@Entity('execucoes_entregavel')
@Index('idx_execucoes_entregavel_r47', ['contratoId', 'entregavelId'])
export class ExecucaoLancamento {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name:'contrato_id', type:'uuid' }) contratoId!: string;
  @Column({ name:'entregavel_id', type:'uuid' }) entregavelId!: string;
  @Column({ name:'ocorrencia_id', type:'uuid', nullable:true }) ocorrenciaId!: string|null;
  @Column({ type:'varchar', length:16 }) origem!: 'MANUAL'|'ATIVIDADE'|'EVIDENCIA';
  @Column({ name:'origem_id', type:'uuid', nullable:true }) origemId!: string|null;
  @Column({ name:'referencia_id', type:'uuid', nullable:true }) referenciaId!: string|null;
  @Column({ type:'integer' }) centesimos!: number;
  @Column({ name:'centesimos_aprovados', type:'integer', nullable:true }) centesimosAprovados!: number|null;
  @Column({ type:'varchar', length:12 }) status!: 'PENDENTE'|'APROVADO'|'REJEITADO';
  @Column({ name:'data_execucao', type:'date' }) dataExecucao!: string;
  @Column({ type:'varchar', length:300, nullable:true }) observacao!: string|null;
  @Column({ name:'autor_id', type:'uuid' }) autorId!: string;
  @Column({ name:'autor_nome', type:'varchar', length:255 }) autorNome!: string;
  @Column({ name:'decidido_por', type:'uuid', nullable:true }) decididoPor!: string|null;
  @Column({ name:'decidido_em', type:'timestamptz', nullable:true }) decididoEm!: Date|null;
  @Column({ name:'criado_em', type:'timestamptz', default:()=> 'now()' }) criadoEm!: Date;
}
