import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CHAVE_POLITICA } from '../autorizacao/politica.decorator.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { AtividadesController } from './atividades.controller.js';
import { AtividadesService } from './atividades.service.js';
import { CreateAtividadeDto } from './dto/create-atividade.dto.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const outroContrato = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const itemId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ator = { id: itemId, perfil: PerfilUsuario.COLABORADOR, supertokensUserId: 'qa-supertokens', email: 'qa@example.invalid' };
const exemplo = () => ({ contratoId, titulo: 'Reunião', dataHora: '2026-11-09T13:00:00-03:00',
  descricao: 'Reunião de obra', tipo: 'Reunião', entregavelIds: [itemId] });

describe('HU08-01/02 — API autorizada e DTO', () => {
  it('criação, consulta e edição usam escopo protegido por contrato real', () => {
    for (const [metodo, acao, escopo] of [
      ['criar', 'atividades:registrar', 'contrato'], ['listar', 'atividades:listar', 'contrato'],
      ['detalhar', 'atividades:visualizar', 'recurso'], ['editar', 'atividades:editar', 'recurso'],
    ] as const) {
      const politica = Reflect.getMetadata(CHAVE_POLITICA, AtividadesController.prototype[metodo]);
      expect(politica.acao).toBe(acao);
      expect(politica.escopoOperacional.tipo).toBe(escopo);
      if (escopo === 'recurso') expect(politica.escopoOperacional.parametroContratoPai).toBe('contratoId');
    }
  });
  it('opcionais são opcionais, lista N:N não pode ser vazia ou duplicada', async () => {
    expect(await validate(plainToInstance(CreateAtividadeDto, exemplo()))).toHaveLength(0);
    const vazio = { ...exemplo(), entregavelIds: [] };
    expect(await validate(plainToInstance(CreateAtividadeDto, vazio))).not.toHaveLength(0);
    const duplicado = { ...exemplo(), entregavelIds: [itemId, itemId] };
    expect(await validate(plainToInstance(CreateAtividadeDto, duplicado))).not.toHaveLength(0);
    const ocorrenciaPrematura = { ...exemplo(), ocorrenciaId: itemId };
    expect(await validate(plainToInstance(CreateAtividadeDto, ocorrenciaPrematura), { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);
  });
  it('não aceita contrato do corpo divergente mesmo quando a rota está autorizada', async () => {
    const repo = {};
    const auditoria = { executarComAuditoria: jest.fn() };
    const escopo = {};
    const service = new AtividadesService(repo as never, auditoria as never, escopo as never);
    await expect(service.create(outroContrato, exemplo(), ator)).rejects.toBeInstanceOf(BadRequestException);
    expect(auditoria.executarComAuditoria).not.toHaveBeenCalled();
  });
  it('não muda conclusão física ao criar atividade', () => {
    const codigo = AtividadesService.prototype.create.toString();
    expect(codigo).not.toContain('percentualExecucao');
    expect(codigo).not.toContain('statusExecucao');
  });
});
