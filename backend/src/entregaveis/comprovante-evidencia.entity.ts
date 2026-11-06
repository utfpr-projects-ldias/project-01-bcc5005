import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Versão de comprovação; nunca serializar storageKey. Não apagar versões anteriores. */
@Entity({ name: 'comprovantes_evidencia' })
@Index('idx_comprovantes_esperada_criacao', ['evidenciaEsperadaId', 'criadoEm', 'id'])
@Index('idx_comprovantes_contrato', ['contratoId'])
export class ComprovanteEvidencia {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'contrato_id', type: 'uuid' }) contratoId!: string;
  @Column({ name: 'entregavel_id', type: 'uuid' }) entregavelId!: string;
  @Column({ name: 'evidencia_esperada_id', type: 'uuid' }) evidenciaEsperadaId!: string;
  @Column({ name: 'autor_id', type: 'uuid' }) autorId!: string;
  @Column({ name: 'nome_original', type: 'varchar', length: 180 }) nomeOriginal!: string;
  @Column({ name: 'tipo_mime', type: 'varchar', length: 100 }) tipoMime!: string;
  @Column({ type: 'integer' }) tamanho!: number;
  @Column({ type: 'char', length: 64 }) sha256!: string;
  @Column({ name: 'storage_key', type: 'varchar', length: 32, select: false }) storageKey!: string;
  @Column({ type: 'varchar', length: 300, nullable: true }) descricao!: string | null;
  @Column({ type: 'varchar', length: 32, default: 'PENDENTE_VERIFICACAO' }) status!: 'PENDENTE_VERIFICACAO' | 'VERIFICADA';
  @Column({ name: 'verificado_por', type: 'uuid', nullable: true }) verificadoPor!: string | null;
  @Column({ name: 'verificado_em', type: 'timestamptz', nullable: true }) verificadoEm!: Date | null;
  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' }) criadoEm!: Date;
}
