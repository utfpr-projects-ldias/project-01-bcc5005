import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  Query, 
  Req, 
  UseGuards
} from '@nestjs/common';
import { AtividadesService } from './atividades.service.js';
import { CreateAtividadeDto } from './dto/create-atividade.dto.js';
import { UpdateAtividadeDto } from './dto/update-atividade.dto.js';
import { AutorizacaoGuard } from '../autorizacao/autorizacao.guard.js';

@Controller('atividades')
@UseGuards(AutorizacaoGuard) 
export class AtividadesController {
  constructor(private readonly atividadesService: AtividadesService) {}

  @Post()
  async create(@Body() createAtividadeDto: CreateAtividadeDto, @Req() req: any) {
    const usuarioLogado = req.user || {}; 
    return this.atividadesService.create(createAtividadeDto, usuarioLogado);
  }

  @Get()
  async findAll(
    @Query('contratoId') contratoId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    
    return this.atividadesService.findAllPaginated(
      contratoId, 
      pageNumber, 
      limitNumber, 
      dataInicio, 
      dataFim
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.atividadesService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string, 
    @Body() updateAtividadeDto: UpdateAtividadeDto,
    @Req() req: any 
  ) {
    const usuarioLogado = req.user || {};
    return this.atividadesService.update(id, updateAtividadeDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.atividadesService.remove(id);
  }
}