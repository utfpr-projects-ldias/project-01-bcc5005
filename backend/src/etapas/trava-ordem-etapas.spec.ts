import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { Contrato } from '../contratos/contrato.entity.js';
import { EtapasService } from './etapas.service.js';

const ID = '11111111-1111-4111-8111-111111111111';

it('API de reordenação nega ordem bloqueada sob o lock da linha do contrato, antes de editar etapas', async () => {
  const getOne = jest.fn(async () => ({ id: ID, ordemEtapasBloqueada: true }));
  const query = { setLock: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getOne };
  const repoContrato = { createQueryBuilder: () => query };
  const getRepository = jest.fn(() => repoContrato);
  const manager = { getRepository };
  type Manager = typeof manager;
  const transaction = jest.fn((funcao: (contexto: Manager) => Promise<unknown>) => funcao(manager));
  const service = new EtapasService({} as never, {} as never, { transaction } as never, {} as never);
  await expect(service.reordenar(ID, { idsOrdemAtual: [], idsOrdemNova: [] }, { id: 'u' } as never))
    .rejects.toBeInstanceOf(ConflictException);
  expect(query.setLock).toHaveBeenCalledWith('pessimistic_write');
  expect(getRepository).toHaveBeenCalledWith(Contrato);
  expect(getRepository).toHaveBeenCalledTimes(1); // Nenhum acesso à tabela de etapas.
});
