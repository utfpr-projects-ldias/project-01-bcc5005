import { Controller, Get, Query, Req } from '@nestjs/common';
import { ExigirPolitica } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { HistoricoAdministrativoService } from './historico-administrativo.service.js';

@Controller('admin/historico')
@ExigirPolitica('usuarios:administrar')
export class HistoricoAdministrativoController {
  constructor(private readonly historico: HistoricoAdministrativoService) {}

  @Get()
  consultar(@Req() req: RequisicaoAutorizada, @Query('antes') antes?: string) {
    return this.historico.consultar(req.usuarioDominio!, antes);
  }
}
