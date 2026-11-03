import { createHash } from 'node:crypto';
import {
  BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException,
  OnModuleInit, PayloadTooLargeException, ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { ARMAZENAMENTO_ARQUIVOS, type ArmazenamentoArquivos } from '../armazenamento/contrato-armazenamento.js';
import { ArmazenamentoIndisponivelError } from '../armazenamento/armazenamento-local.js';
import { ArquivoInvalidoError, LimiteArmazenamentoError } from '../armazenamento/politica-arquivos.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ResolverEscopoContratoService } from '../autorizacao/resolver-escopo-contrato.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { CategoriaDocumento } from './categoria-documento.js';
import { DocumentoContratual } from './documento-contratual.entity.js';
import type { CriarDocumentoDto } from './dto/documentos.dto.js';

export interface ArquivoRecebido {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

/** Nunca incluir storageKey ou token de compensação em respostas ou snapshots de auditoria. */
function publico(documento: DocumentoContratual) {
  return {
    id: documento.id,
    contratoId: documento.contratoId,
    categoria: documento.categoria,
    descricao: documento.descricao,
    nomeOriginal: documento.nomeOriginal,
    tipoMime: documento.tipoMime,
    tamanho: documento.tamanho,
    autorId: documento.autorId,
    autorNome: documento.autor?.nome ?? null,
    criadoEm: documento.criadoEm,
  };
}

@Injectable()
export class DocumentosService implements OnModuleInit {
  private readonly logger = new Logger(DocumentosService.name);

  constructor(
    @InjectRepository(DocumentoContratual)
    private readonly documentos: Repository<DocumentoContratual>,
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly escopos: ResolverEscopoContratoService,
    @Inject(ARMAZENAMENTO_ARQUIVOS)
    private readonly armazenamento: ArmazenamentoArquivos,
  ) {}

  onModuleInit(): void {
    this.escopos.registrarAdaptador('documento', async (id) => {
      const encontrado = await this.documentos.findOne({ where: { id }, select: { contratoId: true } });
      return encontrado?.contratoId ?? null;
    });
    this.auditoria.registrarResolvedorContexto('DOCUMENTO', async (manager, id) => {
      const encontrado = await manager.getRepository(DocumentoContratual).findOne({
        where: { id }, select: { contratoId: true },
      });
      return encontrado?.contratoId ?? null;
    });
  }

  async listar(contratoId: string, categoria?: CategoriaDocumento, pagina = 1) {
    const [documentos, total] = await this.documentos.findAndCount({
      where: { contratoId, ...(categoria ? { categoria } : {}) },
      relations: { autor: true },
      order: { criadoEm: 'DESC', id: 'DESC' },
      take: 20,
      skip: (pagina - 1) * 20,
    });
    return { itens: documentos.map(publico), pagina, total, totalPaginas: Math.max(1, Math.ceil(total / 20)) };
  }

  async detalhar(contratoId: string, id: string) {
    const documento = await this.documentos.findOne({ where: { id, contratoId }, relations: { autor: true } });
    if (!documento) throw new NotFoundException('Documento não encontrado');
    return publico(documento);
  }

  async anexar(contratoId: string, dto: CriarDocumentoDto, arquivo: ArquivoRecebido | undefined, ator: UsuarioAutenticado) {
    if (!arquivo || !Buffer.isBuffer(arquivo.buffer) || arquivo.size !== arquivo.buffer.length) {
      throw new BadRequestException('Arquivo obrigatório ou inválido');
    }
    if (dto.categoria === CategoriaDocumento.CONTRATO_PRINCIPAL && arquivo.mimetype !== 'application/pdf') {
      throw new BadRequestException('Documento principal deve ser um arquivo PDF');
    }
    let pendente: Awaited<ReturnType<ArmazenamentoArquivos['salvar']>>;
    try {
      pendente = await this.armazenamento.salvar({
        nomeOriginal: arquivo.originalname,
        mimeDeclarado: arquivo.mimetype,
        conteudo: arquivo.buffer,
      });
    } catch (erro) {
      this.tratarErroStorage(erro);
    }

    let documento: DocumentoContratual;
    try {
      documento = await this.dataSource.transaction(async (manager) => {
        const repositorio = manager.getRepository(DocumentoContratual);
        const novo = repositorio.create({
          contratoId,
          autorId: ator.id,
          categoria: dto.categoria,
          descricao: dto.descricao ?? null,
          nomeOriginal: pendente.nomeOriginal,
          tipoMime: pendente.mimeEfetivo,
          tamanho: pendente.tamanho,
          sha256: pendente.sha256,
          storageKey: pendente.chave,
        });
        const salvo = await repositorio.save(novo);
        await this.auditoria.registrarNaTransacao(manager, ator, {
          acao: AcaoAuditoria.DOCUMENTO_ANEXADO,
          entidadeTipo: 'DOCUMENTO',
          entidadeId: salvo.id,
          dadosPosteriores: {
            categoria: salvo.categoria,
            descricao: salvo.descricao,
            nomeOriginal: salvo.nomeOriginal,
            tipoMime: salvo.tipoMime,
            tamanho: salvo.tamanho,
          },
        });
        return salvo;
      });
    } catch (erro) {
      // O commit não ocorreu: liberar apenas o blob pendente com token efêmero válido.
      try {
        await this.armazenamento.removerOrfao(pendente);
      } catch {
        this.logger.error('Compensação de blob após falha SQL requer reconciliação manual');
        throw new ServiceUnavailableException('Falha documental; armazenamento requer reconciliação');
      }
      if (erro instanceof QueryFailedError) {
        const codigo = (erro.driverError as { code?: string }).code;
        if (codigo === '23503' || codigo === '23505') {
          throw new ConflictException('Contrato, autor ou documento alterado durante o envio');
        }
      }
      this.logger.error('Falha na transação de metadados/auditoria documental');
      throw new ServiceUnavailableException('Não foi possível registrar o documento');
    }

    // Somente DEPOIS do commit; nunca remover o blob caso o commit tenha sido bem-sucedido.
    try {
      this.armazenamento.confirmarPersistencia(pendente);
    } catch {
      this.logger.error('Documento confirmado no banco, mas confirmação local do blob falhou');
      throw new ServiceUnavailableException('Documento registrado, verificação de storage pendente');
    }
    return { ...publico(documento), autorNome: ator.nome ?? null };
  }

  async baixar(contratoId: string, id: string): Promise<{ metadados: ReturnType<typeof publico>; conteudo: Buffer }> {
    const documento = await this.documentos.createQueryBuilder('documento')
      .leftJoinAndSelect('documento.autor', 'autor')
      .addSelect('documento.storageKey')
      .where('documento.id = :id AND documento.contratoId = :contratoId', { id, contratoId })
      .getOne();
    if (!documento) throw new NotFoundException('Documento não encontrado');
    let conteudo: Buffer;
    try {
      conteudo = await this.armazenamento.ler(documento.storageKey);
    } catch (erro) {
      if (erro instanceof ArmazenamentoIndisponivelError) {
        this.logger.error('Documento persistido sem blob disponível; reconciliação necessária');
        throw new ServiceUnavailableException('Arquivo temporariamente indisponível');
      }
      this.logger.error('Falha ao recuperar blob documental');
      throw new ServiceUnavailableException('Arquivo temporariamente indisponível');
    }
    if (conteudo.length !== documento.tamanho ||
      createHash('sha256').update(conteudo).digest('hex') !== documento.sha256) {
      this.logger.error('Integridade do arquivo documental não confere com metadados');
      throw new ServiceUnavailableException('Arquivo temporariamente indisponível');
    }
    return { metadados: publico(documento), conteudo };
  }

  private tratarErroStorage(erro: unknown): never {
    if (erro instanceof ArquivoInvalidoError) throw new BadRequestException(erro.message);
    if (erro instanceof LimiteArmazenamentoError) throw new PayloadTooLargeException(erro.message);
    this.logger.error('Falha de armazenamento privado durante upload');
    throw new ServiceUnavailableException('Serviço de arquivos temporariamente indisponível');
  }
}
