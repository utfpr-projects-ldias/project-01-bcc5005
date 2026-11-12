import 'reflect-metadata';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AtividadesService } from './atividades.service.js';
import { AtividadeEntity } from './atividade.entity.js';
import { TransicaoAtividadeDto } from './dto/transicao-atividade.dto.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';

const contrato = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const usuario = { id, email: 'qa@example.invalid', supertokensUserId: 'qa', perfil: PerfilUsuario.ADMINISTRADOR };
function montar(estado: 'REGISTRADA' | 'VERIFICADA' | 'ARQUIVADA') {
  const item = Object.assign(new AtividadeEntity(), {
    id, contratoId: contrato, titulo: 'Reunião', dataHora: new Date('2026-11-09T12:00:00Z'), tipo: 'Reunião',
    descricao: 'Execução', responsavel: 'QA', status: estado, entregaveis: [],
    verificadaEm: estado === 'REGISTRADA' ? null : new Date(),
    arquivadaEm: estado === 'ARQUIVADA' ? new Date() : null,
  });
  const manager = {
    findOne: jest.fn(async () => item),
    save: jest.fn(async () => item),
  };
  const registrar = jest.fn();
  const auditoria = { executarComAuditoria: async (_ator: unknown, fn: (m: typeof manager) => Promise<{ resultado: AtividadeEntity; evento: unknown }>) => {
    const resultado = await fn(manager);
    registrar(resultado.evento);
    return resultado.resultado;
  } };
  const service = new AtividadesService({} as never, auditoria as never, {} as never);
  return { service, item, manager, registrar };
}

describe('HU08-05-01 — estados e auditoria transacional de atividades', () => {
  it('verificar e arquivar exigem passos distintos; edição após verificação é bloqueada', async () => {
    const c = montar('REGISTRADA');
    await c.service.verificar(contrato, id, usuario, 'Conferido pelo gestor');
    expect(c.item.status).toBe('VERIFICADA');
    expect(c.manager.findOne).toHaveBeenNthCalledWith(1, AtividadeEntity,
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    expect(c.manager.findOne).toHaveBeenNthCalledWith(2, AtividadeEntity,
      expect.objectContaining({ relations: { entregaveis: true } }));
    const chamadas = c.manager.findOne.mock.calls as unknown as Array<[unknown, Record<string, unknown>]>;
    expect(chamadas[0][1]).not.toHaveProperty('relations');
    expect(chamadas[1][1]).not.toHaveProperty('lock');
    expect(c.registrar).toHaveBeenCalledWith(expect.objectContaining({ acao: AcaoAuditoria.ATIVIDADE_VERIFICADA }));
    await expect(c.service.update(contrato, id, { titulo: 'Alterado' }, usuario))
      .rejects.toBeInstanceOf(ConflictException);
    await c.service.arquivar(contrato, id, usuario, 'Conclusão do registro');
    expect(c.item.status).toBe('ARQUIVADA');
    expect(c.item.arquivadaEm).toBeInstanceOf(Date);
    expect(c.registrar).toHaveBeenCalledWith(expect.objectContaining({ acao: AcaoAuditoria.ATIVIDADE_ARQUIVADA }));
  });
  it('reativar não reabre edição; exige reabertura posterior', async () => {
    const c = montar('ARQUIVADA');
    await c.service.reativar(contrato, id, usuario, 'Retorno à consulta ativa');
    expect(c.item.status).toBe('VERIFICADA');
    expect(c.item.arquivadaEm).toBeNull();
    await c.service.reabrir(contrato, id, usuario, 'Correção necessária');
    expect(c.item.status).toBe('REGISTRADA');
    expect(c.item.verificadaEm).toBeNull();
  });
  it('arquivar antes da verificação falha; verificar sem motivo é permitido', async () => {
    const c = montar('REGISTRADA');
    await expect(c.service.arquivar(contrato, id, usuario, 'Motivo suficientemente longo')).rejects.toBeInstanceOf(ConflictException);
    await c.service.verificar(contrato, id, usuario, '');
    expect(c.item.status).toBe('VERIFICADA');
    expect(c.manager.save).toHaveBeenCalledTimes(1);
    expect(c.registrar).toHaveBeenCalledWith(expect.objectContaining({ acao: AcaoAuditoria.ATIVIDADE_VERIFICADA }));
  });
  it('exclusão lógica exige arquivamento, motivo e registra evento sem apagar vínculos', async () => {
    const c = montar('REGISTRADA');
    await expect(c.service.excluir(contrato, id, usuario, 'Motivo suficientemente longo')).rejects.toBeInstanceOf(ConflictException);
    c.item.status = 'ARQUIVADA';
    expect(() => c.service.excluir(contrato, id, usuario, '')).toThrow(BadRequestException);
    expect(() => c.service.excluir(contrato, id, usuario, 'Curto')).toThrow(BadRequestException);
    expect(() => c.service.excluir(contrato, id, usuario, 'X'.repeat(201))).toThrow(BadRequestException);
    const saida = await c.service.excluir(contrato, id, usuario, 'Registro duplicado no diário');
    expect(saida).toEqual({ excluida: true });
    expect(c.item.excluidaEm).toBeInstanceOf(Date);
    expect(c.item.entregaveis).toEqual([]);
    expect(c.registrar).toHaveBeenCalledWith(expect.objectContaining({ acao: AcaoAuditoria.ATIVIDADE_EXCLUIDA }));
    await expect(c.service.excluir(contrato, id, usuario, 'Outro motivo registrado')).rejects.toThrow();
  });
  it('DTO permite verificação sem motivo e exige 15 a 200 caracteres quando houver justificativa', async () => {
    expect(await validate(plainToInstance(TransicaoAtividadeDto, { justificativa: 'Conferido e validado' }))).toHaveLength(0);
    expect(await validate(plainToInstance(TransicaoAtividadeDto, {}))).toHaveLength(0);
    expect(await validate(plainToInstance(TransicaoAtividadeDto, { justificativa: 'curta' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(TransicaoAtividadeDto, { justificativa: 'x'.repeat(201) }))).not.toHaveLength(0);
  });
});
