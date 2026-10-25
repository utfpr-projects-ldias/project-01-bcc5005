import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { PerfilUsuario } from './perfil-usuario.enum.js';

@Entity({ name: 'usuarios' })
@Unique('uq_usuarios_supertokens_user_id', ['supertokensUserId'])
@Index('idx_usuarios_email', ['email'])
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'supertokens_user_id', type: 'varchar', length: 255 })
  supertokensUserId!: string;

  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'enum', enum: PerfilUsuario, enumName: 'usuarios_perfil_enum' })
  perfil!: PerfilUsuario;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
