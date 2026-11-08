import { jest } from '@jest/globals';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, PayloadTooLargeException, ServiceUnavailableException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { createHash } from 'node:crypto';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { ArquivoInvalidoError, LimiteArmazenamentoError } from '../armazenamento/politica-arquivos.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { CategoriaDocumento } from './categoria-documento.js';
import { DocumentoContratual } from './documento-contratual.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { PermissaoContrato } from '../autorizacao/permissao-contrato.entity.js';
import { DocumentosService } from './documentos.service.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const documentoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ator: UsuarioAutenticado = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', supertokensUserId: 'st-abc', email: 'gestor@example.com', perfil: PerfilUsuario.ADMINISTRADOR };
const conteudo = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
const sha256 = createHash('sha256').update(conteudo).digest('hex');
const metadata = {
  id: documentoId, contratoId, autorId: ator.id,
  categoria: CategoriaDocumento.CONTRATO_PRINCIPAL, descricao: null,
  nomeOriginal: 'contrato.pdf', tipoMime: 'application/pdf', tamanho: conteudo.length,
  sha256, storageKey: 'd'.repeat(32), criadoEm: new Date('2026-11-03T10:00:00.000Z'),
  verificadoEm: null, verificadoPor: null, reabertoEm: null, arquivadoEm: null,
} as DocumentoContratual;

function ambiente() {
  const repoSalvo = { create: jest.fn((arg: Partial<DocumentoContratual>) => ({ id: documentoId, criadoEm: metadata.criadoEm, ...arg } as DocumentoContratual)), save: jest.fn(async (arg: DocumentoContratual) => arg), findOne: jest.fn(async () => ({ ...metadata, autor: { nome: 'Pessoa de teste' } })), count: jest.fn(async () => 0) };
  const qb = { leftJoinAndSelect: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), setLock: jest.fn().mockReturnThis(), getOne: jest.fn(async () => metadata as DocumentoContratual | null) };
  // A exclusão usa o QueryBuilder do repositório transacional, não o repositório injetado.
  Object.assign(repoSalvo, { createQueryBuilder: jest.fn(() => qb), remove: jest.fn(async (d: DocumentoContratual) => d) });
  const repo = {
    findAndCount: jest.fn(async () => [[metadata], 1] as [DocumentoContratual[], number]),
    findOneBy: jest.fn(async () => metadata),
    findOne: jest.fn(async () => metadata),
    createQueryBuilder: jest.fn(() => qb),
  };
  const contratoQb = { where: jest.fn().mockReturnThis(), setLock: jest.fn().mockReturnThis(), getOne: jest.fn(async () => ({ id: contratoId })) };
  const vinculoRepo = { findOneBy: jest.fn(async () => ({ contratoId, usuarioId: ator.id, podeEditar: false, permissoesDetalhadas: {} })) };
  const contratoRepo = { createQueryBuilder: jest.fn(() => contratoQb), findOne: jest.fn(async () => ({ id: contratoId, status: 'PLANEJAMENTO', arquivadoEm: null })) };
  const manager = { getRepository: jest.fn((entidade?: unknown) => entidade === Contrato
    ? contratoRepo : entidade === PermissaoContrato ? vinculoRepo : repoSalvo) };
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
  return { repo, repoSalvo, qb, contratoQb, contratoRepo, vinculoRepo, dataSource, auditoria, escopos, storage, manager, service };
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

  it('não remove blob quando a transação retorna falha genérica com COMMIT potencialmente ambíguo', async () => {
    const e = ambiente();
    e.dataSource.transaction.mockRejectedValueOnce(new Error('sql internal secret'));
    await expect(e.service.anexar(contratoId, dto, arquivo, ator)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(e.storage.removerOrfao).not.toHaveBeenCalled();
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
    e.dataSource.transaction.mockRejectedValueOnce(new QueryFailedError('INSERT', [], Object.assign(new Error('fk'), { code: '23503' })));
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

  it('limita a 20 documentos, contando os arquivados, sob bloqueio do contrato', async () => {
    const e = ambiente();
    e.repoSalvo.count.mockResolvedValueOnce(20);
    await expect(e.service.anexar(contratoId, dto, arquivo, ator)).rejects.toBeInstanceOf(ConflictException);
    expect(e.contratoQb.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(e.storage.removerOrfao).toHaveBeenCalledTimes(1);
    expect(e.repoSalvo.save).not.toHaveBeenCalled();
  });

  it('edita apenas metadados e registra auditoria; conteúdo do blob permanece intocado', async () => {
    const e = ambiente();
    e.repoSalvo.findOne.mockResolvedValueOnce({ ...metadata, categoria: CategoriaDocumento.ANEXO, autor: { nome: 'Pessoa de teste' } } as never);
    const r = await e.service.editar(contratoId, documentoId, { descricao: 'Nova descrição' }, ator);
    expect(r.descricao).toBe('Nova descrição');
    expect(e.auditoria.registrarNaTransacao).toHaveBeenCalledWith(e.manager, ator,
      expect.objectContaining({ acao: AcaoAuditoria.DOCUMENTO_METADADOS_ALTERADOS, entidadeId: documentoId }));
    expect(e.storage.salvar).not.toHaveBeenCalled();
    expect(e.storage.removerOrfao).not.toHaveBeenCalled();
  });

  it('arquiva logicamente sem remover o arquivo físico e audita a operação', async () => {
    const e = ambiente();
    const r = await e.service.arquivar(contratoId, documentoId, ator);
    expect(r.arquivadoEm).toBeInstanceOf(Date);
    expect(e.auditoria.registrarNaTransacao).toHaveBeenCalledWith(e.manager, ator,
      expect.objectContaining({ acao: AcaoAuditoria.DOCUMENTO_ARQUIVADO, entidadeId: documentoId }));
    expect(e.storage.removerOrfao).not.toHaveBeenCalled();
  });

  it.each(['SUSPENSO', 'CANCELADO'] as const)(
    'bloqueia arquivamento e verificação documental em contrato %s, inclusive para ADMIN', async status => {
      const e = ambiente();
      e.contratoRepo.findOne.mockResolvedValue({ id: contratoId, status, arquivadoEm: null });
      await expect(e.service.arquivar(contratoId, documentoId, ator)).rejects.toBeInstanceOf(ConflictException);
      await expect(e.service.verificar(contratoId, documentoId, ator)).rejects.toBeInstanceOf(ConflictException);
      expect(e.repoSalvo.save).not.toHaveBeenCalled();
    },
  );

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

  it('impede alterar metadados do documento principal e reclassificar anexo como principal', async () => {
    const e = ambiente();
    await expect(e.service.editar(contratoId, documentoId, { descricao: 'Não pode' }, ator))
      .rejects.toBeInstanceOf(ConflictException);
    e.repoSalvo.findOne.mockResolvedValueOnce({ ...metadata, categoria: CategoriaDocumento.ANEXO, autor: { nome: 'Pessoa de teste' } } as never);
    await expect(e.service.editar(contratoId, documentoId, { categoria: CategoriaDocumento.CONTRATO_PRINCIPAL }, ator))
      .rejects.toBeInstanceOf(ConflictException);
    expect(e.repoSalvo.save).not.toHaveBeenCalled();
  });

  it('impede dois documentos principais ativos e mantém o blob anterior', async () => {
    const e = ambiente();
    e.repoSalvo.count.mockResolvedValueOnce(1);
    await expect(e.service.anexar(contratoId, dto, arquivo, ator)).rejects.toBeInstanceOf(ConflictException);
    expect(e.repoSalvo.save).not.toHaveBeenCalled();
    expect(e.storage.removerOrfao).toHaveBeenCalledTimes(1);
  });

  it('GESTOR autorizado a anexar documentos pode enviar PDF principal sem permissão especial de arquivamento', async () => {
    const e = ambiente();
    e.dataSource.getRepository = jest.fn(() => ({ findOneBy: jest.fn(async () => ({ permissoesDetalhadas: {} })) })) as never;
    const resultado = await e.service.anexar(contratoId, dto, arquivo,
      { ...ator, perfil: PerfilUsuario.GESTOR });
    expect(resultado.categoria).toBe(CategoriaDocumento.CONTRATO_PRINCIPAL);
    expect(e.storage.salvar).toHaveBeenCalledTimes(1);
    expect(e.repoSalvo.save).toHaveBeenCalledTimes(1);
  });

  it('anexar principal não concede ao GESTOR o direito especial de arquivar esse documento', async () => {
    const e = ambiente();
    e.dataSource.getRepository = jest.fn(() => ({ findOneBy: jest.fn(async () => ({ permissoesDetalhadas: {} })) })) as never;
    await expect(e.service.arquivar(contratoId, documentoId,
      { ...ator, perfil: PerfilUsuario.GESTOR })).rejects.toBeInstanceOf(ForbiddenException);
    expect(e.repoSalvo.save).not.toHaveBeenCalled();
  });

  it('autorizações do PDF principal são independentes: arquivar não concede reativar nem excluir', async () => {
    const usuario = { ...ator, perfil: PerfilUsuario.GESTOR };
    const a = ambiente();
    a.vinculoRepo.findOneBy.mockResolvedValue({ contratoId, usuarioId: ator.id, podeEditar: false,
      permissoesDetalhadas: { arquivarDocumentoPrincipal: true, reativarDocumentoPrincipal: false, excluirDocumentoPrincipal: false } });
    await expect(a.service.arquivar(contratoId, documentoId, usuario)).resolves.toMatchObject({ id: documentoId });
    const b = ambiente();
    b.repoSalvo.findOne.mockResolvedValueOnce({ ...metadata, arquivadoEm: new Date() } as never);
    b.vinculoRepo.findOneBy.mockResolvedValue({ contratoId, usuarioId: ator.id, podeEditar: false,
      permissoesDetalhadas: { arquivarDocumentoPrincipal: true } });
    await expect(b.service.reativar(contratoId, documentoId, usuario)).rejects.toBeInstanceOf(ForbiddenException);
    const c = ambiente();
    c.qb.getOne.mockResolvedValueOnce({ ...metadata, arquivadoEm: new Date() } as never);
    c.vinculoRepo.findOneBy.mockResolvedValue({ contratoId, usuarioId: ator.id, podeEditar: false,
      permissoesDetalhadas: { arquivarDocumentoPrincipal: true } });
    await expect(c.service.excluirArquivado(contratoId, documentoId, usuario)).rejects.toBeInstanceOf(ConflictException);
  });

  it('permissão legada agrupada não concede poderes novos e o contrato concluído impede alteração', async () => {
    const usuario = { ...ator, perfil: PerfilUsuario.GESTOR };
    const a = ambiente();
    a.vinculoRepo.findOneBy.mockResolvedValue({ contratoId, usuarioId: ator.id, podeEditar: true,
      permissoesDetalhadas: { administrarDocumentoPrincipal: true } });
    await expect(a.service.arquivar(contratoId, documentoId, usuario)).rejects.toBeInstanceOf(ForbiddenException);
    const b = ambiente();
    b.contratoRepo.findOne.mockResolvedValueOnce({ id: contratoId, status: 'CONCLUIDO', arquivadoEm: null });
    await expect(b.service.arquivar(contratoId, documentoId, ator)).rejects.toBeInstanceOf(ConflictException);
  });

  it('novo documento permanece pendente de verificação até decisão autorizada', async () => {
    const e = ambiente();
    const enviado = await e.service.anexar(contratoId, dto, arquivo, ator);
    expect(enviado.verificadoEm).toBeNull();
    expect(enviado.situacao).toBe('PENDENTE_VERIFICACAO');
  });

  it('exige permissão específica do gestor para verificar PDF principal', async () => {
    const b = ambiente();
    const verificador = { ...ator, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', perfil: PerfilUsuario.GESTOR };
    b.vinculoRepo.findOneBy.mockResolvedValue({ contratoId, usuarioId: verificador.id, podeEditar: false,
      permissoesDetalhadas: { verificarDocumentoPrincipal: true } });
    const dado = await b.service.verificar(contratoId, documentoId, verificador);
    expect(dado.situacao).toBe('VERIFICADO');
    expect(b.auditoria.registrarNaTransacao).toHaveBeenCalledWith(b.manager, verificador,
      expect.objectContaining({ acao: AcaoAuditoria.DOCUMENTO_VERIFICADO }));
  });

  it('documento verificado exige reabertura antes de arquivar; não pode ser eliminado fisicamente', async () => {
    const e = ambiente();
    e.repoSalvo.findOne.mockResolvedValue({ ...metadata, verificadoEm: new Date() } as never);
    await expect(e.service.arquivar(contratoId, documentoId, ator)).rejects.toBeInstanceOf(ConflictException);
    await expect(e.service.excluirArquivado(contratoId, documentoId, ator)).rejects.toBeInstanceOf(ConflictException);
  });

  it('reabertura de verificação exige permissão individual e preserva auditoria', async () => {
    const a = ambiente();
    a.repoSalvo.findOne.mockResolvedValue({ ...metadata, verificadoEm: new Date() } as never);
    const verificador = { ...ator, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', perfil: PerfilUsuario.GESTOR };
    a.vinculoRepo.findOneBy.mockResolvedValue({ contratoId, usuarioId: verificador.id, podeEditar: false,
      permissoesDetalhadas: { verificarDocumentoPrincipal: true, reabrirDocumentoPrincipal: false } });
    await expect(a.service.reabrir(contratoId, documentoId, verificador)).rejects.toBeInstanceOf(ForbiddenException);
    const b = ambiente();
    b.repoSalvo.findOne.mockResolvedValue({ ...metadata, verificadoEm: new Date() } as never);
    b.vinculoRepo.findOneBy.mockResolvedValue({ contratoId, usuarioId: verificador.id, podeEditar: false,
      permissoesDetalhadas: { reabrirDocumentoPrincipal: true } });
    const reaberto = await b.service.reabrir(contratoId, documentoId, verificador);
    expect(reaberto.situacao).toBe('EM_REVISAO');
  });

  it('limite de dez anexos arquivados também vale quando o limite geral de vinte ainda não acabou', async () => {
    const e = ambiente();
    const anexo = { ...metadata, categoria: CategoriaDocumento.ANEXO } as DocumentoContratual;
    e.repoSalvo.findOne.mockResolvedValue(anexo as never);
    e.repoSalvo.count.mockResolvedValue(10);
    await expect(e.service.arquivar(contratoId, documentoId, ator)).rejects.toBeInstanceOf(ConflictException);
  });
});
