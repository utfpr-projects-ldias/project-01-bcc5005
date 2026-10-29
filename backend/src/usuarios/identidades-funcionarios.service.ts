import { ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common';
import EmailPassword from 'supertokens-node/recipe/emailpassword';
import supertokens from 'supertokens-node';
import Session from 'supertokens-node/recipe/session';

/** Adaptador isolado para testar falhas/compensação sem chamar o Core nos testes. */
@Injectable()
export class IdentidadesFuncionariosService {
  async criar(email: string, senha: string): Promise<string> {
    const resultado = await EmailPassword.signUp('public', email, senha);
    if (resultado.status === 'EMAIL_ALREADY_EXISTS_ERROR') {
      throw new ConflictException('E-mail já cadastrado');
    }
    if (resultado.status !== 'OK') {
      throw new InternalServerErrorException('Falha ao criar credencial');
    }
    return resultado.user.id;
  }

  async alterarEmail(userId: string, email: string): Promise<void> {
    const resultado = await EmailPassword.updateEmailOrPassword({
      recipeUserId: supertokens.convertToRecipeUserId(userId), email,
    });
    if (resultado.status === 'EMAIL_ALREADY_EXISTS_ERROR') throw new ConflictException('E-mail já cadastrado');
    if (resultado.status !== 'OK') throw new InternalServerErrorException('Alteração de e-mail não autorizada pelo provedor');
  }

  async definirNovaSenha(userId: string, novaSenha: string): Promise<void> {
    const resultado = await EmailPassword.updateEmailOrPassword({
      recipeUserId: supertokens.convertToRecipeUserId(userId), password: novaSenha,
      applyPasswordPolicy: true, tenantIdForPasswordPolicy: 'public',
    });
    if (resultado.status === 'PASSWORD_POLICY_VIOLATED_ERROR') {
      throw new ConflictException('Nova senha não atende à política de segurança');
    }
    if (resultado.status !== 'OK') throw new InternalServerErrorException('Não foi possível definir a nova senha');
    // Definir nova senha invalida sessões existentes; o usuário fará login novamente.
    await Session.revokeAllSessionsForUser(userId);
  }

  /** Só é chamado para identidade recém-criada por ESTA tentativa de provisionamento. */
  async excluirCriacaoIncompleta(userId: string): Promise<void> {
    await supertokens.deleteUser(userId);
  }
}
