import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { AtividadeEntity } from './atividade.entity.js';
import { CreateAtividadeDto } from './dto/create-atividade.dto.js';
import { UpdateAtividadeDto } from './dto/update-atividade.dto.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';

@Injectable()
export class AtividadesService {
  constructor(
    @InjectRepository(AtividadeEntity)
    private readonly atividadeRepository: Repository<AtividadeEntity>,
    @InjectRepository(Entregavel)
    private readonly entregavelRepository: Repository<Entregavel>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateAtividadeDto, usuarioLogado: any) {
    if (!dto.entregavelIds || !Array.isArray(dto.entregavelIds) || dto.entregavelIds.length !== 2) {
      throw new BadRequestException('A atividade deve estar vinculada a exatamente dois entregáveis antes da HU09.');
    }

    const entregaveisValidos = await this.entregavelRepository.find({
      where: {
        id: In(dto.entregavelIds),
        contratoId: dto.contratoId,
      },
    });

    if (entregaveisValidos.length !== 2) {
      throw new BadRequestException('Um ou mais entregáveis selecionados não existem ou não pertencem ao mesmo contrato.');
    }

    const novaAtividade = this.atividadeRepository.create({
      contratoId: dto.contratoId,
      titulo: dto.titulo,
      dataHora: new Date(dto.dataHora),
      descricao: dto.descricao,
      tipo: dto.tipo,
      responsavel: dto.responsavel,
      participantes: dto.participantes || [],
      local: dto.local,
      duracao: dto.duracao,
      observacoes: dto.observacoes,
      entregaveis: entregaveisValidos,
    });

    return await this.atividadeRepository.save(novaAtividade);
  }

  async findAllPaginated(contratoId: string, page = 1, limit = 10, dataInicio?: string, dataFim?: string) {
    if (!contratoId) {
      throw new BadRequestException('O parâmetro contratoId é obrigatório para consultar as atividades.');
    }

    const skip = (page - 1) * limit;
    
    const query = this.atividadeRepository.createQueryBuilder('atividade')
      .leftJoinAndSelect('atividade.entregaveis', 'entregaveis')
      .where('atividade.contratoId = :contratoId', { contratoId });

    if (dataInicio && dataFim) {
      const inicio = new Date(dataInicio);
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);

      query.andWhere('atividade.dataHora BETWEEN :inicio AND :fim', {
        inicio,
        fim,
      });
    }

    query.orderBy('atividade.dataHora', 'DESC')
      .skip(skip)
      .take(limit);

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const atividade = await this.atividadeRepository.findOne({ 
      where: { id },
      relations: { entregaveis: true },
    });

    if (!atividade) {
      throw new NotFoundException(`Atividade com ID ${id} não encontrada.`);
    }

    return atividade;
  }

  async update(id: string, dto: UpdateAtividadeDto, usuarioLogado?: any) {
    const atividade = await this.findOne(id);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (dto.entregavelIds) {
        if (!Array.isArray(dto.entregavelIds) || dto.entregavelIds.length !== 2) {
          throw new BadRequestException('A atividade deve manter a vinculação a dois entregáveis.');
        }

        const entregaveisValidos = await queryRunner.manager.find(Entregavel, {
          where: { 
            id: In(dto.entregavelIds), 
            contratoId: atividade.contratoId 
          },
        });

        if (entregaveisValidos.length !== 2) {
          throw new BadRequestException('Um ou mais entregáveis informados não pertencem a este contrato.');
        }

        atividade.entregaveis = entregaveisValidos;
      }

      const { entregavelIds, ...dadosAtualizacao } = dto as any;

      Object.assign(atividade, {
        ...dadosAtualizacao,
        dataHora: dto.dataHora ? new Date(dto.dataHora) : atividade.dataHora,
      });

      const atividadeAtualizada = await queryRunner.manager.save(atividade);
      await queryRunner.commitTransaction();
      return atividadeAtualizada;

    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: string, usuarioLogado?: any) {
    const atividade = await this.findOne(id);
    return await this.atividadeRepository.remove(atividade);
  }
}