import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { Contrato } from '../contratos/contrato.entity.js';
import { ModoCalculo } from '../contratos/modo-calculo.enum.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { ConfiguracaoOcorrencias } from '../ocorrencias/configuracao-ocorrencias.entity.js';
import { calcularPeriodosRecorrentes } from '../ocorrencias/ocorrencias.service.js';
import { avaliarAgendaRecorrente } from '../ocorrencias/avaliar-agenda-recorrente.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { PermissaoContrato } from '../autorizacao/permissao-contrato.entity.js';
import { permissoesEfetivas } from '../autorizacao/permissoes-granulares.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { agregarFisico, arredondar, calcularFisico } from './motor-progresso.js';
import type { AtualizarPesosDto } from './pesos.dto.js';
import type { AtualizarPesoIndividualDto } from './peso-individual.dto.js';
import type { AtualizarExecucaoDto } from './execucao.dto.js';
import type { AtualizarModoCalculoDto } from './modo-calculo.dto.js';
const versaoPesos = (c: Contrato, itens: Entregavel[]) => createHash('sha256').update(JSON.stringify([c.modoCalculo, itens.map(e => [e.id, e.peso]).sort((a,b) => String(a[0]).localeCompare(String(b[0])))] )).digest('hex');
const numero = (v: string | null | undefined) => v == null ? null : Number(v);
const civil = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s; };
const decimal = (valores: string[]) => {
  const soma = valores.reduce((s, v) => { const [i, f = ''] = v.split('.'); return s + BigInt(i) * 1000n + BigInt(f.padEnd(3, '0')); }, 0n);
  return `${soma / 1000n}.${String(soma % 1000n).padStart(3, '0')}`;
};
@Injectable()
export class ExecucaoService {
  constructor(private readonly ds: DataSource, private readonly auditoria: AuditoriaService) {}

  async consultar(contratoId: string) {
    // Snapshot consistente: nenhuma mistura de planejamento e execução de transações diferentes.
    return this.ds.transaction('REPEATABLE READ', m => this.resumo(m, contratoId));
  }
  private async resumo(m: EntityManager, contratoId: string) {
    const contrato = await m.findOneBy(Contrato, { id: contratoId });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    const etapas = await m.findBy(Etapa, { contratoId, arquivadoEm: IsNull() });
    const ativos = (await m.findBy(Entregavel, { contratoId, arquivadoEm: IsNull() })).filter(e => etapas.some(et => et.id === e.etapaId));
    const agenda = await m.findBy(Ocorrencia, { contratoId, substituidaEm: IsNull() });
    const configuracoes = await m.findBy(ConfiguracaoOcorrencias, { contratoId });
    const entregaveis = ativos.map(e => {
      const ocorrencias = agenda.filter(o => o.entregavelId === e.id);
      let previsto: string | null = e.quantidadePrevista;
      let realizado: string | null = e.tipo === 'QUANTITATIVO' ? '0' : e.quantidadeRealizada;
      let fonte = 'DECLARADO';
      let periodos: number | null = null;
      // Registros descritivos não têm medida física: não substituem a quantidade
      // declarada nem transformam a situação documental em avanço de unidades.
      const ocorrenciasMedidas = ocorrencias.filter(o => o.origem === 'MANUAL_QUANTITATIVA' && o.modoRegistro !== 'DESCRITIVO');
      if (e.tipo === 'QUANTITATIVO' && ocorrenciasMedidas.length) {
        // Ocorrências medidas detalham a mesma realização, nunca somar o total declarado novamente.
        const quantidades = ocorrenciasMedidas.filter(o => o.status === 'CONCLUIDO').flatMap(o => (o.quantidadeAprovada ?? o.quantidadeRealizada) == null ? [] : [o.quantidadeAprovada ?? o.quantidadeRealizada!]);
        realizado = quantidades.length ? decimal(quantidades) : null;
        fonte = e.quantidadeRealizada != null && Number(e.quantidadeRealizada) !== 0 ? 'CONFLITO_QUANTIDADE' : 'OCORRENCIAS';
        if (fonte === 'CONFLITO_QUANTIDADE') realizado = null;
      }
      if (e.tipo === 'RECORRENTE') {
        fonte = 'AGENDA';
        const configuracao = configuracoes.find(cfg => cfg.entregavelId === e.id);
        // O entregável mantém os limites contratuais; a configuração de agenda
        // controla a grade corrente. Aprovados históricos não são reescritos.
        const inicio = e.agendaInicioFuturo ?? e.inicioPrevisto;
        const fim = e.agendaInicioFuturo ? (configuracao?.terminoPrevisto ?? e.terminoPrevisto) : e.terminoPrevisto;
        if (inicio && fim && e.periodicidade && ocorrencias.length) {
          try {
            const grade = calcularPeriodosRecorrentes(inicio, fim, e.periodicidade);
            const gradeAvaliada = avaliarAgendaRecorrente(ocorrencias, grade, inicio);
            if (gradeAvaliada.completa) {
              periodos = gradeAvaliada.total;
              realizado = String(gradeAvaliada.concluidas);
            } else realizado = null;
          } catch { /* Sem períodos completos, não publicar percentual aproximado. */ }
        }
        previsto = periodos == null ? null : String(periodos);
      }
      const percentual = (e.tipo === 'UNICO' && e.percentualExecucao == null && ['CONCLUIDO','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? '')) ? null : calcularFisico({ tipo: e.tipo, percentualManual: numero(e.percentualExecucao), quantidadePrevista: numero(previsto), quantidadeRealizada: numero(realizado), ocorrenciasPrevistas: periodos, ocorrenciasConcluidas: numero(realizado), dataEfetivaMarco: e.tipo === 'MARCO' && ocorrencias.length === 1 && ocorrencias[0]?.status === 'CONCLUIDO' ? e.dataEfetivaMarco : null });
      const etapa = etapas.find(et => et.id === e.etapaId);
      return { entregavelId: e.id, nome: e.nome, tipo: e.tipo, statusEntregavel: e.statusExecucao, realizado, previsto, fonte,
        percentualExecucao: percentual == null ? null : arredondar(percentual), pesoOperacional: e.peso,
        dataEfetivaMarco: e.dataEfetivaMarco ?? null, inicioPrevisto: e.inicioPrevisto, terminoPrevisto: e.terminoPrevisto,
        situacaoAdministrativa: e.statusExecucao === 'FINALIZADO' ? 'FINALIZADO' : e.statusExecucao,
        statusFisico: percentual == null ? 'NAO_AVALIADO' : percentual === 100 ? 'CONCLUIDO' : percentual > 0 ? 'EM_ANDAMENTO' : 'NAO_INICIADO',
        editavel: !contrato.arquivadoEm && ['PLANEJAMENTO','EM_EXECUCAO'].includes(contrato.status) && etapa?.status !== 'ENCERRADA' && etapa?.status !== 'CONCLUIDA' && etapa?.status !== 'FINALIZADA' && !['CONCLUIDO','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? ''),
        comprovacao: 'NAO_AVALIADA' as const, percentualBruto: percentual };
    });
    const agregado = agregarFisico(entregaveis.map(e => ({ percentual: e.percentualBruto, peso: e.pesoOperacional })));
    return { contratoId, statusContrato: contrato.status, modoCalculo: contrato.modoCalculo, versaoPesos: versaoPesos(contrato, ativos), ...agregado,
      avanco: contrato.modoCalculo === 'PONDERADO' ? agregado.avancoPonderado : agregado.avancoSimples,
      editavelPesos: !contrato.arquivadoEm && ['PLANEJAMENTO','EM_EXECUCAO'].includes(contrato.status),
      configuracaoPendente: contrato.modoCalculo === 'PONDERADO' && !agregado.pesosValidos,
      entregaveis: entregaveis.map(({ percentualBruto: _, ...e }) => e) };
  }
  async atualizarModoCalculo(contratoId: string, dto: AtualizarModoCalculoDto, ator: UsuarioAutenticado) {
    return this.ds.transaction(async m => {
      const contrato = await m.findOne(Contrato, { where: { id: contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!contrato || contrato.arquivadoEm || !['PLANEJAMENTO', 'EM_EXECUCAO'].includes(contrato.status)) {
        throw new ConflictException('O contrato não permite alteração do modo de cálculo.');
      }
      // A mesma permissão necessária para definir os pesos governa a troca do modo.
      if (ator.perfil !== 'ADMINISTRADOR') {
        const vinculo = await m.findOneBy(PermissaoContrato, { contratoId, usuarioId: ator.id });
        const permissoes = permissoesEfetivas(ator.perfil, Boolean(vinculo?.podeEditar), vinculo?.permissoesDetalhadas);
        if (!vinculo || !permissoes.configurarPesos) {
          throw new ForbiddenException('Sem permissão para alterar o cálculo físico.');
        }
      }
      const etapas = await m.findBy(Etapa, { contratoId, arquivadoEm: IsNull() });
      const ativos = (await m.findBy(Entregavel, { contratoId, arquivadoEm: IsNull() }))
        .filter(e => etapas.some(et => et.id === e.etapaId));
      if (versaoPesos(contrato, ativos) !== dto.versao) {
        throw new ConflictException('O modo de cálculo ou os pesos foram alterados. Atualize a página.');
      }
      if (dto.modoCalculo === ModoCalculo.PONDERADO &&
        !agregarFisico(ativos.map(e => ({ percentual: 0, peso: e.peso }))).pesosValidos) {
        throw new BadRequestException('Configure pesos totalizando exatamente 100% antes de ativar o cálculo ponderado.');
      }
      if (contrato.modoCalculo !== dto.modoCalculo) {
        const anterior = contrato.modoCalculo;
        contrato.modoCalculo = dto.modoCalculo;
        await m.save(Contrato, contrato);
        await this.auditoria.registrarNaTransacao(m, ator, {
          acao: AcaoAuditoria.CONTRATO_EDITADO, entidadeTipo: 'CONTRATO', entidadeId: contrato.id,
          dadosAnteriores: { modoCalculo: anterior },
          dadosPosteriores: { modoCalculo: dto.modoCalculo },
        });
      }
      // Retém os pesos ao retornar ao modo simples, sem alterar o fechamento documental.
      return this.resumo(m, contratoId);
    });
  }

  /** Persiste um peso por vez, com concorrência otimista e auditoria.
   *  O modo ponderado jamais fica com soma diferente de 100%.
   *  Durante a configuração parcial, o contrato permanece em média simples.
   */
  async atualizarPesoIndividual(contratoId: string, entregavelId: string, dto: AtualizarPesoIndividualDto, ator: UsuarioAutenticado) {
    return this.ds.transaction(async m => {
      const contrato = await m.findOne(Contrato, { where: { id: contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!contrato || contrato.arquivadoEm || !['PLANEJAMENTO', 'EM_EXECUCAO'].includes(contrato.status))
        throw new ConflictException('Contrato indisponível para configurar pesos.');
      if (ator.perfil !== 'ADMINISTRADOR') {
        const vinculo = await m.findOneBy(PermissaoContrato, { contratoId, usuarioId: ator.id });
        if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).configurarPesos)
          throw new ForbiddenException('Sem permissão para configurar pesos.');
      }
      const etapas = await m.findBy(Etapa, { contratoId, arquivadoEm: IsNull() });
      const idsEtapas = new Set(etapas.map(e => e.id));
      const ativos = (await m.findBy(Entregavel, { contratoId, arquivadoEm: IsNull() })).filter(e => idsEtapas.has(e.etapaId));
      const alvo = ativos.find(e => e.id === entregavelId);
      if (!alvo) throw new NotFoundException('Entregável ativo não encontrado.');
      if (versaoPesos(contrato, ativos) !== dto.versao)
        throw new ConflictException('Os pesos foram alterados por outra operação. Atualize os dados.');
      if (!/^(?:100(?:\.0{1,4})?|\d{1,2}(?:\.\d{1,4})?)$/.test(dto.peso))
        throw new BadRequestException('Peso deve estar entre 0% e 100%, com até quatro casas decimais.');
      const anteriores = alvo.peso;
      // Configuração incremental: uma redistribuição pode deixar a soma parcial.
      // Não manter um cálculo ponderado inválido, nem descartar os pesos existentes.
      const somaValidaDepois = agregarFisico(ativos.map(e => ({
        percentual: 0, peso: e.id === entregavelId ? dto.peso : e.peso,
      }))).pesosValidos;
      if (contrato.modoCalculo === ModoCalculo.PONDERADO && !somaValidaDepois) {
        contrato.modoCalculo = ModoCalculo.SIMPLES;
        await m.save(Contrato, contrato);
        await this.auditoria.registrarNaTransacao(m, ator, {
          acao: AcaoAuditoria.CONTRATO_EDITADO, entidadeTipo: 'CONTRATO', entidadeId: contrato.id,
          dadosAnteriores: { modoCalculo: ModoCalculo.PONDERADO },
          dadosPosteriores: { modoCalculo: ModoCalculo.SIMPLES, motivo: 'Redistribuição de pesos incompleta' },
        });
      }
      if (anteriores !== dto.peso) {
        alvo.peso = dto.peso;
        await m.save(Entregavel, alvo);
        await this.auditoria.registrarNaTransacao(m, ator, {
          acao: AcaoAuditoria.ENTREGAVEL_PESO_ALTERADO, entidadeTipo: 'ENTREGAVEL', entidadeId: alvo.id,
          dadosAnteriores: { peso: anteriores }, dadosPosteriores: { peso: dto.peso },
        });
      }
      return this.resumo(m, contratoId);
    });
  }

  async atualizarPesos(contratoId: string, dto: AtualizarPesosDto, ator: UsuarioAutenticado) {
    return this.ds.transaction(async m => {
      const c = await m.findOne(Contrato, { where: { id: contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!c || c.arquivadoEm || !['PLANEJAMENTO','EM_EXECUCAO'].includes(c.status)) throw new ConflictException('Contrato bloqueado');
      if (ator.perfil !== 'ADMINISTRADOR') {
        const v = await m.findOneBy(PermissaoContrato, { contratoId, usuarioId: ator.id });
        const p = permissoesEfetivas(ator.perfil, Boolean(v?.podeEditar), v?.permissoesDetalhadas);
        if (!v || !p.configurarPesos) throw new ForbiddenException('Sem permissão para ativar pesos');
      }
      const etapas = await m.findBy(Etapa, { contratoId, arquivadoEm: IsNull() });
      const ativos = (await m.findBy(Entregavel, { contratoId, arquivadoEm: IsNull() })).filter(e => etapas.some(et=>et.id===e.etapaId));
      if (versaoPesos(c, ativos) !== dto.versao) throw new ConflictException('Pesos ou planejamento foram alterados. Atualize antes de salvar.');
      const pesos = new Map(dto.pesos.map(p=>[p.entregavelId,p.peso]));
      if (pesos.size !== dto.pesos.length || pesos.size !== ativos.length || ativos.some(e=>!pesos.has(e.id))) throw new BadRequestException('Informe o peso de cada entregável ativo do contrato');
      if (!agregarFisico(ativos.map(e=>({ percentual:0,peso:pesos.get(e.id)! }))).pesosValidos) throw new BadRequestException('Soma dos pesos deve ser exatamente 100%');
      for (const e of ativos) {
        const anterior = e.peso; const novo = pesos.get(e.id)!;
        if (anterior != null && Number(anterior) === Number(novo)) continue;
        e.peso=novo; await m.save(Entregavel,e);
        await this.auditoria.registrarNaTransacao(m,ator,{ acao:AcaoAuditoria.ENTREGAVEL_PESO_ALTERADO, entidadeTipo:'ENTREGAVEL', entidadeId:e.id, dadosAnteriores:{ peso:anterior }, dadosPosteriores:{ peso:novo } });
      }
      const anterior = c.modoCalculo;
      c.modoCalculo = 'PONDERADO' as Contrato['modoCalculo']; await m.save(Contrato,c);
      await this.auditoria.registrarNaTransacao(m,ator,{ acao:AcaoAuditoria.CONTRATO_EDITADO, entidadeTipo:'CONTRATO', entidadeId:c.id, dadosAnteriores:{ modoCalculo:anterior }, dadosPosteriores:{ modoCalculo:c.modoCalculo, somaPesos:100 } });
      return this.resumo(m,contratoId);
    });
  }
  /** Conciliação auditada: torna a agenda quantitativa a única fonte operacional de avanço.
   * Preserva a quantidade anterior no evento de auditoria e rejeita concorrência/itens bloqueados.
   */
  async usarOcorrencias(contratoId: string, id: string, ator: UsuarioAutenticado) {
    return this.ds.transaction(async m => {
      const contrato = await m.findOne(Contrato, { where: { id: contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!contrato || contrato.arquivadoEm || !['PLANEJAMENTO', 'EM_EXECUCAO'].includes(contrato.status))
        throw new ConflictException('Contrato indisponível para conciliação de execução');
      if (ator.perfil !== 'ADMINISTRADOR') {
        const vinculo = await m.findOneBy(PermissaoContrato, { contratoId, usuarioId: ator.id });
        if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).editarExecucaoFisica)
          throw new ForbiddenException('Sem permissão para conciliar a execução');
      }
      const entregavel = await m.findOne(Entregavel, { where: { id, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!entregavel || entregavel.arquivadoEm || entregavel.tipo !== 'QUANTITATIVO')
        throw new NotFoundException('Entregável quantitativo não encontrado');
      const etapa = await m.findOneBy(Etapa, { id: entregavel.etapaId, contratoId });
      if (!etapa || etapa.arquivadoEm || ['CONCLUIDA', 'ENCERRADA'].includes(etapa.status) || ['CONCLUIDO','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(entregavel.statusExecucao ?? ''))
        throw new ConflictException('Reabra a etapa e o entregável antes da conciliação');
      const registros = await m.countBy(Ocorrencia, { contratoId, entregavelId: id, substituidaEm: IsNull() });
      if (registros > 0) throw new ConflictException('Já existem ocorrências. Não é seguro alterar a fonte de execução automaticamente');
      const valorAnterior = entregavel.quantidadeRealizada;
      if (valorAnterior === null || Number(valorAnterior) === 0)
        throw new ConflictException('Não há quantidade declarada diretamente para conciliar');
      entregavel.quantidadeRealizada = null;
      await m.save(Entregavel, entregavel);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ENTREGAVEL_EXECUCAO_ATUALIZADA, entidadeTipo: 'ENTREGAVEL', entidadeId: entregavel.id,
        dadosAnteriores: { quantidadeRealizada: valorAnterior, fonte: 'DECLARADO' },
        dadosPosteriores: { quantidadeRealizada: null, fonte: 'OCORRENCIAS', motivo: 'conciliação explícita' },
      });
      return this.resumo(m, contratoId);
    });
  }

  async atualizar(contratoId: string, id: string, dto: AtualizarExecucaoDto, ator: UsuarioAutenticado) {
    return this.ds.transaction(async m => {
      const contrato = await m.findOne(Contrato, { where: { id: contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!contrato || contrato.arquivadoEm || !['PLANEJAMENTO','EM_EXECUCAO'].includes(contrato.status)) throw new ConflictException('Contrato indisponível para execução');
      if (ator.perfil !== 'ADMINISTRADOR') {
        const v = await m.findOneBy(PermissaoContrato, { contratoId, usuarioId: ator.id });
        if (!v || !permissoesEfetivas(ator.perfil, v.podeEditar, v.permissoesDetalhadas).editarExecucaoFisica) throw new ForbiddenException('Sem permissão de execução');
      }
      const e = await m.findOne(Entregavel, { where: { id, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!e || e.arquivadoEm) throw new NotFoundException('Entregável indisponível');
      const etapa = await m.findOneBy(Etapa, { id: e.etapaId, contratoId });
      if (!etapa || etapa.arquivadoEm || ['ENCERRADA','CONCLUIDA','FINALIZADA'].includes(etapa.status) || ['CONCLUIDO','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? '')) throw new ConflictException('Etapa indisponível para execução');
      const antes = { percentualExecucao: e.percentualExecucao, quantidadeRealizada: e.quantidadeRealizada, dataEfetivaMarco: e.dataEfetivaMarco };
      if (Object.values(dto).filter(v => v !== undefined).length !== 1) throw new BadRequestException('Informe somente o campo físico do tipo de entregável');
      if ((e.tipo === 'UNICO' || e.tipo === 'CONTINUO') && typeof dto.percentualManual === 'number' && Number.isFinite(dto.percentualManual) && dto.percentualManual >= 0 && dto.percentualManual <= 100) e.percentualExecucao = dto.percentualManual.toFixed(2);
      else if (e.tipo === 'QUANTITATIVO' && dto.quantidadeRealizada !== undefined) {
        throw new ConflictException('A execução quantitativa deve ser registrada e aprovada em ocorrências.');
      } else if (e.tipo === 'MARCO' && typeof dto.dataEfetivaMarco === 'string' && civil(dto.dataEfetivaMarco)) e.dataEfetivaMarco = dto.dataEfetivaMarco;
      else throw new BadRequestException('Campo de execução incompatível ou inválido');
      await m.save(Entregavel, e);
      await this.auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.ENTREGAVEL_EXECUCAO_ATUALIZADA, entidadeTipo: 'ENTREGAVEL', entidadeId: e.id, dadosAnteriores: antes,
        dadosPosteriores: { percentualExecucao: e.percentualExecucao, quantidadeRealizada: e.quantidadeRealizada, dataEfetivaMarco: e.dataEfetivaMarco } });
      // Não alterar statusExecucao legado nem situacaoComprovacao: o fechamento documental usa ambos em fluxos existentes.
      return this.resumo(m, contratoId);
    });
  }
}
