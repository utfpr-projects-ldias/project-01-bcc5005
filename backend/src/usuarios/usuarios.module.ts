import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from './usuario.entity.js';
import { UsuariosService } from './usuarios.service.js';
import { IdentidadesFuncionariosService } from './identidades-funcionarios.service.js';
import { AdministracaoUsuariosService } from './administracao-usuarios.service.js';
import { AdministracaoUsuariosController } from './administracao-usuarios.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Usuario])],
  controllers: [AdministracaoUsuariosController],
  providers: [UsuariosService, IdentidadesFuncionariosService, AdministracaoUsuariosService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
