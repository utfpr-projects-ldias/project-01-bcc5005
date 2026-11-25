import { BadRequestException, Controller, Get, Header, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { ExigirPolitica } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { DashboardService, FILTROS } from './dashboard.service.js';

function inteiro(v:unknown,padrao:number,max:number):number {
  if(v===undefined)return padrao;
  if(typeof v!=='string'||!/^\d+$/.test(v)||Number(v)<1||Number(v)>max)throw new BadRequestException('Parâmetro de dashboard inválido.');
  return Number(v);
}
@Controller('dashboard/v1')
export class DashboardController {
  constructor(private readonly dashboard:DashboardService){}
  @Get()
  @Header('Cache-Control','private, no-store')
  @ExigirPolitica('contratos:listar')
  carteira(@Req() req:RequisicaoAutorizada,@Query('busca') busca:unknown,@Query('filtro') filtro:unknown,@Query('pagina') pagina:unknown,@Query('dias') dias:unknown){
    if(busca!==undefined&&(typeof busca!=='string'||busca.length>120))throw new BadRequestException('Busca inválida.');
    if(filtro!==undefined&&!FILTROS.some(f=>f===filtro))throw new BadRequestException('Filtro inválido.');
    return this.dashboard.carteira(req.usuarioDominio!,{busca:typeof busca==='string'?busca:'',filtro:typeof filtro==='string'?filtro:'todos',pagina:inteiro(pagina,1,1000000),limiteDias:inteiro(dias,30,90)});
  }
  @Get('contratos/:id')
  @Header('Cache-Control','private, no-store')
  @ExigirPolitica('contratos:visualizar','id')
  detalhe(@Req() req:RequisicaoAutorizada,@Param('id',ParseUUIDPipe) id:string,@Query('dias') dias:unknown){return this.dashboard.detalhe(req.usuarioDominio!,id,inteiro(dias,30,90));}
}
