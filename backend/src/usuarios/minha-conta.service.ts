import { ConflictException, ForbiddenException, Injectable, InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import EmailPassword from 'supertokens-node/recipe/emailpassword';
import { DataSource, type Repository } from 'typeorm';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { IdentidadesFuncionariosService } from './identidades-funcionarios.service.js';
import { PerfilUsuario } from './perfil-usuario.enum.js';
import { Usuario } from './usuario.entity.js';

@Injectable()
export class MinhaContaService {
  private readonly logger = new Logger(MinhaContaService.name);

  constructor(
    @InjectRepository(Usuario) private readonly repositorio: Repository<Usuario>,
    private readonly identidades: IdentidadesFuncionariosService,
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  private async autorValido(ator: UsuarioAutenticado): Promise<Usuario> {
    if (ator?.perfil !== PerfilUsuario.ADMINISTRADOR) {
      throw new ForbiddenException('Somente Administrador pode alterar as próprias credenciais nesta tela');
    }
    const atual = await this.repositorio.findOneBy({ id: ator.id, ativo: true });
    if (!atual || atual.perfil !== PerfilUsuario.ADMINISTRADOR || atual.supertokensUserId !== ator.supertokensUserId) {
      throw new ForbiddenException('Conta administrativa indisponível');
    }
    return atual;
  }

  private async verificarSenha(ator: UsuarioAutenticado, emailAtual: string, senhaAtual: string): Promise<void> {
    // signIn verifica senha no SuperTokens mas não cria sessão; nunca confiar no email do body.
    const resultado = await EmailPassword.signIn('public', emailAtual, senhaAtual);
    if (resultado.status !== 'OK' || resultado.user.id !== ator.supertokensUserId) {
      throw new UnauthorizedException('Senha atual incorreta');
    }
  }

  async alterarEmail(email: string, senhaAtual: string, ator: UsuarioAutenticado) {
    const atual = await this.autorValido(ator);
    await this.verificarSenha(ator, atual.email, senhaAtual);
    const destino = email.trim().toLowerCase();
    if (destino === atual.email) return { id: atual.id, nome: atual.nome ?? null, email: atual.email, perfil: atual.perfil, ativo: true };
    let emailAnterior: string | null = null;
    let alterouCore = false;
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Usuario);
        const salvo = await repo.findOne({ where: { id: ator.id }, lock: { mode: 'pessimistic_write' } });
        if (!salvo?.ativo || salvo.perfil !== PerfilUsuario.ADMINISTRADOR || salvo.supertokensUserId !== ator.supertokensUserId || salvo.email !== atual.email) {
          throw new ForbiddenException('Conta alterada durante esta operação');
        }
        if (await repo.findOneBy({ email: destino })) throw new ConflictException('E-mail já cadastrado');
        emailAnterior = salvo.email;
        await this.identidades.alterarEmail(salvo.supertokensUserId, destino);
        alterouCore = true;
        salvo.email = destino;
        await repo.save(salvo);
        await this.auditoria.registrarNaTransacao(manager, ator, {
          acao: AcaoAuditoria.USUARIO_EMAIL_ALTERADO, entidadeTipo: 'USUARIO', entidadeId: salvo.id,
          dadosAnteriores: { email: emailAnterior }, dadosPosteriores: { email: destino },
        });
        return { id: salvo.id, nome: salvo.nome ?? null, email: salvo.email, perfil: salvo.perfil, ativo: true };
      });
    } catch (erro: unknown) {
      if (alterouCore && emailAnterior !== null) {
        try { await this.identidades.alterarEmail(ator.supertokensUserId, emailAnterior); }
        catch {
          this.logger.error('Falha ao compensar mudança da própria conta no SuperTokens');
          throw new InternalServerErrorException('E-mail inconsistente entre serviços; contate o suporte');
        }
      }
      throw erro;
    }
  }

  async alterarSenha(senhaAtual: string, novaSenha: string, ator: UsuarioAutenticado): Promise<void> {
    const atual = await this.autorValido(ator);
    await this.verificarSenha(ator, atual.email, senhaAtual);
    if (senhaAtual === novaSenha) throw new ConflictException('A nova senha deve ser diferente da atual');
    // Não registra senha em evento, resposta, log nem Postgres. Auditamos o usuário da sessão.
    await this.auditoria.executarComAuditoria(ator, async () => ({ resultado: undefined, evento: {
      acao: AcaoAuditoria.USUARIO_SENHA_REDEFINICAO_SOLICITADA, entidadeTipo: 'USUARIO', entidadeId: ator.id,
      dadosPosteriores: { situacao: 'SOLICITADA_PELO_TITULAR' },
    } }));
    await this.identidades.definirNovaSenha(atual.supertokensUserId, novaSenha);
    try {
      await this.auditoria.executarComAuditoria(ator, async () => ({ resultado: undefined, evento: {
        acao: AcaoAuditoria.USUARIO_SENHA_REDEFINIDA, entidadeTipo: 'USUARIO', entidadeId: ator.id,
        dadosPosteriores: { situacao: 'EFETIVADA_PELO_TITULAR' },
      } }));
    } catch {
      this.logger.error('Senha própria alterada no SuperTokens mas auditoria final falhou');
      throw new InternalServerErrorException('Senha alterada, mas auditoria incompleta; contate o suporte');
    }
    // IdentidadesFuncionariosService revoga todas as sessões após alterar senha.
  }
}
