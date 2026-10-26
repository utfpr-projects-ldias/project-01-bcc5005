import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { Usuario } from '../usuarios/usuario.entity.js';
import { ModoCalculo } from './modo-calculo.enum.js';
import { StatusContrato } from './status-contrato.enum.js';

/**
 * Entidade raiz do domínio contratual — HU05-01.
 *
 * Contém **exatamente** os campos conceituais do PRD §8.2, sem antecipar
 * etapas/entregáveis/documentos (ficam em HU05-02+) nem valores financeiros
 * (R-01, RB-13). `criado_em`/`atualizado_em` deliberadamente ausentes:
 * rastreabilidade temporal vem de `eventos_auditoria` (§8.4 — contract_created).
 *
 * @see PRD §8.2 (Contrato)
 * @see RF-01 (criar / visualizar / editar)
 * @see RF-02 (status operacional)
 * @see RF-03 (responsável interno e fiscal público informativo)
 */
@Entity({ name: 'contratos' })
export class Contrato {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'numero_contrato', type: 'varchar', length: 100 })
  numeroContrato!: string;

  @Column({ name: 'processo_administrativo', type: 'varchar', length: 100, nullable: true })
  processoAdministrativo!: string | null;

  @Column({ name: 'orgao_contratante', type: 'varchar', length: 255 })
  orgaoContratante!: string;

  @Column({ name: 'unidade_responsavel', type: 'varchar', length: 255, nullable: true })
  unidadeResponsavel!: string | null;

  @Column({ name: 'objeto', type: 'varchar', length: 500 })
  objeto!: string;

  @Column({ name: 'descricao', type: 'text', nullable: true })
  descricao!: string | null;

  /** Data civil (sem conversão de timezone) — PRD §8.2 e A-04. */
  @Column({ name: 'data_assinatura', type: 'date', nullable: true })
  dataAssinatura!: string | null;

  /** Data civil. Duração não é coluna: UI deriva (issue). */
  @Column({ name: 'inicio_vigencia', type: 'date' })
  inicioVigencia!: string;

  @Column({ name: 'termino_vigencia', type: 'date' })
  terminoVigencia!: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: StatusContrato,
    enumName: 'contratos_status_enum',
  })
  status!: StatusContrato;

  /**
   * Vínculo opcional ao usuário de domínio (RF-03).
   * Issue: manter opcional — não bloquear cadastro sem usuário provisionado.
   * FK com ON DELETE SET NULL preserva o contrato se o usuário for removido.
   */
  @Column({ name: 'responsavel_interno_id', type: 'uuid', nullable: true })
  responsavelInternoId!: string | null;

  @ManyToOne(() => Usuario, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'responsavel_interno_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_contratos_responsavel_interno',
  })
  responsavelInterno!: Usuario | null;

  /**
   * Fiscal/gestor público (RF-03) — **informativo apenas**.
   * PRD §1.3: fora da Etapa 1 o fiscal público não acessa o sistema.
   * Portal do contratante é Fase 2 (Anexo I, item 1).
   * Sem FK, sem e-mail estruturado, sem credencial.
   */
  @Column({ name: 'fiscal_gestor', type: 'varchar', length: 255, nullable: true })
  fiscalGestor!: string | null;

  @Column({
    name: 'modo_calculo',
    type: 'enum',
    enum: ModoCalculo,
    enumName: 'contratos_modo_calculo_enum',
  })
  modoCalculo!: ModoCalculo;

  @Column({ name: 'observacoes', type: 'text', nullable: true })
  observacoes!: string | null;
}