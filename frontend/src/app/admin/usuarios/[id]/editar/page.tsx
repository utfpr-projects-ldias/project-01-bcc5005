import { PainelAdministracao } from "../../components/painel-administracao";

export default async function EditarFuncionarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PainelAdministracao vista="edicao" idEdicao={id} />;
}
