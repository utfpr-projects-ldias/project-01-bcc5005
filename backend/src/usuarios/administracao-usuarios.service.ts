import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable,
  InternalServerErrorException, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type Repository } from 'typeorm';
import type { ConsultarFuncionariosDto } from './dto/consultar-funcionarios.dto.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { PerfilUsuario } from './perfil-usuario.enum.js';
import { Usuario } from './usuario.entity.js';
import { IdentidadesFuncionariosService } from './identidades-funcionarios.service.js';
import { normalizarNomeCompleto } from './nome-completo.js';
import type { CriarFuncionarioDto } from './dto/criar-funcionario.dto.js';
import type { AtualizarFuncionarioDto } from './dto/atualizar-funcionario.dto.js';

@Injectable()
export class AdministracaoUsuariosService {
  private readonly logger = new Logger(AdministracaoUsuariosService.name);

  constructor(
    @InjectRepository(Usuario) private readonly repositorio: Repository<Usuario>,
    private readonly identidades: IdentidadesFuncionariosService,
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar() {
    const dados = await this.repositorio.find({ order: { criadoEm: 'DESC' }, take: 100 });
    return dados.map((usuario) => this.publico(usuario));
  }

  /** A API de consulta pagina NO SERVIDOR; a rota GET antiga permanece para compatibilidade. */
  async consultar(filtros: ConsultarFuncionariosDto) {
    const pagina = filtros.pagina ?? 1;
    const limite = filtros.limite ?? 20;
    const busca = filtros.busca?.trim().slice(0, 160) || '';
    // Escape de % e _ evita que a busca informada se torne padrão amplo arbitrário.
    const escapar = (valor: string) => valor.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const query = this.repositorio.createQueryBuilder('u');
    if (filtros.ativo !== undefined) query.andWhere('u.ativo = :ativo', { ativo: filtros.ativo });
    if (busca) query.andWhere("(u.nome ILIKE :busca ESCAPE '\\' OR u.email ILIKE :busca ESCAPE '\\')", { busca: `%${escapar(busca)}%` });
    const [dados, total] = await query.orderBy('u.criadoEm', 'DESC')
      .addOrderBy('u.id', 'DESC').skip((pagina - 1) * limite).take(limite).getManyAndCount();
    return { itens: dados.map((u) => this.publico(u)), pagina, limite, total, totalPaginas: Math.max(1, Math.ceil(total / limite)) };
  }

  async criar(dto: CriarFuncionarioDto, ator: UsuarioAutenticado) {
    if (ator?.perfil !== PerfilUsuario.ADMINISTRADOR) throw new ForbiddenException('Somente Administrador pode criar funcionários');
    if (![PerfilUsuario.GESTOR, PerfilUsuario.COLABORADOR].includes(dto.perfil)) {
      throw new BadRequestException('Somente os perfis GESTOR e COLABORADOR podem ser provisionados');
    }
    const nome = normalizarNomeCompleto(dto.nome);
    const email = dto.email.trim().toLowerCase();
    const jaExiste = await this.repositorio.findOneBy({ email });
    if (jaExiste) throw new ConflictException('E-mail já cadastrado');

    const supertokensUserId = await this.identidades.criar(email, dto.senhaInicial);
    try {
      const usuario = await this.dataSource.transaction(async (manager) => {
        const autor = await manager.getRepository(Usuario).findOne({ where: { id: ator.id }, lock: { mode: 'pessimistic_write' } });
        if (!autor?.ativo || autor.perfil !== PerfilUsuario.ADMINISTRADOR || autor.supertokensUserId !== ator.supertokensUserId) {
          throw new ForbiddenException('Administrador não está ativo');
        }
        const registro = manager.getRepository(Usuario).create({
          supertokensUserId, email, nome, perfil: dto.perfil, ativo: true,
        });
        const salvo = await manager.getRepository(Usuario).save(registro);
        await this.auditoria.registrarNaTransacao(manager, ator, {
          acao: AcaoAuditoria.USUARIO_CRIADO,
          entidadeTipo: 'USUARIO', entidadeId: salvo.id,
          dadosAnteriores: null,
          dadosPosteriores: { email: salvo.email, nome: salvo.nome, perfil: salvo.perfil, ativo: true },
        });
        return salvo;
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

  /** Bloqueia mudança da própria credencial administrativa até aprovação explícita. */
  private async carregarAlvo(id: string, ator: UsuarioAutenticado): Promise<Usuario> {
    if (ator.perfil !== PerfilUsuario.ADMINISTRADOR || id === ator.id) {
      throw new ForbiddenException('Alteração de credencial da própria conta Administrador não permitida');
    }
    const autor = await this.repositorio.findOneBy({ id: ator.id, ativo: true });
    if (!autor || autor.perfil !== PerfilUsuario.ADMINISTRADOR || autor.supertokensUserId !== ator.supertokensUserId) {
      throw new ForbiddenException('Administrador não está ativo');
    }
    const alvo = await this.repositorio.findOneBy({ id });
    if (!alvo) throw new NotFoundException('Funcionário não encontrado');
    if (alvo.perfil === PerfilUsuario.ADMINISTRADOR) throw new ForbiddenException('Não é permitido alterar credenciais de Administrador');
    return alvo;
  }

  async alterarEmail(id: string, emailInformado: string, ator: UsuarioAutenticado) {
    const email = emailInformado.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      throw new BadRequestException('E-mail inválido');
    }
    await this.carregarAlvo(id, ator);
    // Mantém exclusividade administrativa e bloqueia simultaneamente autor e alvo.
    let idCore: string | undefined;
    let anterior: string | undefined;
    let mudouNoCore = false;
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Usuario);
        const ids = [ator.id, id].sort();
        const bloqueados = new Map<string, Usuario>();
        for (const usuarioId of ids) {
          const u = await repo.findOne({ where: { id: usuarioId }, lock: { mode: 'pessimistic_write' } });
          if (u) bloqueados.set(usuarioId, u);
        }
        const autor = bloqueados.get(ator.id);
        const alvo = bloqueados.get(id);
        if (!autor?.ativo || autor.perfil !== PerfilUsuario.ADMINISTRADOR || autor.supertokensUserId !== ator.supertokensUserId) {
          throw new ForbiddenException('Administrador não está ativo');
        }
        if (!alvo) throw new NotFoundException('Funcionário não encontrado');
        if (alvo.perfil === PerfilUsuario.ADMINISTRADOR) throw new ForbiddenException('Conta administrativa protegida');
        if (alvo.email === email) return this.publico(alvo);
        if (await repo.findOneBy({ email })) throw new ConflictException('E-mail já cadastrado');
        anterior = alvo.email;
        idCore = alvo.supertokensUserId;
        // ST não participa do commit local. Compensação EXTERNA também cobre erro no COMMIT.
        await this.identidades.alterarEmail(idCore, email);
        mudouNoCore = true;
        alvo.email = email;
        await repo.save(alvo);
        await this.auditoria.registrarNaTransacao(manager, ator, {
          acao: AcaoAuditoria.USUARIO_EMAIL_ALTERADO,
          entidadeTipo: 'USUARIO', entidadeId: alvo.id,
          dadosAnteriores: { email: anterior }, dadosPosteriores: { email },
        });
        return this.publico(alvo);
      });
    } catch (erro: unknown) {
      if (mudouNoCore && idCore && anterior) {
        try { await this.identidades.alterarEmail(idCore, anterior); }
        catch {
          this.logger.error('Falha compensando e-mail após erro de banco/commit/auditoria; reconciliação manual necessária');
          throw new InternalServerErrorException('E-mail inconsistente; contate o suporte técnico');
        }
      }
      throw erro;
    }
  }

  /** A senha pertence só ao Core. Audita a tentativa ANTES do efeito não transacional. */
  async redefinirSenha(id: string, novaSenha: string, ator: UsuarioAutenticado): Promise<void> {
    const alvo = await this.carregarAlvo(id, ator);
    if (novaSenha.length < 12 || novaSenha.length > 128 ||
      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).+$/.test(novaSenha)) {
      throw new BadRequestException('Senha fora da política mínima');
    }
    await this.auditoria.executarComAuditoria(ator, async () => ({
      resultado: undefined,
      evento: { acao: AcaoAuditoria.USUARIO_SENHA_REDEFINICAO_SOLICITADA,
        entidadeTipo: 'USUARIO', entidadeId: alvo.id, dadosPosteriores: { situacao: 'SOLICITADA' } },
    }));
    await this.identidades.definirNovaSenha(alvo.supertokensUserId, novaSenha);
    try {
      await this.auditoria.executarComAuditoria(ator, async () => ({
        resultado: undefined,
        evento: { acao: AcaoAuditoria.USUARIO_SENHA_REDEFINIDA,
          entidadeTipo: 'USUARIO', entidadeId: alvo.id, dadosPosteriores: { situacao: 'EFETIVADA' } },
      }));
    } catch {
      this.logger.error('Senha alterada no SuperTokens; auditoria de confirmação falhou; reconciliação necessária');
      throw new InternalServerErrorException('Senha alterada, mas auditoria incompleta; contate o suporte técnico');
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
