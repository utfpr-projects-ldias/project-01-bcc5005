import 'reflect-metadata';
import { jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Repository } from 'typeorm';
import { CHAVE_POLITICA, type Politica } from '../autorizacao/politica.decorator.js';
import { PoliticaAcessoService } from '../autorizacao/politica-acesso.service.js';
import type { PermissaoContrato } from '../autorizacao/permissao-contrato.entity.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { EntregaveisController } from './entregaveis.controller.js';
import { CriarEntregavelDto, EditarEntregavelDto, SubstituirChecklistDto } from './dto/planejamento-entregavel.dto.js';

const contrato = 'a66aabb1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const outroContrato = 'b66aabb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const etapa = 'c66aabb1-cccc-4ccc-8ccc-cccccccccccc';
const pessoa = (perfil: PerfilUsuario): UsuarioAutenticado => ({
  id: 'd66aabb1-dddd-4ddd-8ddd-dddddddddddd', email: 'qa@example.invalid',
  supertokensUserId: 'qa-user', perfil,
});
const buscarVinculo = jest.fn<(...args: unknown[]) => Promise<PermissaoContrato | null>>();
const politicas = new PoliticaAcessoService({ findOneBy: buscarVinculo } as unknown as Repository<PermissaoContrato>);
const politica = (metodo: keyof EntregaveisController): Politica => {
  const p = Reflect.getMetadata(CHAVE_POLITICA, EntregaveisController.prototype[metodo]) as Politica | undefined;
  if (!p) throw new Error(`Rota sem proteção: ${String(metodo)}`);
  return p;
};

beforeEach(() => buscarVinculo.mockReset());

describe('HU07-05 — políticas reais declaradas nas rotas de entregáveis', () => {
  it('GET usa leitura, POST/PATCH/PUT usam planejamento; recurso é resolvido da entidade', () => {
    expect(politica('listar')).toEqual({ acao: 'entregaveis:listar',
      escopoOperacional: { tipo: 'contrato', parametro: 'contratoId' } });
    expect(politica('criar')).toEqual({ acao: 'entregaveis:criar',
      escopoOperacional: { tipo: 'contrato', parametro: 'contratoId' } });
    for (const metodo of ['detalhar', 'editar', 'atualizarChecklist'] as const) {
      expect(politica(metodo).escopoOperacional).toEqual({
        tipo: 'recurso', recurso: 'entregavel', parametro: 'entregavelId', parametroContratoPai: 'contratoId',
      });
    }
    expect(politica('detalhar').acao).toBe('entregaveis:visualizar');
    expect(politica('editar').acao).toBe('entregaveis:editar');
    expect(politica('atualizarChecklist').acao).toBe('entregaveis:editar');
  });

  it('ADMIN pode planejar; GESTOR depende do vínculo e podeEditar; COLABORADOR não altera', async () => {
    for (const metodo of ['criar', 'editar', 'atualizarChecklist'] as const) {
      const p = politica(metodo);
      expect(await politicas.permitido(pessoa(PerfilUsuario.ADMINISTRADOR), p, contrato)).toBe(true);
      buscarVinculo.mockResolvedValueOnce(null);
      expect(await politicas.permitido(pessoa(PerfilUsuario.GESTOR), p, contrato)).toBe(false);
      buscarVinculo.mockResolvedValueOnce({ podeEditar: false } as PermissaoContrato);
      expect(await politicas.permitido(pessoa(PerfilUsuario.GESTOR), p, contrato)).toBe(false);
      buscarVinculo.mockResolvedValueOnce({ podeEditar: true } as PermissaoContrato);
      expect(await politicas.permitido(pessoa(PerfilUsuario.GESTOR), p, contrato)).toBe(true);
      expect(await politicas.permitido(pessoa(PerfilUsuario.COLABORADOR), p, contrato)).toBe(false);
    }
  });

  it('responsável cadastral não cria vínculo; leitura sem vínculo negada e IDs inválidos falham fechados', async () => {
    buscarVinculo.mockResolvedValueOnce(null);
    // O responsável cadastral não participa da autorização: somente vínculo real pesquisado.
    expect(await politicas.permitido(pessoa(PerfilUsuario.GESTOR), politica('listar'), outroContrato)).toBe(false);
    buscarVinculo.mockResolvedValueOnce({ podeEditar: false } as PermissaoContrato);
    expect(await politicas.permitido(pessoa(PerfilUsuario.COLABORADOR), politica('detalhar'), contrato)).toBe(true);
    expect(await politicas.permitido(pessoa(PerfilUsuario.ADMINISTRADOR), politica('detalhar'), 'id-forjado')).toBe(false);
    expect(buscarVinculo).toHaveBeenCalledWith({ usuarioId: pessoa(PerfilUsuario.GESTOR).id, contratoId: outroContrato });
  });
});

describe('HU07-05 — DTOs do contrato HTTP sem campos de execução', () => {
  const valido = { etapaId: etapa, nome: 'Obrigação verificável', tipo: 'UNICO',
    evidenciasEsperadas: [{ tipoEvidencia: 'ATA', obrigatoria: true }, { tipoEvidencia: 'FOTO', obrigatoria: false }] };
  it('permite criar checklist obrigatório/opcional com nested validation real', async () => {
    expect(await validate(plainToInstance(CriarEntregavelDto, valido))).toHaveLength(0);
  });
  it('recusa lista acima de 100, item sem obrigatoria e etapa inválida', async () => {
    for (const invalido of [
      { ...valido, etapaId: 'outra-etapa' },
      { ...valido, evidenciasEsperadas: [{ tipoEvidencia: 'ATA' }] },
      { ...valido, evidenciasEsperadas: Array.from({ length: 101 }, () => ({ tipoEvidencia: 'ATA', obrigatoria: true })) },
    ]) {
      expect((await validate(plainToInstance(CriarEntregavelDto, invalido))).length).toBeGreaterThan(0);
    }
  });
  it('PATCH omite campos, mas não admite tipo null; PUT rejeita itens sem booleano', async () => {
    expect(await validate(plainToInstance(EditarEntregavelDto, { nome: 'Nova descrição' }))).toHaveLength(0);
    expect((await validate(plainToInstance(EditarEntregavelDto, { tipo: null }))).length).toBeGreaterThan(0);
    expect((await validate(plainToInstance(SubstituirChecklistDto, { itens: [{ tipoEvidencia: 'FOTO' }] }))).length).toBeGreaterThan(0);
  });
});
