import { UsuariosModule } from "../usuarios/usuarios.module.js";
import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";

@Module({
  imports: [UsuariosModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
