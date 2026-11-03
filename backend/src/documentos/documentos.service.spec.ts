import { jest } from '@jest/globals';
import { BadRequestException, ConflictException, NotFoundException, PayloadTooLargeException, ServiceUnavailableException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { createHash } from 'node:crypto';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { ArquivoInvalidoError, LimiteArmazenamentoError } from '../armazenamento/politica-arquivos.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { CategoriaDocumento } from './categoria-documento.js';
import { DocumentoContratual } from './documento-contratual.entity.js';
import { DocumentosService } from './documentos.service.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const documentoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ator: UsuarioAutenticado = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', supertokensUserId: 'st-abc', email: 'gestor@example.com', perfil: PerfilUsuario.GESTOR };
const conteudo = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
const sha256 = createHash('sha256').update(conteudo).digest('hex');
const metadata = {
  id: documentoId, contratoId, autorId: ator.id,
  categoria: CategoriaDocumento.CONTRATO_PRINCIPAL, descricao: null,
  nomeOriginal: 'contrato.pdf', tipoMime: 'application/pdf', tamanho: conteudo.length,
  sha256, storageKey: 'd'.repeat(32), criadoEm: new Date('2026-11-03T10:00:00.000Z'),
} as DocumentoContratual;

function ambiente() {
  const repoSalvo = { create: jest.fn((arg: Partial<DocumentoContratual>) => ({ id: documentoId, criadoEm: metadata.criadoEm, ...arg } as DocumentoContratual)), save: jest.fn(async (arg: DocumentoContratual) => arg), findOne: jest.fn(async () => ({ contratoId })) };
  const qb = { leftJoinAndSelect: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getOne: jest.fn(async () => metadata as DocumentoContratual | null) };
  const repo = {
    findAndCount: jest.fn(async () => [[metadata], 1] as [DocumentoContratual[], number]),
    findOneBy: jest.fn(async () => metadata),
    findOne: jest.fn(async () => metadata),
    createQueryBuilder: jest.fn(() => qb),
  };
  const manager = { getRepository: jest.fn(() => repoSalvo) };
  const dataSource = { transaction: jest.fn(async (fn: (manager: { getRepository: typeof manager.getRepository }) => Promise<DocumentoContratual>) => fn(manager)) };
  const auditoria = { registrarResolvedorContexto: jest.fn((_tipo: string, _fn: (manager: typeof manager, id: string) => Promise<string | null>) => undefined), registrarNaTransacao: jest.fn(async () => undefined) };
  const escopos = { registrarAdaptador: jest.fn((_recurso: string, _fn: (id: string) => Promise<string | null>) => undefined) };
  const storage = {
    salvar: jest.fn(async () => ({ chave: 'd'.repeat(32), tokenCompensacao: 's'.repeat(64), nomeOriginal: 'contrato.pdf', mimeEfetivo: 'application/pdf', tamanho: conteudo.length, sha256 })),
    ler: jest.fn(async () => conteudo),
    existe: jest.fn(async () => true),
    confirmarPersistencia: jest.fn(),
    removerOrfao: jest.fn(async () => undefined),
  };
  const service = new DocumentosService(repo as never, dataSource as never, auditoria as never, escopos as never, storage);
  return { repo, repoSalvo, qb, dataSource, auditoria, escopos, storage, manager, service };
}

const arquivo = { buffer: conteudo, size: conteudo.length, originalname: 'contrato.pdf', mimetype: 'application/pdf' };
const dto = { categoria: CategoriaDocumento.CONTRATO_PRINCIPAL };

describe('TEC08-02: documentos privados (serviço)', () => {
  it('registra adaptador de ACL e resolvedor de auditoria a partir da FK persistida', async () => {
    const e = ambiente();
    e.service.onModuleInit();
    expect(e.escopos.registrarAdaptador).toHaveBeenCalledWith('documento', expect.any(Function));
    expect(e.auditoria.registrarResolvedorContexto).toHaveBeenCalledWith('DOCUMENTO', expect.any(Function));
    const [, resolverACL] = e.escopos.registrarAdaptador.mock.calls[0];
    expect(await resolverACL(documentoId)).toBe(contratoId);
    const [, resolverAudit] = e.auditoria.registrarResolvedorContexto.mock.calls[0];
    expect(await resolverAudit(e.manager, documentoId)).toBe(contratoId);
  });

  it('insere metadados e evento de auditoria na mesma transação, sem vazar chave', async () => {
    const e = ambiente();
    const saida = await e.service.anexar(contratoId, dto, arquivo, ator);
    expect(e.dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(e.auditoria.registrarNaTransacao).toHaveBeenCalledWith(e.manager, ator,
      expect.objectContaining({ acao: AcaoAuditoria.DOCUMENTO_ANEXADO, entidadeTipo: 'DOCUMENTO', entidadeId: documentoId }));
    expect(e.storage.confirmarPersistencia).toHaveBeenCalledTimes(1);
    expect(e.storage.removerOrfao).not.toHaveBeenCalled();
    expect(saida).not.toHaveProperty('storageKey');
    expect(JSON.stringify(saida)).not.toContain('d'.repeat(32));
  });

  it('compensa somente blob pendente quando a transação de banco falha', async () => {
    const e = ambiente();
    e.dataSource.transaction.mockRejectedValueOnce(new Error('sql internal secret'));
    await expect(e.service.anexar(contratoId, dto, arquivo, ator)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(e.storage.removerOrfao).toHaveBeenCalledTimes(1);
    expect(e.storage.confirmarPersistencia).not.toHaveBeenCalled();
  });

  it('não apaga blob depois de commit, mesmo se confirmação falhar', async () => {
    const e = ambiente();
    e.storage.confirmarPersistencia.mockImplementationOnce(() => { throw new Error('falha'); });
    await expect(e.service.anexar(contratoId, dto, arquivo, ator)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(e.storage.removerOrfao).not.toHaveBeenCalled();
  });

  it('erro de FK vira conflito sem expor SQL e compensa o arquivo', async () => {
    const e = ambiente();
    e.dataSource.transaction.mockRejectedValueOnce(new QueryFailedError('INSERT', [], Object.assign(new Error('fk'), { code: '23503' })));
    await expect(e.service.anexar(contratoId, dto, arquivo, ator)).rejects.toBeInstanceOf(ConflictException);
    expect(e.storage.removerOrfao).toHaveBeenCalledTimes(1);
  });

  it('falha de compensação não expõe caminho nem assume gravação concluída', async () => {
    const e = ambiente();
    e.dataSource.transaction.mockRejectedValueOnce(new Error('erro sql'));
    e.storage.removerOrfao.mockRejectedValueOnce(new Error('erro fs'));
    await expect(e.service.anexar(contratoId, dto, arquivo, ator)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('nega arquivo ausente ou com buffer inválido', async () => {
    const e = ambiente();
    await expect(e.service.anexar(contratoId, dto, undefined, ator)).rejects.toBeInstanceOf(BadRequestException);
    expect(e.storage.salvar).not.toHaveBeenCalled();
  });

  it('converte arquivo inválido e limite em 400/413', async () => {
    const e = ambiente();
    e.storage.salvar.mockRejectedValueOnce(new ArquivoInvalidoError('Extensão incorreta'));
    await expect(e.service.anexar(contratoId, dto, arquivo, ator)).rejects.toBeInstanceOf(BadRequestException);
    e.storage.salvar.mockRejectedValueOnce(new LimiteArmazenamentoError('Grande'));
    await expect(e.service.anexar(contratoId, dto, arquivo, ator)).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('retorna metadados filtrados, sem storageKey, inclusive no detalhe', async () => {
    const e = ambiente();
    const lista = await e.service.listar(contratoId, CategoriaDocumento.CONTRATO_PRINCIPAL);
    expect(lista.itens).toHaveLength(1);
    expect(lista.itens[0]).not.toHaveProperty('storageKey');
    const detalhe = await e.service.detalhar(contratoId, documentoId);
    expect(detalhe).not.toHaveProperty('sha256');
    expect(detalhe).not.toHaveProperty('storageKey');
  });

  it('download confere bytes, tamanho e SHA-256 antes de entregar', async () => {
    const e = ambiente();
    const resultado = await e.service.baixar(contratoId, documentoId);
    expect(resultado.conteudo).toEqual(conteudo);
    expect(resultado.metadados).not.toHaveProperty('storageKey');
    e.storage.ler.mockResolvedValueOnce(Buffer.from('alterado'));
    await expect(e.service.baixar(contratoId, documentoId)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('documento inexistente ou de contrato diferente retorna 404', async () => {
    const e = ambiente();
    e.repo.findOne.mockResolvedValueOnce(null as never);
    await expect(e.service.detalhar(contratoId, documentoId)).rejects.toBeInstanceOf(NotFoundException);
    e.qb.getOne.mockResolvedValueOnce(null);
    await expect(e.service.baixar(contratoId, documentoId)).rejects.toBeInstanceOf(NotFoundException);
    // A consulta real restringe id E contratoId, independente do filtro aplicado no guard.
    expect(e.qb.where).toHaveBeenCalledWith(expect.stringContaining('documento.contratoId'), { id: documentoId, contratoId });
  });
});
