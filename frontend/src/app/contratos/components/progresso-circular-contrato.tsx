'use client';
import { useProgresso } from '@/hooks/use-progresso';
import { ProgressoCircular } from '@/app/components/progresso-circular';
/** Mantém o indicador físico coerente com o painel de execução, independentemente do modo de cálculo. */
export function ProgressoCircularContrato({ contratoId, nome }: { contratoId: string; nome: string }) {
  const { progresso } = useProgresso(contratoId);
  return <ProgressoCircular valor={progresso?.avanco} nome={nome} tamanho="grande" corFisica />;
}
