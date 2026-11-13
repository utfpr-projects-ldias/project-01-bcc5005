import { redirect } from 'next/navigation';
/** A consulta de atividades é contextual às abas do contrato. */
export default function PaginaLegadaAtividades() {
  redirect('/contratos');
}
