import { ConflictException, ForbiddenException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import EmailPassword from 'supertokens-node/recipe/emailpassword';
import { DataSource, type Repository } from 'typeorm';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { IdentidadesFuncionariosService } from './identidades-funcionarios.service.js';
import { PerfilUsuario } from './perfil-usuario.enum.js';
import { Usuario } from './usuario.entity.js';
import { criarLimiteLogin } from '../auth/limite-login.js';
import { alterarEmailSeguro } from './alteracao-email-segura.js';
import { alterarSenhaSegura } from './alteracao-senha-segura.js';
import { normalizarNomePerfil } from './nome-completo.js';

@Injectable()
export class MinhaContaService {
  private readonly limitarSenhaAtual = criarLimiteLogin(300_000, 10);

  constructor(
    @InjectRepository(Usuario) private readonly repositorio: Repository<Usuario>,
    private readonly identidades: IdentidadesFuncionariosService,
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Atualização do próprio nome não altera perfil, e-mail nem identidades externas. */
  async alterarNome(nomeInformado: string, ator: UsuarioAutenticado) {
    const nome = normalizarNomePerfil(nomeInformado);
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Usuario);
      const atual = await repo.findOne({ where: { id: ator.id }, lock: { mode: 'pessimistic_write' } });
      if (!atual?.ativo || atual.bloqueioSessoesId || atual.supertokensUserId !== ator.supertokensUserId || atual.perfil !== ator.perfil)
        throw new ForbiddenException('Conta própria indisponível');
      if (atual.nome !== nome) {
        const nomeAnterior = atual.nome ?? null;
        atual.nome = nome;
        await repo.save(atual);
        await this.auditoria.registrarNaTransacao(manager, ator, {
          acao: AcaoAuditoria.USUARIO_ATUALIZADO, entidadeTipo: 'USUARIO', entidadeId: atual.id,
          dadosAnteriores: { nome: nomeAnterior }, dadosPosteriores: { nome },
        });
      }
      return { id: atual.id, nome: atual.nome, email: atual.email, perfil: atual.perfil, ativo: atual.ativo };
    });
  }

  private async autorValido(ator: UsuarioAutenticado): Promise<Usuario> {
    if (ator?.perfil !== PerfilUsuario.ADMINISTRADOR) {
      throw new ForbiddenException('Somente Administrador pode alterar as próprias credenciais nesta tela');
    }
    const atual = await this.repositorio.findOneBy({ id: ator.id, ativo: true });
    if (!atual || atual.bloqueioSessoesId || atual.perfil !== PerfilUsuario.ADMINISTRADOR || atual.supertokensUserId !== ator.supertokensUserId) {
      throw new ForbiddenException('Conta administrativa indisponível');
    }
    return atual;
  }

  private async verificarSenha(ator: UsuarioAutenticado, emailAtual: string, senhaAtual: string): Promise<void> {
    if (this.limitarSenhaAtual(ator.id)) throw new HttpException('Muitas tentativas de confirmar a senha atual. Aguarde alguns minutos.', 429);
    // signIn verifica senha no SuperTokens mas não cria sessão; nunca confiar no email do body.
    const resultado = await EmailPassword.signIn('public', emailAtual, senhaAtual);
    if (resultado.status !== 'OK' || resultado.user.id !== ator.supertokensUserId) {
      throw new UnauthorizedException('Senha atual incorreta');
    }
  }

  async alterarEmail(email: string, senhaAtual: string, ator: UsuarioAutenticado) {
    await this.autorValido(ator);
    const salvo = await alterarEmailSeguro(this.dataSource, this.auditoria, this.identidades, ator, ator.id,
      email.trim().toLowerCase(), alvo => this.verificarSenha(ator, alvo.email, senhaAtual));
    return { id: salvo.id, nome: salvo.nome ?? null, email: salvo.email, perfil: salvo.perfil, ativo: salvo.ativo };
  }

  async alterarSenha(senhaAtual: string, novaSenha: string, ator: UsuarioAutenticado): Promise<void> {
    await this.autorValido(ator);
    await alterarSenhaSegura(this.dataSource, this.auditoria, this.identidades, ator, ator.id, novaSenha, async alvo => {
      await this.verificarSenha(ator, alvo.email, senhaAtual);
      if (senhaAtual === novaSenha) throw new ConflictException('A nova senha deve ser diferente da atual');
    });
  }
}
