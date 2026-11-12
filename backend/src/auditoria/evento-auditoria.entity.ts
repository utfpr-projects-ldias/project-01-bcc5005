import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AcaoAuditoria, type TipoEntidadeAuditada } from './acao-auditoria.js';

/** Registro imutável por contrato de uso: não disponibilizar endpoints de edição/exclusão. */
@Entity({ name: 'eventos_auditoria' })
@Index('idx_eventos_auditoria_entidade', ['entidadeTipo', 'entidadeId', 'registradoEm'])
@Index('idx_eventos_auditoria_ator', ['atorSupertokensUserId', 'registradoEm'])
@Index('idx_eventos_auditoria_contrato', ['contratoId', 'registradoEm'], { where: '"contrato_id" IS NOT NULL' })
export class EventoAuditoria {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Identificador autenticado pelo SuperTokens, não um e-mail ou ID fornecido pelo cliente.
  // Sem FK: a trilha permanece recuperável caso a conta seja desativada no futuro.
  @Column({ name: 'ator_supertokens_user_id', type: 'varchar', length: 255 })
  atorSupertokensUserId!: string;

  @CreateDateColumn({ name: 'registrado_em', type: 'timestamptz' })
  registradoEm!: Date;

  @Column({ name: 'acao', type: 'varchar', length: 64 })
  acao!: AcaoAuditoria;

  @Column({ name: 'entidade_tipo', type: 'varchar', length: 50 })
  entidadeTipo!: TipoEntidadeAuditada;

  // Referência lógica: HU05-01 ainda não criou a tabela contratos.
  @Column({ name: 'entidade_id', type: 'varchar', length: 255 })
  entidadeId!: string;

  /** Contexto derivado do banco; nullable para histórico de usuário e linhas antigas. */
  @Column({ name: 'contrato_id', type: 'uuid', nullable: true })
  contratoId!: string | null;

  @Column({ name: 'dados_anteriores', type: 'jsonb', nullable: true })
  dadosAnteriores!: Record<string, unknown> | null;

  @Column({ name: 'dados_posteriores', type: 'jsonb', nullable: true })
  dadosPosteriores!: Record<string, unknown> | null;
}
