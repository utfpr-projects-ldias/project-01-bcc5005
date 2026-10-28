import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Usuario } from '../usuarios/usuario.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';

/** Vínculo expresso; nunca inferir acesso porque há sessão. */
@Entity({ name: 'permissoes_contrato' })
@Unique('uq_permissoes_contrato_usuario_contrato', ['usuarioId', 'contratoId'])
export class PermissaoContrato {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId!: string;

  // FK aditiva criada pela TEC07-AJUSTES-01, preservando migrations históricas.
  @Column({ name: 'contrato_id', type: 'uuid' })
  contratoId!: string;

  @ManyToOne(() => Contrato, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'contrato_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_permissoes_contrato_contrato' })
  contrato!: Contrato;

  @Column({ name: 'pode_editar', type: 'boolean', default: false })
  podeEditar!: boolean;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'usuario_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_permissoes_contrato_usuario' })
  usuario!: Usuario;
}
