import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AtividadesController } from './atividades.controller.js';
import { AtividadesService } from './atividades.service.js';
import { AtividadeEntity } from './atividade.entity.js'; 
import { Entregavel } from '../entregaveis/entregavel.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([AtividadeEntity, Entregavel]),
  ],
  controllers: [AtividadesController],
  providers: [AtividadesService],
  exports: [AtividadesService],
})
export class AtividadesModule {}