import { Body, Controller, Get, Param, Post, Req, UsePipes, ValidationPipe } from '@nestjs/common';
import { ExigirPolitica } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { AtividadeCompartilhadaService } from './atividade-compartilhada.service.js';
import { AprovarCompartilhadaDto, CriarAtividadeCompartilhadaDto } from './dto/atividade-compartilhada.dto.js';

/** A política global identifica o usuário. O serviço valida CADA contrato persistido,
 * sem utilizar um contratoId do body como autorização do grupo. */
@Controller('atividades-compartilhadas')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class AtividadeCompartilhadaController {
  constructor(private readonly service: AtividadeCompartilhadaService) {}

  @Post()
  @ExigirPolitica('contratos:listar')
  criar(@Body() dto: CriarAtividadeCompartilhadaDto, @Req() req: RequisicaoAutorizada) {
    return this.service.criar(dto, req.usuarioDominio!);
  }

  @Get(':id')
  @ExigirPolitica('contratos:listar')
  detalhar(@Param('id') id: string, @Req() req: RequisicaoAutorizada) {
    return this.service.resumo(id, req.usuarioDominio!);
  }

  @Post(':id/solicitar')
  @ExigirPolitica('contratos:listar')
  solicitar(@Param('id') id: string, @Body() dto: AprovarCompartilhadaDto,
    @Req() req: RequisicaoAutorizada) {
    return this.service.solicitar(id, dto, req.usuarioDominio!);
  }

  @Post(':id/aprovar')
  @ExigirPolitica('contratos:listar')
  aprovar(@Param('id') id: string, @Body() dto: AprovarCompartilhadaDto,
    @Req() req: RequisicaoAutorizada) {
    return this.service.aprovar(id, dto, req.usuarioDominio!);
  }
}
