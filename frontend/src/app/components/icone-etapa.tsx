import type { IconeEtapa as TipoIcone } from '@/lib/identidade-etapa';
const caminhos: Record<TipoIcone,string> = {
 planejamento:'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16',
 andamento:'M5 19V13m7 6V9m7 10V5',
 revisao:'M12 3 2 21h20L12 3Zm0 6v5m0 3v1',
 pendente:'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16m0 3v5l3 2',
 'encerramento-pendente':'M4 4h16v16H4zM8 8l8 8m0-8-8 8',
 concluida:'M5 12l4 4L19 6',
 parcial:'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16m-4 8 3 3 5-5',
 encerrada:'M5 5h14v14H5zM8 12h8',
 arquivada:'M3 4h18v5H3zM5 9v11h14V9m-9 4h4',
};
export function IconeEtapa({tipo}:{tipo:TipoIcone}) {
 return <svg aria-hidden="true" data-icone-etapa={tipo} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d={caminhos[tipo]}/></svg>;
}
