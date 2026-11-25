import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UsePipes, ValidationPipe } from '@nestjs/common';
import { ExigirPoliticaOperacional } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { LancamentosService } from './lancamentos.service.js';
import { CriarLancamentoDto, CorrigirLancamentoDto, DecidirLancamentoDto } from './lancamentos.dto.js';
@Controller('contratos/:contratoId/entregaveis/:entregavelId/lancamentos')
@UsePipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}))
export class LancamentosController {
  constructor(private readonly service:LancamentosService){}
  @Get()
  @ExigirPoliticaOperacional('entregaveis:visualizar',{tipo:'recurso',recurso:'entregavel',parametro:'entregavelId',parametroContratoPai:'contratoId'})
  consultar(@Param('contratoId') c:string,@Param('entregavelId') e:string){return this.service.consultar(c,e);}
  @Post()
  @ExigirPoliticaOperacional('execucao:atualizar',{tipo:'recurso',recurso:'entregavel',parametro:'entregavelId',parametroContratoPai:'contratoId'})
  criar(@Param('contratoId') c:string,@Param('entregavelId') e:string,@Body() dto:CriarLancamentoDto,@Req() req:RequisicaoAutorizada){return this.service.criar(c,e,dto,req.usuarioDominio!);}
  @Patch(':id')
  @ExigirPoliticaOperacional('execucao:atualizar',{tipo:'recurso',recurso:'entregavel',parametro:'entregavelId',parametroContratoPai:'contratoId'})
  editar(@Param('contratoId') c:string,@Param('entregavelId') e:string,@Param('id',ParseUUIDPipe) id:string,@Body() dto:CorrigirLancamentoDto,@Req() req:RequisicaoAutorizada){return this.service.editar(c,e,id,dto,req.usuarioDominio!);}
  @Post(':id/decidir')
  @ExigirPoliticaOperacional('execucao:decidir-lancamento',{tipo:'recurso',recurso:'entregavel',parametro:'entregavelId',parametroContratoPai:'contratoId'})
  decidir(@Param('contratoId') c:string,@Param('entregavelId') e:string,@Param('id',ParseUUIDPipe) id:string,@Body() dto:DecidirLancamentoDto,@Req() req:RequisicaoAutorizada){return this.service.decidir(c,e,id,dto,req.usuarioDominio!);}
}
