import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { FiltroPersistencia } from './database/filtro-persistencia.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { opcoesBanco } from './database/opcoes-banco.js';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthCheckController } from './auth/auth-check.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import { AutorizacaoModule } from './autorizacao/autorizacao.module.js';
import { AuditoriaModule } from './auditoria/auditoria.module.js';
import { ContratosModule } from './contratos/contratos.module.js';
import { EtapasModule } from './etapas/etapas.module.js';
import { EntregaveisModule } from './entregaveis/entregaveis.module.js';
import { DocumentosModule } from './documentos/documentos.module.js';
import { AtividadesModule } from './atividades/atividades.module.js';
import { ExecucaoModule } from './execucao/execucao.module.js';
import { OcorrenciasModule } from './ocorrencias/ocorrencias.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { MetasMarcoModule } from './metas-marco/metas-marco.module.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      ...opcoesBanco(),
      autoLoadEntities: true,
    }),
    AuthModule,
    UsuariosModule,
    AutorizacaoModule,
    AuditoriaModule,
    ContratosModule,
    EtapasModule,
    EntregaveisModule,
    OcorrenciasModule,
    MetasMarcoModule,
    ExecucaoModule,
    DocumentosModule,
    AtividadesModule,
    DashboardModule,
  ],
  controllers: [
    AppController,
    AuthCheckController,
  ],
  providers: [AppService, { provide: APP_FILTER, useClass: FiltroPersistencia }],
})
export class AppModule {}
