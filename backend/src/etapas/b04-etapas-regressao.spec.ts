import { jest, describe, it, expect } from '@jest/globals';
import { Usuario } from '../usuarios/usuario.entity.js';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { concluirEntregavelAposAtividade } from '../entregaveis/conclusao-documental.js';
import { StatusEtapa } from './status-etapa.enum.js';
import { estadoEdicaoEtapa } from './estado-edicao-etapa.js';
import { atividadesPendentesDaEtapa } from './decisoes-descendentes-etapa.js';
import { EtapasService } from './etapas.service.js';

const contratoId = '11111111-1111-4111-8111-111111111111';
const ator = { id: '22222222-2222-4222-8222-222222222222', perfil: 'ADMINISTRADOR', supertokensUserId: 'qa-etapa' } as never;
const contrato = { id: contratoId, status: 'EM_EXECUCAO', inicioVigencia: '2026-01-01', terminoVigencia: '2026-12-31' };
const etapa = (id: string, sequencia: number, arquivada = false) => ({
  id, contratoId, nome: id, sequencia, arquivadoEm: arquivada ? new Date('2026-11-01T00:00:00Z') : null,
  status: StatusEtapa.PLANEJADA, reabertoEm: null,
  conclusaoSolicitadaEm: null, encerramentoSolicitadoEm: null,
});

type EtapaMock = Omit<ReturnType<typeof etapa>, 'status' | 'conclusaoSolicitadaEm' | 'encerramentoSolicitadoEm'> & {
  status: StatusEtapa;
  conclusaoSolicitadaEm: Date | null;
  encerramentoSolicitadoEm: Date | null;
};

function contexto(etapas: EtapaMock[]) {
  const guard = { setLock: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getOne: jest.fn(async () => contrato) };
  const repositorio = {
    find: jest.fn(async () => etapas),
    findOneBy: jest.fn(async () => etapas[0] ?? null),
    create: jest.fn((obj: object) => obj),
    save: jest.fn(async (obj: object) => ({ id: 'nova', ...obj })),
    update: jest.fn(async (..._args: unknown[]) => ({ affected: 1 })),
  };
  const usuarioAtual = jest.fn(async () => ({ ativo: true, perfil: 'ADMINISTRADOR', supertokensUserId: 'qa-etapa' }));
  const manager = {
    getRepository: jest.fn((tipo: unknown) => tipo === Contrato ? { createQueryBuilder: () => guard } : tipo === Usuario ? { findOne: usuarioAtual } : repositorio),
    query: jest.fn(async (..._args: unknown[]) => []),
    findOne: jest.fn(async () => etapas[0] ?? null),
    findBy: jest.fn(async () => [] as Entregavel[]),
    findOneBy: jest.fn(async (tipo: unknown) => tipo === Contrato ? contrato : etapas[0] ?? null),
  };
  const audit = { registrarNaTransacao: jest.fn(async (..._args: unknown[]) => undefined) };
  const dataSource = { transaction: jest.fn(async (fn: (m: typeof manager) => Promise<unknown>) => fn(manager)) };
  const service = new EtapasService({} as never, {} as never, dataSource as never, audit as never);
  return { manager, repositorio, audit, service, usuarioAtual };
}

describe('PATCH B04 — sequência e decisões finais da etapa', () => {
  it('insere etapa ativa entre as ativas e as arquivadas, com deslocamento auditado', async () => {
    const { service, repositorio, manager, audit } = contexto([etapa('A', 1), etapa('B', 2, true)]);
    const criada = await service.criar(contratoId, { nome: 'Nova etapa' } as never, ator);
    expect(criada.sequencia).toBe(2);
    expect(repositorio.update).toHaveBeenCalledWith({ id: 'B', contratoId }, { sequencia: 3 });
    expect(manager.query).toHaveBeenCalledWith('SET CONSTRAINTS "uq_etapas_contrato_sequencia" DEFERRED');
    expect(audit.registrarNaTransacao).toHaveBeenCalledWith(manager, ator, expect.objectContaining({
      acao: AcaoAuditoria.ETAPA_REORDENADA, entidadeId: 'B',
    }));
  });

  it('impede reordenação que coloca arquivada antes da ativa sem UPDATE', async () => {
    const { service, repositorio } = contexto([etapa('A', 1), etapa('B', 2, true)]);
    await expect(service.reordenar(contratoId, { idsOrdemAtual: ['A','B'], idsOrdemNova: ['B','A'] }, ator))
      .rejects.toBeInstanceOf(ConflictException);
    expect(repositorio.update).not.toHaveBeenCalled();
  });

  it('impede IDs repetidos em requisição de reordenação', async () => {
    const { service, repositorio } = contexto([etapa('A', 1), etapa('B', 2)]);
    await expect(service.reordenar(contratoId, { idsOrdemAtual: ['A','B'], idsOrdemNova: ['A','A'] }, ator))
      .rejects.toBeInstanceOf(ConflictException);
    expect(repositorio.update).not.toHaveBeenCalled();
  });

  it('finalização parcial não sobrepõe solicitação em aberto', async () => {
    const e = { ...etapa('A',1), conclusaoSolicitadaEm: new Date('2026-11-10') };
    const { service, repositorio } = contexto([e]);
    await expect(service.finalizar(contratoId, 'A', ator, 'Justificativa parcial necessária'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(repositorio.save).not.toHaveBeenCalled();
  });

  it('não arquiva etapa FINALIZADA sem reabertura', async () => {
    const e = { ...etapa('A',1), status: StatusEtapa.FINALIZADA };
    const { service, repositorio } = contexto([e]);
    await expect(service.alterarArquivamento(contratoId, 'A', true, ator))
      .rejects.toBeInstanceOf(ConflictException);
    expect(repositorio.save).not.toHaveBeenCalled();
  });
});


it('B04: conclusão derivada não altera entregável de etapa FINALIZADA', async () => {
  const manager = {
    findOne: jest.fn(async () => ({ ...contrato, arquivadoEm: null })),
    getRepository: jest.fn((entidade: unknown) => ({
      findOneBy: jest.fn(async () => entidade === Entregavel
        ? { id: 'entregavel', contratoId, etapaId: 'etapa', arquivadoEm: null, statusExecucao: 'EM_ANDAMENTO' }
        : { ...etapa('etapa', 1), status: StatusEtapa.FINALIZADA }),
    })),
  };
  const auditar = jest.fn(async () => undefined);
  await expect(concluirEntregavelAposAtividade(manager as never, contratoId, 'entregavel', auditar))
    .resolves.toBeNull();
  expect(auditar).not.toHaveBeenCalled();
});

it('devolver conclusão pendente mantém o estado operacional e registra revisão', async () => {
  const e = { ...etapa('A',1), status: StatusEtapa.EM_ANDAMENTO, conclusaoSolicitadaEm: new Date() };
  const { service, audit } = contexto([e]);
  const resultado = await service.devolverSolicitacao(contratoId, 'A', ator, 'conclusao', 'Necessária revisão documental');
  expect(resultado.status).toBe(StatusEtapa.EM_ANDAMENTO);
  expect(resultado.conclusaoSolicitadaEm).toBeNull();
  expect(resultado.reabertoEm).toBeInstanceOf(Date);
  expect(audit.registrarNaTransacao).toHaveBeenCalledTimes(1);
});


it('compacta uma sequência legada com lacunas antes de inserir nova etapa', async () => {
  const { service, repositorio } = contexto([etapa('A', 2), etapa('B', 4)]);
  const criada = await service.criar(contratoId, { nome: 'Nova etapa' } as never, ator);
  expect(criada.sequencia).toBe(3);
  expect(repositorio.update).toHaveBeenCalledWith({ id:'A', contratoId }, { sequencia:1 });
  expect(repositorio.update).toHaveBeenCalledWith({ id:'B', contratoId }, { sequencia:2 });
});

it('revalida a identidade antes de permitir mutação', async () => {
  const { service, repositorio, usuarioAtual } = contexto([etapa('A', 1)]);
  usuarioAtual.mockResolvedValueOnce({ ativo:false, perfil:'ADMINISTRADOR', supertokensUserId:'qa-etapa' });
  await expect(service.criar(contratoId, { nome:'Nova etapa' } as never, ator)).rejects.toBeInstanceOf(ForbiddenException);
  expect(repositorio.save).not.toHaveBeenCalled();
});

it('bloqueia conclusão quando o estado dos filhos não corresponde a execução apta', async () => {
  const e = { ...etapa('A',1), status: StatusEtapa.EM_ANDAMENTO, conclusaoSolicitadaEm: new Date() };
  const { service, manager, repositorio } = contexto([e]);
  // SQL indica documentação completa e nenhum filho pendente; a consulta física não encontra filhos.
  manager.query.mockImplementation(async (...args: unknown[]) => (String(args[0]).includes('AS pendentes') ? [{ pendentes:false }] : [{ etapas:1, entregaveis:1, verificadas:0, evidencias:0, etapas_sem_entregavel:0 }]) as never[]);
  await expect(service.concluir(contratoId,'A',ator)).rejects.toBeInstanceOf(ConflictException);
  expect(repositorio.save).not.toHaveBeenCalled();
});

it('retorna a posição persistida ao reativar uma etapa', async () => {
  const e = etapa('A', 1, true);
  const { service, repositorio } = contexto([e, etapa('B', 2)]);
  const r = await service.alterarArquivamento(contratoId, 'A', false, ator);
  expect(r.sequencia).toBe(2);
  expect(repositorio.update).toHaveBeenCalledWith({id:'A', contratoId}, {sequencia:2});
});


it('B04: etapa vazia pode solicitar encerramento, mas não conclusão nem finalização', async () => {
  const { service } = contexto([etapa('A', 1)]);
  const r = await service.elegibilidade(contratoId, 'A');
  expect(r).toMatchObject({ podeSolicitarConclusao:false, podeSolicitarParcial:false, podeSolicitarEncerramento:true, podeFinalizar:false });
});

it('B04: pedido descendente bloqueia solicitação de encerramento e a elegibilidade', async () => {
  const { service, manager, repositorio } = contexto([etapa('A', 1)]);
  manager.findBy.mockResolvedValue([{ statusExecucao:'PENDENTE_CONCLUSAO' } as Entregavel]);
  await expect(service.elegibilidade(contratoId, 'A')).resolves.toMatchObject({ decisoesPendentes:true, podeSolicitarEncerramento:false });
  await expect(service.solicitarEncerramento(contratoId,'A',ator,'Encerramento por motivo operacional')).rejects.toBeInstanceOf(ConflictException);
  expect(repositorio.save).not.toHaveBeenCalled();
});

it('B04: aprovar encerramento revalida decisões descendentes', async () => {
  const { service, manager, repositorio } = contexto([{ ...etapa('A', 1), encerramentoSolicitadoEm: new Date(), encerramentoMotivo: 'Encerramento por motivo operacional' } as EtapaMock]);
  manager.findBy.mockResolvedValue([{ statusExecucao:'PENDENTE_CONCLUSAO' } as Entregavel]);
  await expect(service.encerrar(contratoId,'A',ator,'Encerramento por motivo operacional')).rejects.toBeInstanceOf(ConflictException);
  expect(repositorio.save).not.toHaveBeenCalled();
});

it('B04: edição concorrente rejeitada antes de modificar os campos', async () => {
  const { service, repositorio } = contexto([etapa('A', 1)]);
  await expect(service.editar(contratoId,'A',{nome:'Novo nome',estadoAnterior:'0'.repeat(64)},ator)).rejects.toBeInstanceOf(ConflictException);
  expect(repositorio.save).not.toHaveBeenCalled();
  expect(estadoEdicaoEtapa(etapa('A',1) as never)).not.toEqual(estadoEdicaoEtapa({...etapa('A',1),nome:'Outro nome'} as never));
});

it('B04: consulta inclui atividade ligada só por participação N:N, sob o mesmo contrato', async () => {
  const query = jest.fn(async (..._args: unknown[]) => [{ pendentes:true }]);
  await expect(atividadesPendentesDaEtapa({query} as never, contratoId, 'A', true)).resolves.toBe(true);
  expect(query).toHaveBeenCalledWith(expect.stringContaining('atividade_ocorrencias'), [contratoId,'A',true]);
  expect(query).toHaveBeenCalledWith(expect.stringContaining('ao."contratoId"=$1'), [contratoId,'A',true]);
});
