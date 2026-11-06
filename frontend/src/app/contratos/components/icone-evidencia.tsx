/** Ícone compacto segundo o tipo do arquivo; fallback sem depender da extensão. */
export function IconeEvidencia({ nome, tipo }: { nome?: string | null; tipo: string }) {
  const texto = (nome || tipo).toLocaleLowerCase('pt-BR');
  const imagem = /\.(png|jpe?g|webp|gif)$|foto|imagem|fotografia/.test(texto);
  const pdf = /\.pdf$|pdf|relat[oó]rio/.test(texto);
  const documento = /\.(docx?|odt|rtf)$|documento|of[ií]cio/.test(texto);
  const formato = imagem ? 'Imagem' : pdf ? 'PDF' : documento ? 'Documento' : 'Arquivo';
  return <span aria-hidden="true" title={formato} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-green/30 bg-brand-green/10 text-brand-neon">
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {imagem ? <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 2-2 5 5"/></> :
      <><path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v6h5"/>
      {pdf ? <path d="M9 16h6M9 13h6"/> : <path d="M9 13h6M9 16h4"/>}</>}
    </svg>
  </span>;
}
