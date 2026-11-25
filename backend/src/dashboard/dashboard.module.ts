import { Module } from '@nestjs/common';
import { ContratosModule } from '../contratos/contratos.module.js';
import { ExecucaoModule } from '../execucao/execucao.module.js';
import { EntregaveisModule } from '../entregaveis/entregaveis.module.js';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
@Module({imports:[ContratosModule,ExecucaoModule,EntregaveisModule,AutorizacaoModule],controllers:[DashboardController],providers:[DashboardService]})
export class DashboardModule {}
