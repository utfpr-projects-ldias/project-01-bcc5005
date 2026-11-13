import { redirect } from 'next/navigation';
/** A consulta de evidencias é contextual às abas do contrato. */
export default function PaginaLegadaEvidencias() {
  redirect('/contratos');
}
