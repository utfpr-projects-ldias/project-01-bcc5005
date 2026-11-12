/** Loading visual reutilizável, sem alterar política de autenticação. */
export function IndicadorCarregamento({ texto, compacto = false }: { texto: string; compacto?: boolean }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center justify-center gap-2">
      <span aria-hidden="true" className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${compacto ? "h-4 w-4" : "h-6 w-6"}`} />
      <span>{texto}</span>
    </span>
  );
}
