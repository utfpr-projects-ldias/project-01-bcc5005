import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuariosModule } from '../usuarios/usuarios.module.js';
import { AutorizacaoGuard } from './autorizacao.guard.js';
import { PerfilController } from './perfil.controller.js';
import { PermissaoContrato } from './permissao-contrato.entity.js';
import { PoliticaAcessoService } from './politica-acesso.service.js';
import { SessaoSuperTokensService } from './sessao-supertokens.service.js';

@Module({
  imports: [UsuariosModule, TypeOrmModule.forFeature([PermissaoContrato])],
  controllers: [PerfilController],
  providers: [
    PoliticaAcessoService,
    SessaoSuperTokensService,
    { provide: APP_GUARD, useClass: AutorizacaoGuard },
  ],
  exports: [PoliticaAcessoService],
})
export class AutorizacaoModule {}
