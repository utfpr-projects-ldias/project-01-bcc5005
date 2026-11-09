import { PartialType } from '@nestjs/mapped-types';
import { CreateAtividadeDto } from './create-atividade.dto.js';

export class UpdateAtividadeDto extends PartialType(CreateAtividadeDto) {}
