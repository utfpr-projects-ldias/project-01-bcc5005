import { renderComConsultas } from '@/test-utils';
import { screen } from '@testing-library/react';
import { useMeuPerfil } from './use-meu-perfil';
import { consultarMeuPerfil } from '@/lib/admin-usuarios';

jest.mock('@/lib/admin-usuarios', () => ({ consultarMeuPerfil: jest.fn() }));
const perfil = consultarMeuPerfil as jest.MockedFunction<typeof consultarMeuPerfil>;
function Identidade({ rotulo }: { rotulo: string }) {
  const consulta = useMeuPerfil();
  return <div>{rotulo}: {consulta.dados?.nome ?? 'Carregando'}</div>;
}
beforeEach(() => jest.clearAllMocks());
test('menu desktop, mobile e header dividem uma unica consulta simultanea', async () => {
  perfil.mockResolvedValue({ id:'a', nome:'Admin', email:'admin@example.com', perfil:'ADMINISTRADOR', ativo:true });
  renderComConsultas(<><Identidade rotulo="desktop"/><Identidade rotulo="mobile"/><Identidade rotulo="header"/></>);
  await screen.findByText('header: Admin');
  expect(screen.getByText('desktop: Admin')).toBeInTheDocument();
  expect(perfil).toHaveBeenCalledTimes(1);
});
