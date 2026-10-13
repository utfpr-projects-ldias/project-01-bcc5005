import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import EmailPassword from "supertokens-node/recipe/emailpassword";

import { SignupDto } from "./dto/signup.dto.js";

export type SignupResult = {
  id: string;
  email: string;
  role: "user";
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  async signup(dto: SignupDto): Promise<SignupResult> {
    try {
      const response = await EmailPassword.signUp(
        "public",
        dto.email,
        dto.password,
      );

      if (response.status === "EMAIL_ALREADY_EXISTS_ERROR") {
        throw new ConflictException("E-mail já cadastrado");
      }

      if (response.status !== "OK") {
        throw new BadRequestException("Não foi possível criar a conta");
      }

      return {
        id: response.user.id,
        email: response.user.emails[0],
        role: "user",
      };
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof ConflictException
      ) {
        throw err;
      }
      this.logger.error("Falha ao criar conta no SuperTokens", err as Error);
      throw new InternalServerErrorException("Falha ao criar a conta");
    }
  }
}
