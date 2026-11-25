import { redirect } from 'next/navigation';
/** A consulta de ocorrencias é contextual às abas do contrato. */
export default function PaginaLegadaOcorrencias() {
  redirect('/contratos');
}
