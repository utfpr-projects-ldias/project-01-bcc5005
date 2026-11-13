import { redirect } from 'next/navigation';
/** O cadastro ocorre em modal na listagem. URLs antigas retornam à carteira. */
export default function NovoContratoPage() { redirect('/contratos'); }
