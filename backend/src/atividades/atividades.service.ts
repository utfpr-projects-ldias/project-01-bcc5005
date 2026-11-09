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
    const entregaveisValidos = await this.entregavelRepository.find({
      where: {
        id: In(dto.entregavelIds),
        contratoId: dto.contratoId,
      },
    });

    if (entregaveisValidos.length !== dto.entregavelIds.length) {
      throw new BadRequestException('Um ou mais entregáveis não pertencem a este contrato ou não existem.');
    }

    const novaAtividade = this.atividadeRepository.create({
      contratoId: dto.contratoId,
      titulo: dto.titulo,
      dataHora: new Date(dto.dataHora),
      descricao: dto.descricao,
      tipo: dto.tipo,
      responsavel: dto.responsavel,
      participantes: dto.participantes,
      local: dto.local,
      duracao: dto.duracao,
      observacoes: dto.observacoes,
      entregaveis: entregaveisValidos,
    });

    return await this.atividadeRepository.save(novaAtividade);
  }

  async findAllPaginated(contratoId: string, page = 1, limit = 10, dataInicio?: string, dataFim?: string) {
    const skip = (page - 1) * limit;
    
    const query = this.atividadeRepository.createQueryBuilder('atividade')
      .leftJoinAndSelect('atividade.entregaveis', 'entregaveis')
      .where('atividade.contratoId = :contratoId', { contratoId });

    if (dataInicio && dataFim) {
      query.andWhere('atividade.dataHora BETWEEN :dataInicio AND :dataFim', {
        dataInicio: new Date(dataInicio),
        dataFim: new Date(dataFim),
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

  async update(id: string, dto: UpdateAtividadeDto) {
    const atividade = await this.findOne(id);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (dto.entregavelIds) {
        const entregaveisValidos = await queryRunner.manager.find(Entregavel, {
          where: { 
            id: In(dto.entregavelIds), 
            contratoId: atividade.contratoId 
          },
        });

        if (entregaveisValidos.length !== dto.entregavelIds.length) {
          throw new BadRequestException('Um ou mais entregáveis informados não pertencem a este contrato.');
        }

        atividade.entregaveis = entregaveisValidos;
      }

      Object.assign(atividade, {
        ...dto,
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

  async remove(id: string) {
    const atividade = await this.findOne(id);
    return await this.atividadeRepository.remove(atividade);
  }
}