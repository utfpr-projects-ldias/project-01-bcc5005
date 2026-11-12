import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { Contrato } from '../contratos/contrato.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import type { EscopoOperacional } from './politica.decorator.js';
import { uuidValido, type RecursoOperacional } from './politicas-operacionais.js';

/**
 * Adaptador implementado pelo módulo DONO de cada entidade futura.
 * Retornar null se o registro não existir. Nunca aceitar contratoId da requisição
 * como resultado: ele precisa ser derivado do relacionamento persistido no banco.
 * Relações N:N exigem validação de todos os vínculos relevantes no módulo dono.
 */
export type AdaptadorEscopoContrato = (id: string) => Promise<string | null>;

/**
 * Segurança no guard: o contrato raiz vem da entidade real, nunca do body/query.
 * Implementamos Etapa (já persistida). Recursos ainda sem tabela permanecem negados
 * até o módulo dono registrar seu adaptador durante a inicialização Nest.
 */
@Injectable()
export class ResolverEscopoContratoService {
  private readonly adaptadores = new Map<RecursoOperacional, AdaptadorEscopoContrato>();

  constructor(
    @InjectRepository(Contrato) private readonly contratos: Repository<Contrato>,
    @InjectRepository(Etapa) private readonly etapas: Repository<Etapa>,
  ) {
    this.adaptadores.set('etapa', async (id) => {
      const etapa = await this.etapas.findOneBy({ id });
      return etapa?.contratoId ?? null;
    });
  }

  /**
   * O módulo proprietário chama no onModuleInit, injetando este serviço exportado.
   * Não importar serviços de HU07/TEC08 para dentro da autorização (sem circularidade).
   * Não substituir silenciosamente o adaptador de outro módulo.
   */
  registrarAdaptador(recurso: RecursoOperacional, adaptador: AdaptadorEscopoContrato): void {
    if (this.adaptadores.has(recurso)) throw new Error(`Adaptador já registrado: ${recurso}`);
    this.adaptadores.set(recurso, adaptador);
  }

  async resolver(escopo: EscopoOperacional, params: Record<string, unknown>): Promise<string | null> {
    if (escopo.tipo === 'contrato') {
      const id = params[escopo.parametro];
      if (!uuidValido(id)) return null;
      const contrato = await this.contratos.findOneBy({ id });
      return contrato?.id ?? null;
    }

    const recursoId = params[escopo.parametro];
    if (!uuidValido(recursoId)) return null;
    const adaptador = this.adaptadores.get(escopo.recurso);
    if (!adaptador) return null; // fail-closed até existir entidade/adaptador real

    const contratoRaiz = await adaptador(recursoId);
    if (!uuidValido(contratoRaiz)) return null;

    if (escopo.parametroContratoPai) {
      const idPai = params[escopo.parametroContratoPai];
      if (!uuidValido(idPai) || idPai.toLowerCase() !== contratoRaiz.toLowerCase()) return null;
    }
    return contratoRaiz;
  }
}
