import {
  BadRequestException, ConflictException, HttpException, Injectable,
  InternalServerErrorException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { PerfilUsuario } from './perfil-usuario.enum.js';
import { Usuario } from './usuario.entity.js';
import { UsuariosService } from './usuarios.service.js';
import { IdentidadesFuncionariosService } from './identidades-funcionarios.service.js';
import type { CriarFuncionarioDto } from './dto/criar-funcionario.dto.js';

@Injectable()
export class AdministracaoUsuariosService {
  private readonly logger = new Logger(AdministracaoUsuariosService.name);

  constructor(
    @InjectRepository(Usuario) private readonly repositorio: Repository<Usuario>,
    private readonly usuarios: UsuariosService,
    private readonly identidades: IdentidadesFuncionariosService,
  ) {}

  async listar() {
    // Primeira versão: até 100 contas, mais recentes primeiro; sem exposição de IDs de autenticação.
    const dados = await this.repositorio.find({ order: { criadoEm: 'DESC' }, take: 100 });
    return dados.map((usuario) => this.publico(usuario));
  }

  async criar(dto: CriarFuncionarioDto) {
    // Apenas o bootstrap cria o Administrador inicial. Esta API cria funcionários.
    if (![PerfilUsuario.GESTOR, PerfilUsuario.COLABORADOR].includes(dto.perfil)) {
      throw new BadRequestException('Somente os perfis GESTOR e COLABORADOR podem ser provisionados');
    }

    const email = dto.email.trim().toLowerCase();
    // Não reconciliar automaticamente contas antigas com email igual; evita apropriação de identidades.
    const jaExiste = await this.repositorio.findOneBy({ email });
    if (jaExiste) throw new ConflictException('E-mail já cadastrado');

    // A API pública de signup do recipe foi desativada, mas a função SDK de servidor permanece.
    const supertokensUserId = await this.identidades.criar(email, dto.senhaInicial);
    try {
      const usuario = await this.usuarios.criarProvisionado({
        supertokensUserId, email, perfil: dto.perfil,
      });
      return this.publico(usuario);
    } catch (error: unknown) {
      // Não há transação ACID entre o Core SuperTokens e o banco do domínio.
      // Compensação: remove somente a identidade recém-criada NESTA tentativa.
      // Em caso de falha de compensação, usuário órfão NÃO recebe autorização no domínio.
      try {
        await this.identidades.excluirCriacaoIncompleta(supertokensUserId);
      } catch {
        this.logger.error('Falha na compensação da identidade recém-criada; exige reconciliação manual');
        throw new InternalServerErrorException('Cadastro incompleto; contate o administrador técnico');
      }
      if (error instanceof HttpException) throw error;
      this.logger.error('Falha ao persistir funcionário no banco da aplicação');
      throw new InternalServerErrorException('Falha ao provisionar funcionário');
    }
  }

  private publico(usuario: Usuario) {
    return {
      id: usuario.id,
      email: usuario.email,
      perfil: usuario.perfil,
      ativo: usuario.ativo,
      criadoEm: usuario.criadoEm,
    };
  }
}
