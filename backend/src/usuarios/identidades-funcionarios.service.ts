import { ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common';
import EmailPassword from 'supertokens-node/recipe/emailpassword';
import supertokens from 'supertokens-node';

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

  /** Só é chamado para identidade recém-criada por ESTA tentativa de provisionamento. */
  async excluirCriacaoIncompleta(userId: string): Promise<void> {
    await supertokens.deleteUser(userId);
  }
}
