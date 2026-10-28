import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable,
  InternalServerErrorException, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type Repository } from 'typeorm';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { PerfilUsuario } from './perfil-usuario.enum.js';
import { Usuario } from './usuario.entity.js';
import { UsuariosService } from './usuarios.service.js';
import { IdentidadesFuncionariosService } from './identidades-funcionarios.service.js';
import { normalizarNomeCompleto } from './nome-completo.js';
import type { CriarFuncionarioDto } from './dto/criar-funcionario.dto.js';
import type { AtualizarFuncionarioDto } from './dto/atualizar-funcionario.dto.js';

@Injectable()
export class AdministracaoUsuariosService {
  private readonly logger = new Logger(AdministracaoUsuariosService.name);

  constructor(
    @InjectRepository(Usuario) private readonly repositorio: Repository<Usuario>,
    private readonly usuarios: UsuariosService,
    private readonly identidades: IdentidadesFuncionariosService,
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar() {
    const dados = await this.repositorio.find({ order: { criadoEm: 'DESC' }, take: 100 });
    return dados.map((usuario) => this.publico(usuario));
  }

  async criar(dto: CriarFuncionarioDto) {
    if (![PerfilUsuario.GESTOR, PerfilUsuario.COLABORADOR].includes(dto.perfil)) {
      throw new BadRequestException('Somente os perfis GESTOR e COLABORADOR podem ser provisionados');
    }
    const nome = normalizarNomeCompleto(dto.nome);
    const email = dto.email.trim().toLowerCase();
    const jaExiste = await this.repositorio.findOneBy({ email });
    if (jaExiste) throw new ConflictException('E-mail já cadastrado');

    const supertokensUserId = await this.identidades.criar(email, dto.senhaInicial);
    try {
      const usuario = await this.usuarios.criarProvisionado({
        supertokensUserId, email, nome, perfil: dto.perfil,
      });
      return this.publico(usuario);
    } catch (error: unknown) {
      try {
        await this.identidades.excluirCriacaoIncompleta(supertokensUserId);
      } catch {
        this.logger.error('Falha na compensação da identidade recém-criada; exige reconciliação manual');
        throw new InternalServerErrorException('Cadastro incompleto; contate o administrador técnico');
      }
      if (error instanceof HttpException) throw error;
      this.logger.error('Falha ao persistir funcionário no banco da aplicação');
      throw new InternalServerErrorException('Falha ao provisionar funcionário');
    }
  }

  /**
   * Atualização de domínio e auditoria no MESMO commit. Nunca altera credenciais.
   * Guard global verifica sessão e perfil ADMIN; o serviço reforça a restrição.
   */
  async atualizar(id: string, dto: AtualizarFuncionarioDto, ator: UsuarioAutenticado) {
    if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
      throw new ForbiddenException('Somente Administrador pode alterar funcionários');
    }
    if (dto.nome === undefined && dto.perfil === undefined && dto.ativo === undefined) {
      throw new BadRequestException('Informe ao menos um campo para alterar');
    }
    if (dto.perfil !== undefined &&
        dto.perfil !== PerfilUsuario.GESTOR && dto.perfil !== PerfilUsuario.COLABORADOR) {
      throw new BadRequestException('Não é permitido definir perfil ADMINISTRADOR');
    }
    if (dto.ativo !== undefined && typeof dto.ativo !== 'boolean') {
      throw new BadRequestException('Situação inválida');
    }
    const novoNome = dto.nome === undefined ? undefined : normalizarNomeCompleto(dto.nome);

    return this.dataSource.transaction(async (manager) => {
      const repositorio = manager.getRepository(Usuario);
      // Bloqueia o autor e o alvo por ID na mesma ordem, evitando decisões concorrentes.
      // Nenhum endpoint permite alterar perfil/ativo de ADMINISTRADOR.
      const ids = [...new Set([ator.id, id])].sort();
      const bloqueados = new Map<string, Usuario>();
      for (const usuarioId of ids) {
        const encontrado = await repositorio.findOne({
          where: { id: usuarioId }, lock: { mode: 'pessimistic_write' },
        });
        if (encontrado) bloqueados.set(usuarioId, encontrado);
      }
      const autorReal = bloqueados.get(ator.id);
      if (!autorReal || !autorReal.ativo || autorReal.perfil !== PerfilUsuario.ADMINISTRADOR ||
          autorReal.supertokensUserId !== ator.supertokensUserId) {
        throw new ForbiddenException('Administrador não está ativo');
      }
      const alvo = bloqueados.get(id);
      if (!alvo) throw new NotFoundException('Funcionário não encontrado');

      if (alvo.perfil === PerfilUsuario.ADMINISTRADOR &&
          (alvo.id !== ator.id || dto.perfil !== undefined || dto.ativo !== undefined)) {
        throw new ForbiddenException('Conta de Administrador permite apenas atualizar o próprio nome');
      }
      // Não concede promoção administrativa, mesmo com PATCH direto.
      const mudancasAnteriores: Record<string, unknown> = {};
      const mudancasPosteriores: Record<string, unknown> = {};
      function alterar(campo: 'nome' | 'perfil' | 'ativo', novo: string | boolean) {
        if (alvo![campo] === novo) return;
        mudancasAnteriores[campo] = alvo![campo];
        mudancasPosteriores[campo] = novo;
        if (campo === 'nome') alvo!.nome = String(novo);
        if (campo === 'perfil') alvo!.perfil = novo as PerfilUsuario;
        if (campo === 'ativo') alvo!.ativo = Boolean(novo);
      }
      if (novoNome !== undefined) alterar('nome', novoNome);
      if (dto.perfil !== undefined) alterar('perfil', dto.perfil);
      if (dto.ativo !== undefined) alterar('ativo', dto.ativo);
      if (Object.keys(mudancasPosteriores).length === 0) return this.publico(alvo);

      await repositorio.save(alvo);
      await this.auditoria.registrarNaTransacao(manager, ator, {
        acao: AcaoAuditoria.USUARIO_ATUALIZADO,
        entidadeTipo: 'USUARIO',
        entidadeId: alvo.id,
        dadosAnteriores: mudancasAnteriores,
        dadosPosteriores: mudancasPosteriores,
      });
      return this.publico(alvo);
    });
  }

  private publico(usuario: Usuario) {
    return {
      id: usuario.id,
      nome: usuario.nome ?? null,
      email: usuario.email,
      perfil: usuario.perfil,
      ativo: usuario.ativo,
      criadoEm: usuario.criadoEm,
    };
  }
}
