import { jest } from '@jest/globals';
import Session from 'supertokens-node/recipe/session';
import { IdentidadesFuncionariosService, RevogacaoSessoesPendenteError } from './identidades-funcionarios.service.js';

const service = new IdentidadesFuncionariosService();

afterEach(() => jest.restoreAllMocks());

describe('B02 — revogação das sessões após alteração de senha', () => {
  it('confirma a revogação quando a primeira tentativa funciona', async () => {
    const revoke = jest.spyOn(Session, 'revokeAllSessionsForUser').mockResolvedValue(1 as never);
    await service.revogarSessoes('st-pessoa');
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('st-pessoa');
  });
  it('repete uma falha transitória antes de declarar sucesso', async () => {
    const revoke = jest.spyOn(Session, 'revokeAllSessionsForUser')
      .mockRejectedValueOnce(new Error('falha temporaria')).mockResolvedValue(1 as never);
    await service.revogarSessoes('st-pessoa');
    expect(revoke).toHaveBeenCalledTimes(2);
  });
  it('distingue senha já alterada quando todas as tentativas de revogação falham', async () => {
    const revoke = jest.spyOn(Session, 'revokeAllSessionsForUser').mockRejectedValue(new Error('Core indisponivel'));
    await expect(service.revogarSessoes('st-pessoa')).rejects.toBeInstanceOf(RevogacaoSessoesPendenteError);
    expect(revoke).toHaveBeenCalledTimes(3);
  });
});
