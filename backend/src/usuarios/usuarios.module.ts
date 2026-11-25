import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from './usuario.entity.js';
import { UsuariosService } from './usuarios.service.js';
import { IdentidadesFuncionariosService } from './identidades-funcionarios.service.js';
import { AdministracaoUsuariosService } from './administracao-usuarios.service.js';
import { AdministracaoUsuariosController } from './administracao-usuarios.controller.js';
import { MinhaContaController } from './minha-conta.controller.js';
import { MinhaContaService } from './minha-conta.service.js';
import { HistoricoAdministrativoController } from './historico-administrativo.controller.js';
import { HistoricoAdministrativoService } from './historico-administrativo.service.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Usuario]), AuditoriaModule],
  controllers: [AdministracaoUsuariosController, MinhaContaController, HistoricoAdministrativoController],
  providers: [UsuariosService, IdentidadesFuncionariosService, AdministracaoUsuariosService, MinhaContaService, HistoricoAdministrativoService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
