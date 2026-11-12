/** Estado de navegação da carteira por aba do navegador (não armazena dados contratuais). */
export type AbaCarteira = 'todos' | 'ativos' | 'pendentes' | 'revisao' | 'concluidos' | 'suspensos' | 'cancelados' | 'arquivados';
export type CampoCarteira = 'todos' | 'numero' | 'codigo' | 'orgao' | 'objeto';
export type EstadoCarteira = {
  aba: AbaCarteira; busca: string; campo: CampoCarteira; status: string; rolagem: number;
};
const CHAVE = 'tec08:carteira:estado:v1';
const ABAS: AbaCarteira[] = ['todos', 'ativos', 'pendentes', 'revisao', 'concluidos', 'suspensos', 'cancelados', 'arquivados'];
const CAMPOS: CampoCarteira[] = ['todos', 'numero', 'codigo', 'orgao', 'objeto'];
export function lerEstadoCarteira(): EstadoCarteira | null {
  if (typeof window === 'undefined') return null;
  try {
    const bruto = window.sessionStorage.getItem(CHAVE);
    if (!bruto) return null;
    const valor = JSON.parse(bruto) as Partial<EstadoCarteira>;
    if (!ABAS.includes(valor.aba as AbaCarteira) || !CAMPOS.includes(valor.campo as CampoCarteira)) return null;
    return {
      aba: valor.aba!, campo: valor.campo!,
      busca: typeof valor.busca === 'string' ? valor.busca.slice(0, 250) : '',
      status: typeof valor.status === 'string' ? valor.status : '',
      rolagem: typeof valor.rolagem === 'number' && Number.isFinite(valor.rolagem) ? Math.max(0, valor.rolagem) : 0,
    };
  } catch { return null; }
}
export function salvarEstadoCarteira(estado: EstadoCarteira): void {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(CHAVE, JSON.stringify(estado)); } catch { /* Armazenamento bloqueado: navegação segue funcional. */ }
}
