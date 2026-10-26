import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthCheckController } from './auth/auth-check.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import { AutorizacaoModule } from './autorizacao/autorizacao.module.js';
import { AuditoriaModule } from './auditoria/auditoria.module.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: false,
    }),
    AuthModule,
    UsuariosModule,
    AutorizacaoModule,
    AuditoriaModule,
  ],
  controllers: [
    AppController,
    AuthCheckController,
  ],
  providers: [AppService],
})
export class AppModule {}
