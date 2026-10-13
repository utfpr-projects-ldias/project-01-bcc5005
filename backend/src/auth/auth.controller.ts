import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";

import { AuthService, SignupResult } from "./auth.service.js";
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
}
