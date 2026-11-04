import { jest } from '@jest/globals';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ContratosService } from './contratos.service.js';
import { Contrato } from './contrato.entity.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const admin = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', perfil: PerfilUsuario.ADMINISTRADOR } as UsuarioAutenticado;
const gestor = { ...admin, perfil: PerfilUsuario.GESTOR };

function cenario() {
  const atual = { id, status: 'PLANEJAMENTO', arquivadoEm: null, arquivadoPor: null };
  const findOne = jest.fn(async () => atual);
  const save = jest.fn(async (v: unknown) => v);
  const repo = { findOne, save };
  const manager = { getRepository: jest.fn(() => repo) };
  const evento = jest.fn(async (_: unknown, executar: (m: unknown) => Promise<unknown>) => {
    const resultado = await executar(manager);
    return (resultado as {resultado: Contrato}).resultado;
  });
  const service = new ContratosService({} as never, { executarComAuditoria: evento } as never);
  return { service, atual, evento, repo };
}

test('arquivar mantém status e grava registro auditado na mesma transação', async () => {
  const { service, atual, evento } = cenario();
  const salvo = await service.alterarArquivamento(id, true, admin);
  expect(salvo.arquivadoEm).toBeInstanceOf(Date);
  expect(salvo.arquivadoPor).toBe(admin.id);
  expect(atual.status).toBe('PLANEJAMENTO');
  const callback = evento.mock.calls[0][1];
  // O callback foi executado pelo mock transacional, sem operação de DELETE.
  expect(evento).toHaveBeenCalledTimes(1);
  expect(callback).toEqual(expect.any(Function));
});

test('arquivar duas vezes gera conflito; usuário não ADMIN é proibido', async () => {
  const { service } = cenario();
  await service.alterarArquivamento(id, true, admin);
  await expect(service.alterarArquivamento(id, true, admin)).rejects.toBeInstanceOf(ConflictException);
  await expect(service.alterarArquivamento(id, false, gestor)).rejects.toBeInstanceOf(ForbiddenException);
});
