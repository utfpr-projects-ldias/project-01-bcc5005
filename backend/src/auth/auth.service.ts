import { Injectable, InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import EmailPassword from 'supertokens-node/recipe/emailpassword';
import supertokens from 'supertokens-node';
import { SigninDto } from './dto/signin.dto.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Não expor signup aqui; a criação de funcionários existe apenas no serviço administrativo.
  async signin(dto: SigninDto) {
    try {
      const response = await EmailPassword.signIn('public', dto.email, dto.password);
      if (response.status === 'WRONG_CREDENTIALS_ERROR') {
        throw new UnauthorizedException('E-mail ou senha inválidos');
      }
      if (response.status !== 'OK') {
        throw new UnauthorizedException('Não foi possível autenticar');
      }
      return {
        recipeUserId: response.recipeUserId,
        id: response.user.id,
        email: response.user.emails[0] ?? dto.email,
        role: 'user' as const,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error('Falha ao autenticar usuário no SuperTokens', err as Error);
      throw new InternalServerErrorException('Falha ao realizar o login');
    }
  }

  async getMe(userId: string) {
    try {
      const user = await supertokens.getUser(userId);
      if (!user) throw new UnauthorizedException('Usuário não encontrado');
      return { id: user.id, email: user.emails[0] };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error('Falha ao buscar usuário autenticado', err as Error);
      throw new InternalServerErrorException('Falha ao recuperar dados da sessão');
    }
  }
}
