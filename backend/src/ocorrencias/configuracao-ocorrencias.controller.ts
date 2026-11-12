import { Body, Controller, Get, Param, Put, Req, UsePipes, ValidationPipe } from '@nestjs/common';
import { ExigirPoliticaOperacional } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { ConfiguracaoOcorrenciasService } from './configuracao-ocorrencias.service.js';
import { ConfigurarOcorrenciasDto } from './dto/configurar-ocorrencias.dto.js';

@Controller('contratos/:contratoId/entregaveis/:entregavelId/ocorrencias/configuracao')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class ConfiguracaoOcorrenciasController {
  constructor(private readonly configuracoes: ConfiguracaoOcorrenciasService) {}

  @Get()
  @ExigirPoliticaOperacional('entregaveis:visualizar', { tipo: 'recurso', recurso: 'entregavel', parametro: 'entregavelId', parametroContratoPai: 'contratoId' })
  consultar(@Param('contratoId') contratoId: string, @Param('entregavelId') id: string) {
    return this.configuracoes.consultar(contratoId, id);
  }

  @Put()
  @ExigirPoliticaOperacional('entregaveis:editar', { tipo: 'recurso', recurso: 'entregavel', parametro: 'entregavelId', parametroContratoPai: 'contratoId' })
  atualizar(@Param('contratoId') contratoId: string, @Param('entregavelId') id: string, @Body() dto: ConfigurarOcorrenciasDto, @Req() req: RequisicaoAutorizada) {
    return this.configuracoes.atualizar(contratoId, id, dto, req.usuarioDominio!);
  }
}
