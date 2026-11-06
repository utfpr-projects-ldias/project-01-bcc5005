import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Contrato } from '../contratos/contrato.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { CategoriaDocumento } from './categoria-documento.js';

/** RF-04: metadados internos. Nunca serializar esta entidade diretamente em uma resposta HTTP. */
@Entity({ name: 'documentos_contratuais' })
@Index('idx_documentos_contrato_categoria_criacao', ['contratoId', 'categoria', 'criadoEm'])
@Index('idx_documentos_autor', ['autorId'])
@Check('ck_documentos_tamanho_positivo', '"tamanho" > 0')
export class DocumentoContratual {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'contrato_id', type: 'uuid' })
  contratoId!: string;

  @ManyToOne(() => Contrato, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'contrato_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_documentos_contrato' })
  contrato!: Contrato;

  @Column({ name: 'autor_id', type: 'uuid' })
  autorId!: string;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'autor_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_documentos_autor' })
  autor!: Usuario;

  @Column({ type: 'varchar', length: 32 })
  categoria!: CategoriaDocumento;

  @Column({ type: 'varchar', length: 300, nullable: true })
  descricao!: string | null;

  @Column({ name: 'nome_original', type: 'varchar', length: 180 })
  nomeOriginal!: string;

  @Column({ name: 'tipo_mime', type: 'varchar', length: 100 })
  tipoMime!: string;

  @Column({ type: 'integer' })
  tamanho!: number;

  @Column({ name: 'sha256', type: 'char', length: 64 })
  sha256!: string;

  @Column({ name: 'storage_key', type: 'varchar', length: 32, unique: true, select: false })
  storageKey!: string;

  @Column({ name: 'arquivado_em', type: 'timestamptz', nullable: true })
  arquivadoEm!: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
