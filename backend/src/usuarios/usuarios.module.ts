import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from './usuario.entity.js';
import { UsuariosService } from './usuarios.service.js';
import { IdentidadesFuncionariosService } from './identidades-funcionarios.service.js';
import { AdministracaoUsuariosService } from './administracao-usuarios.service.js';
import { AdministracaoUsuariosController } from './administracao-usuarios.controller.js';
import { MinhaContaController } from './minha-conta.controller.js';
import { MinhaContaService } from './minha-conta.service.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Usuario]), AuditoriaModule],
  controllers: [AdministracaoUsuariosController, MinhaContaController],
  providers: [UsuariosService, IdentidadesFuncionariosService, AdministracaoUsuariosService, MinhaContaService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
