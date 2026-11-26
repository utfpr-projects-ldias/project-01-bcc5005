import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable,
  InternalServerErrorException, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, type Repository } from 'typeorm';
import type { ConsultarFuncionariosDto } from './dto/consultar-funcionarios.dto.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { PerfilUsuario } from './perfil-usuario.enum.js';
import { Usuario } from './usuario.entity.js';
import { IdentidadesFuncionariosService } from './identidades-funcionarios.service.js';
import { alterarEmailSeguro } from './alteracao-email-segura.js';
import { alterarSenhaSegura } from './alteracao-senha-segura.js';
import { PermissaoContrato } from '../autorizacao/permissao-contrato.entity.js';
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
    const dados = await this.repositorio.find({ where: { perfil: Not(PerfilUsuario.ADMINISTRADOR) }, order: { criadoEm: 'DESC' }, take: 100 });
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
    // A administração da própria conta pertence exclusivamente ao módulo Minha conta.
    query.andWhere('u.perfil <> :perfilAdministrador', { perfilAdministrador: PerfilUsuario.ADMINISTRADOR });
    if (filtros.ativo !== undefined) query.andWhere('u.ativo = :ativo', { ativo: filtros.ativo });
    if (busca) query.andWhere("(u.nome ILIKE :busca ESCAPE '\\' OR u.email ILIKE :busca ESCAPE '\\')", { busca: `%${escapar(busca)}%` });
    const [dados, total] = await query.orderBy('u.criadoEm', 'DESC')
      .addOrderBy('u.id', 'DESC').skip((pagina - 1) * limite).take(limite).getManyAndCount();
    return { itens: dados.map((u) => this.publico(u)), pagina, limite, total, totalPaginas: Math.max(1, Math.ceil(total / limite)) };
  }

  /** Consulta individual para página de edição; a política ADMIN já é aplicada pelo controller. */
  async buscarPorId(id: string) {
    const usuario = await this.repositorio.findOneBy({ id });
    if (!usuario) throw new NotFoundException('Funcionário não encontrado');
    return this.publico(usuario);
  }

  async criar(dto: CriarFuncionarioDto, ator: UsuarioAutenticado) {
    if (ator?.perfil !== PerfilUsuario.ADMINISTRADOR) throw new ForbiddenException('Somente Administrador pode criar funcionários');
    if (![PerfilUsuario.GESTOR, PerfilUsuario.COLABORADOR].includes(dto.perfil)) {
      throw new BadRequestException('Somente os perfis GESTOR e COLABORADOR podem ser provisionados');
    }
    const nome = normalizarNomeCompleto(dto.nome, 30);
    const email = dto.email.trim().toLowerCase();
    const jaExiste = await this.repositorio.findOneBy({ email });
    if (jaExiste) throw new ConflictException('E-mail já cadastrado');

    const supertokensUserId = await this.identidades.criar(email, dto.senhaInicial);
    let callbackConcluido = false;
    try {
      const usuario = await this.dataSource.transaction(async (manager) => {
        const autor = await manager.getRepository(Usuario).findOne({ where: { id: ator.id }, lock: { mode: 'pessimistic_write' } });
        if (!autor?.ativo || autor.bloqueioSessoesId || autor.perfil !== PerfilUsuario.ADMINISTRADOR || autor.supertokensUserId !== ator.supertokensUserId) {
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
        callbackConcluido = true;
        return salvo;
      });
      return this.publico(usuario);
    } catch (error: unknown) {
      // Se a callback terminou, uma rejeição pode ter ocorrido na confirmação do COMMIT.
      // Nunca excluir a identidade externa sem saber o resultado da transação.
      if (callbackConcluido) {
        let persistido: Usuario | null;
        try {
          persistido = await this.repositorio.findOneBy({ supertokensUserId });
        } catch {
          this.logger.error('Resultado indeterminado do COMMIT de criação; consulta de reconciliação indisponível');
          throw new InternalServerErrorException('Cadastro com confirmação indeterminada; contate o suporte técnico');
        }
        if (persistido) {
          if (persistido.email === email) {
            this.logger.warn('COMMIT de criação confirmado por leitura após erro de confirmação');
            return this.publico(persistido);
          }
          this.logger.error('Identidade existente com dados divergentes; exige reconciliação técnica');
          throw new InternalServerErrorException('Cadastro com confirmação indeterminada; contate o suporte técnico');
        }
      }
      // Em erro pré-COMMIT (ou ausência confirmada), a compensação continua obrigatória.
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
    if (!autor || autor.bloqueioSessoesId || autor.perfil !== PerfilUsuario.ADMINISTRADOR || autor.supertokensUserId !== ator.supertokensUserId) {
      throw new ForbiddenException('Administrador não está ativo');
    }
    const alvo = await this.repositorio.findOneBy({ id });
    if (!alvo) throw new NotFoundException('Funcionário não encontrado');
    if (alvo.perfil === PerfilUsuario.ADMINISTRADOR) throw new ForbiddenException('Não é permitido alterar credenciais de Administrador');
    return alvo;
  }

  async alterarEmail(id: string, emailInformado: string, ator: UsuarioAutenticado) {
    const email = emailInformado.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 40) {
      throw new BadRequestException('E-mail inválido');
    }
    await this.carregarAlvo(id, ator);
    return this.publico(await alterarEmailSeguro(this.dataSource, this.auditoria, this.identidades, ator, id, email));
  }

  /** Senha e revogação usam bloqueio durável e revalidam autor/alvo sob lock. */
  async redefinirSenha(id: string, novaSenha: string, ator: UsuarioAutenticado): Promise<void> {
    await this.carregarAlvo(id, ator);
    if (novaSenha.length < 12 || novaSenha.length > 30 ||
      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).+$/.test(novaSenha)) {
      throw new BadRequestException('Senha fora da política mínima');
    }
    await alterarSenhaSegura(this.dataSource, this.auditoria, this.identidades, ator, id, novaSenha);
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
    const novoNome = dto.nome === undefined ? undefined : normalizarNomeCompleto(dto.nome, 30);

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
      if (!autorReal || !autorReal.ativo || autorReal.bloqueioSessoesId || autorReal.perfil !== PerfilUsuario.ADMINISTRADOR ||
          autorReal.supertokensUserId !== ator.supertokensUserId) {
        throw new ForbiddenException('Administrador não está ativo');
      }
      const alvo = bloqueados.get(id);
      if (!alvo) throw new NotFoundException('Funcionário não encontrado');

      if (alvo.perfil === PerfilUsuario.ADMINISTRADOR &&
          (alvo.id !== ator.id || dto.perfil !== undefined || dto.ativo !== undefined)) {
        throw new ForbiddenException('Conta de Administrador permite apenas atualizar o próprio nome');
      }
      if (alvo.bloqueioSessoesId && (dto.ativo === true || dto.perfil !== undefined))
        throw new ConflictException('Regularize as sessões antes de alterar a situação ou o perfil');
      // Reativar exige confirmar revogação; desativação permanece possível mesmo
      // se o Core estiver indisponível. O guard nega domínio inativo.
      if ((dto.ativo === true && !alvo.ativo) || (dto.perfil === PerfilUsuario.GESTOR && alvo.perfil !== PerfilUsuario.GESTOR))
        await this.identidades.revogarSessoes(alvo.supertokensUserId);
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

      if (mudancasPosteriores.perfil !== undefined) {
        const vinculos = manager.getRepository(PermissaoContrato);
        const anteriores = await vinculos.find({where:{usuarioId:alvo.id,podeEditar:true},order:{contratoId:'ASC'}});
        for (const vinculo of anteriores) {
          vinculo.podeEditar = false;
          await vinculos.save(vinculo);
          await this.auditoria.registrarNaTransacao(manager, ator, {
            acao: AcaoAuditoria.USUARIO_PERMISSAO_CONCEDIDA, entidadeTipo:'USUARIO', entidadeId:alvo.id,
            contratoIdAcl:vinculo.contratoId,
            dadosAnteriores:{contratoId:vinculo.contratoId,podeEditar:true,permissoesDetalhadas:vinculo.permissoesDetalhadas},
            dadosPosteriores:{contratoId:vinculo.contratoId,podeEditar:false,permissoesDetalhadas:vinculo.permissoesDetalhadas},
          });
        }
        mudancasPosteriores.vinculosLegadosRegularizados = anteriores.length;
      }
      await repositorio.save(alvo);
      if (mudancasPosteriores.ativo === false || mudancasPosteriores.perfil === PerfilUsuario.COLABORADOR) {
        try { await this.identidades.revogarSessoes(alvo.supertokensUserId); }
        catch { this.logger.warn('Revogação de sessões não confirmada; permissões locais permanecem atualizadas'); }
      }
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
