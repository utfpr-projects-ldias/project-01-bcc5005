import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AtividadesService } from './atividades.service.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { AtividadeEntity } from './atividade.entity.js';
import { TransicaoAtividadeDto } from './dto/transicao-atividade.dto.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';

const contrato = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const usuario = { id, email: 'qa@example.invalid', supertokensUserId: 'qa', perfil: PerfilUsuario.ADMINISTRADOR };
function montar(estado: 'REGISTRADA' | 'PENDENTE_CONCLUSAO' | 'VERIFICADA' | 'ARQUIVADA') {
  const item = Object.assign(new AtividadeEntity(), {
    id, contratoId: contrato, titulo: 'Reunião', dataHora: new Date('2026-11-09T12:00:00Z'), tipo: 'Reunião',
    descricao: 'Execução', responsavel: 'QA', status: estado, entregaveis: [],
    verificadaEm: ['REGISTRADA', 'PENDENTE_CONCLUSAO'].includes(estado) ? null : new Date(),
    arquivadaEm: estado === 'ARQUIVADA' ? new Date() : null,
  });
  const manager = {
    getRepository: jest.fn(() => ({findOne:jest.fn(async()=>({...usuario,ativo:true,bloqueioSessoesId:null}))})),
    findOne: jest.fn(async (entidade: unknown) => entidade===Contrato ? {id:contrato,status:'EM_EXECUCAO'} : item),
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
    await c.service.solicitarConclusao(contrato, id, usuario);
    expect(c.item.status).toBe('PENDENTE_CONCLUSAO');
    expect(c.item.solicitadaPor).toBe(usuario.id);
    expect(c.item.solicitadaEm).toBeInstanceOf(Date);
    await c.service.verificar(contrato, id, usuario, 'Conferido pelo gestor');
    expect(c.item.status).toBe('VERIFICADA');
    expect(c.item.verificadaPor).toBe(usuario.id);
    expect(c.item.solicitadaEm).toBeNull();
    expect(c.manager.findOne).toHaveBeenNthCalledWith(2, AtividadeEntity,
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    expect(c.manager.findOne).toHaveBeenNthCalledWith(3, AtividadeEntity,
      expect.objectContaining({ relations: { entregaveis: true, ocorrencias: true } }));
    const chamadas = c.manager.findOne.mock.calls as unknown as Array<[unknown, Record<string, unknown>]>;
    expect(chamadas[1][1]).not.toHaveProperty('relations');
    expect(chamadas[2][1]).not.toHaveProperty('lock');
    expect(c.registrar).toHaveBeenCalledWith(expect.objectContaining({ acao: AcaoAuditoria.ATIVIDADE_VERIFICADA }));
    await expect(c.service.update(contrato, id, { titulo: 'Alterado' }, usuario))
      .rejects.toBeInstanceOf(ConflictException);
    await c.service.arquivar(contrato, id, usuario, 'Conclusão do registro');
    expect(c.item.status).toBe('ARQUIVADA');
    expect(c.item.arquivadaEm).toBeInstanceOf(Date);
    expect(c.registrar).toHaveBeenCalledWith(expect.objectContaining({ acao: AcaoAuditoria.ATIVIDADE_ARQUIVADA }));
  });
  it('bloqueia uma identidade desativada antes de adquirir o lock do contrato', async()=>{
    const c=montar('REGISTRADA');
    c.manager.getRepository.mockReturnValueOnce({findOne:jest.fn(async()=>({...usuario,ativo:false,bloqueioSessoesId:null}))});
    await expect(c.service.solicitarConclusao(contrato,id,usuario)).rejects.toBeInstanceOf(ForbiddenException);
    expect(c.manager.findOne).not.toHaveBeenCalled();
    expect(c.manager.save).not.toHaveBeenCalled();
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
  it('arquivar antes da aprovação falha; aprovação sem motivo é permitida após solicitação', async () => {
    const c = montar('REGISTRADA');
    await expect(c.service.arquivar(contrato, id, usuario, 'Motivo suficientemente longo')).rejects.toBeInstanceOf(ConflictException);
    await expect(c.service.verificar(contrato, id, usuario, '')).rejects.toBeInstanceOf(ConflictException);
    await c.service.solicitarConclusao(contrato, id, usuario);
    await c.service.verificar(contrato, id, usuario, '');
    expect(c.item.status).toBe('VERIFICADA');
    expect(c.manager.save).toHaveBeenCalledTimes(2);
    expect(c.registrar).toHaveBeenCalledWith(expect.objectContaining({ acao: AcaoAuditoria.ATIVIDADE_VERIFICADA }));
  });
  it('cancelar solicitação exige justificativa e não verifica a atividade', async () => {
    const c = montar('REGISTRADA');
    await c.service.solicitarConclusao(contrato, id, usuario);
    expect(c.item.verificadaEm).toBeNull();
    expect(c.registrar).toHaveBeenCalledWith(expect.objectContaining({ acao: AcaoAuditoria.ATIVIDADE_CONCLUSAO_SOLICITADA }));
    await expect(c.service.cancelarSolicitacao(contrato, id, usuario, 'Curta')).rejects.toBeInstanceOf(BadRequestException);
    await c.service.cancelarSolicitacao(contrato, id, usuario, 'Solicitação feita por engano');
    expect(c.item.status).toBe('REGISTRADA');
    expect(c.item.verificadaEm).toBeNull();
    expect(c.registrar).toHaveBeenCalledWith(expect.objectContaining({ acao: AcaoAuditoria.ATIVIDADE_SOLICITACAO_CANCELADA }));
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
