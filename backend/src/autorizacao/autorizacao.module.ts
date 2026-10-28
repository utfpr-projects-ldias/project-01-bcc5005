import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuariosModule } from '../usuarios/usuarios.module.js';
import { AutorizacaoGuard } from './autorizacao.guard.js';
import { PerfilController } from './perfil.controller.js';
import { PermissaoContrato } from './permissao-contrato.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { GestaoPermissoesService } from './gestao-permissoes.service.js';
import { GestaoPermissoesController } from './gestao-permissoes.controller.js';
import { PoliticaAcessoService } from './politica-acesso.service.js';
import { SessaoSuperTokensService } from './sessao-supertokens.service.js';

@Module({
  imports: [UsuariosModule, AuditoriaModule, TypeOrmModule.forFeature([PermissaoContrato, Usuario, Contrato])],
  controllers: [PerfilController, GestaoPermissoesController],
  providers: [
    PoliticaAcessoService,
    GestaoPermissoesService,
    SessaoSuperTokensService,
    { provide: APP_GUARD, useClass: AutorizacaoGuard },
  ],
  exports: [PoliticaAcessoService],
})
export class AutorizacaoModule {}
