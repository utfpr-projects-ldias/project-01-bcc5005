import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import type { Request, Response } from "express";
import Session from "supertokens-node/recipe/session";

import { AuthService, SignupResult } from "./auth.service.js";
import { SigninDto } from "./dto/signin.dto.js";
import { SignupDto } from "./dto/signup.dto.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("signup")
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async signup(@Body() dto: SignupDto): Promise<SignupResult> {
    return this.authService.signup(dto);
  }

  @Post("signin")
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async signin(
    @Body() dto: SigninDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const user = await this.authService.signin(dto);

    // A sessão é criada somente depois que o SuperTokens valida a senha.
    // O próprio SuperTokens escreve os cookies/cabeçalhos da sessão na resposta.
    await Session.createNewSession(
      request,
      response,
      "public",
      user.recipeUserId,
    );

    return response.status(HttpStatus.OK).json({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  }
}