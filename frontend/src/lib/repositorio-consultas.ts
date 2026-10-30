/** Cache em memoria por instancia do provider. Nenhuma credencial e persistida. */
export type Consulta<T> = { dados?: T; erro?: unknown; carregando: boolean; atualizando: boolean };
export type ChaveConsulta = readonly (string | number | boolean | null)[];
type Entrada = {
  estado: Consulta<unknown>;
  ouvintes: Set<() => void>;
  ultimaLeitura: number;
  pendente?: Promise<unknown>;
  controlador?: AbortController;
  consultar?: (signal: AbortSignal) => Promise<unknown>;
  geracao: number;
};
const VAZIO: Consulta<unknown> = Object.freeze({ carregando: false, atualizando: false });
export function chaveTexto(chave: ChaveConsulta) { return JSON.stringify(chave); }
export class RepositorioConsultas {
  private entradas = new Map<string, Entrada>();
  private sessao = 0;
  private entrada(chave: string): Entrada {
    let entrada = this.entradas.get(chave);
    if (!entrada) {
      entrada = { estado: VAZIO, ouvintes: new Set(), ultimaLeitura: 0, geracao: 0 };
      this.entradas.set(chave, entrada);
    }
    return entrada;
  }
  ler<T>(chave: string): Consulta<T> { return (this.entradas.get(chave)?.estado ?? VAZIO) as Consulta<T>; }
  observar(chave: string, aviso: () => void) {
    const entrada = this.entrada(chave);
    entrada.ouvintes.add(aviso);
    return () => { entrada.ouvintes.delete(aviso); };
  }
  private notificar(entrada: Entrada, estado: Consulta<unknown>) {
    entrada.estado = estado;
    entrada.ouvintes.forEach((avisar) => avisar());
  }
  async buscar<T>(chave: string, consulta: (signal: AbortSignal) => Promise<T>, opcoes: { forcar?: boolean; validadeMs?: number } = {}): Promise<T> {
    const entrada = this.entrada(chave);
    entrada.consultar = consulta;
    if (entrada.pendente) return entrada.pendente as Promise<T>;
    if (!opcoes.forcar && entrada.estado.dados !== undefined && Date.now() - entrada.ultimaLeitura < (opcoes.validadeMs ?? 0)) return entrada.estado.dados as T;
    const geracao = ++entrada.geracao;
    const sessao = this.sessao;
    const controlador = new AbortController();
    entrada.controlador = controlador;
    this.notificar(entrada, { ...entrada.estado, carregando: entrada.estado.dados === undefined, atualizando: entrada.estado.dados !== undefined, erro: undefined });
    const pedido = Promise.resolve().then(() => consulta(controlador.signal));
    entrada.pendente = pedido;
    try {
      const dados = await pedido;
      if (entrada.geracao === geracao && this.sessao === sessao && !controlador.signal.aborted) {
        entrada.ultimaLeitura = Date.now();
        this.notificar(entrada, { dados, carregando: false, atualizando: false });
      }
      return dados;
    } catch (erro) {
      if (entrada.geracao === geracao && this.sessao === sessao && !controlador.signal.aborted) {
        const status = (erro as { status?: number } | null)?.status;
        // Um 401/403/404 nunca pode deixar no DOM um dado protegido do cache.
        this.notificar(entrada, { ...(status === 401 || status === 403 || status === 404 ? {} : { dados: entrada.estado.dados }), erro, carregando: false, atualizando: false });
      }
      throw erro;
    } finally {
      if (entrada.geracao === geracao) { entrada.pendente = undefined; entrada.controlador = undefined; }
    }
  }
  gravar<T>(chave: string, dados: T) {
    const entrada = this.entrada(chave);
    entrada.geracao++;
    entrada.controlador?.abort(); entrada.pendente = undefined; entrada.controlador = undefined;
    entrada.ultimaLeitura = Date.now();
    this.notificar(entrada, { dados, carregando: false, atualizando: false });
  }
  /** Invalida prefixos serializados de maneira estrutural, nao por string includes. */
  invalidar(prefixo: ChaveConsulta, opcoes: { recarregar?: boolean } = {}) {
    for (const [chave, entrada] of this.entradas) {
      const partes = JSON.parse(chave) as ChaveConsulta;
      if (!prefixo.every((valor, i) => partes[i] === valor)) continue;
      entrada.ultimaLeitura = 0;
      // Uma leitura em voo iniciada antes da mutacao nao pode sobrescrever a nova.
      if (entrada.pendente) {
        entrada.geracao++;
        entrada.controlador?.abort();
        entrada.controlador = undefined; entrada.pendente = undefined;
      }
      if (entrada.ouvintes.size && entrada.consultar && opcoes.recarregar !== false) {
        // Efeito assíncrono notifica consumidores; a mutacao ja foi confirmada pelo servidor.
        void this.buscar(chave, entrada.consultar, { forcar: true }).catch(() => {});
      }
    }
  }
  /** Chamado nos limites de sessao; impede respostas de requests antigos de repovoarem o cache. */
  limpar() {
    this.sessao++;
    for (const entrada of this.entradas.values()) {
      entrada.geracao++;
      entrada.controlador?.abort();
      entrada.controlador = undefined; entrada.pendente = undefined;
      entrada.ultimaLeitura = 0;
      this.notificar(entrada, VAZIO);
    }
  }
}
