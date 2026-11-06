/** Nenhum método concede autorização HTTP. O módulo de domínio deverá validar usuário e contrato. */
export interface SolicitarArmazenamento {
  readonly nomeOriginal: string;
  readonly mimeDeclarado: string;
  readonly conteudo: Buffer;
}

export interface ArquivoPendente {
  readonly chave: string;
  readonly nomeOriginal: string;
  readonly mimeEfetivo: string;
  readonly tamanho: number;
  readonly sha256: string;
  /** Segredo efêmero, NUNCA expor à API/cliente ou persistir em auditoria. */
  readonly tokenCompensacao: string;
}

export interface ReferenciaCompensacao {
  readonly chave: string;
  readonly tokenCompensacao: string;
}

export interface ArmazenamentoArquivos {
  salvar(entrada: SolicitarArmazenamento): Promise<ArquivoPendente>;
  ler(chave: string): Promise<Buffer>;
  existe(chave: string): Promise<boolean>;
  /** Chamar só depois de a transação SQL de metadados + auditoria confirmar. */
  confirmarPersistencia(referencia: ReferenciaCompensacao): void;
  /** Apaga SOMENTE um arquivo ainda pendente, com token válido emitido por salvar(). */
  removerOrfao(referencia: ReferenciaCompensacao): Promise<void>;
  /** Exclusão física somente de metadados já excluídos em transação autorizada. */
  removerPersistido(chave: string): Promise<void>;
}

export const ARMAZENAMENTO_ARQUIVOS = Symbol('ARMAZENAMENTO_ARQUIVOS');
