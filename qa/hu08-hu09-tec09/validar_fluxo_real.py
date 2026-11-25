#!/usr/bin/env python3
"""QA HU08/HU09/TEC09: navegador, sessão real, API e PostgreSQL DEV.

Integrado ao testes-all: utiliza dois contratos QA criados pela central e
cria sua própria etapa e entregáveis exclusivos. Não altera contratos de
produção nem grava senhas ou cookies nos relatórios.
"""
from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import json
from pathlib import Path
import re
import secrets
import subprocess
import sys
from urllib.parse import quote, urlparse
from uuid import uuid4

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / 'qa' / 'hu07-06'))
from credenciais_locais import carregar_credenciais, entrar_no_next  # noqa: E402

UUID = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')


def exigir(condicao: bool, mensagem: str):
    if not condicao:
        raise AssertionError(mensagem)


def parametros():
    parser = argparse.ArgumentParser(description='Fluxo real HU08/HU09/TEC09 em DEV')
    parser.add_argument('--contrato-id', required=True)
    parser.add_argument('--outro-contrato-id', required=True)
    parser.add_argument('--confirmar-persistencia', action='store_true')
    parser.add_argument('--validar-banco', action='store_true')
    parser.add_argument('--frontend-url', default='http://localhost:3000')
    parser.add_argument('--api-url', default='http://localhost:3001')
    parser.add_argument('--saida', type=Path)
    args = parser.parse_args()
    if not args.confirmar_persistencia:
        parser.error('Exige --confirmar-persistencia: cria ocorrências, atividades e lançamentos sintéticos.')
    if not all(UUID.fullmatch(v) for v in (args.contrato_id, args.outro_contrato_id)) or args.contrato_id == args.outro_contrato_id:
        parser.error('Informe dois UUIDs diferentes de contratos DEV.')
    for u in (args.frontend_url, args.api_url):
        parsed = urlparse(u)
        if parsed.scheme != 'http' or parsed.hostname not in ('localhost', '127.0.0.1') or parsed.username or parsed.password:
            parser.error('Execução com credenciais automáticas é restrita a HTTP localhost.')
    return args


def requisitar(page, api: str, rota: str, metodo: str = 'GET', dados=None):
    return page.evaluate('''async ({url,metodo,dados}) => {
        const headers={Accept:'application/json'};
        const opts={method:metodo,credentials:'include',cache:'no-store',headers};
        if(dados!==null){headers['Content-Type']='application/json';opts.body=JSON.stringify(dados);}
        try { const r=await fetch(url,opts); const txt=await r.text();
          let body=null;try{body=txt?JSON.parse(txt):null;}catch{body=txt;}
          return {status:r.status,body};
        } catch(e){return {status:0,erro:String(e)};}
    }''', {'url': api.rstrip('/') + rota, 'metodo': metodo, 'dados': dados})


def exigir_api(page, api, rota, metodo='GET', dados=None, aceitos=(200,)):
    resposta = requisitar(page, api, rota, metodo, dados)
    if resposta['status'] not in aceitos:
        corpo = resposta.get('body')
        motivo = corpo.get('message') if isinstance(corpo, dict) else corpo
        if isinstance(motivo, list):
            motivo = '; '.join(str(v) for v in motivo)
        exigir(False, f'{metodo} {rota}: HTTP {resposta["status"]}; esperado {aceitos}; '
              f'motivo: {str(motivo)[:250]}')
    return resposta['body']




def reabrir_contexto_de_atividade(page, api: str, base: str, etapa_id: str,
                                  entregaveis: list[str], ocorrencias: list[str]) -> list[str]:
    """Reabre explicitamente os pais e as ocorrências antes da atividade.

    A aprovação pode colocar ocorrências vinculadas em PENDENTE_CONCLUSAO.
    Reabrir a atividade diretamente nesse estado corretamente devolve HTTP 409.
    Só atua sobre objetos que a fixture sintética acabou de criar.
    """
    motivos = 'QA: revisar a medição e reabrir os registros vinculados.'
    operacoes: list[str] = []
    etapa = exigir_api(page, api, base + '/etapas/' + etapa_id)
    if etapa.get('status') in ('CONCLUIDA', 'ENCERRADA', 'FINALIZADA'):
        encerrada = etapa['status'] in ('ENCERRADA', 'FINALIZADA')
        rota = '/reabrir-encerrada' if encerrada else '/reabrir'
        exigir_api(page, api, base + '/etapas/' + etapa_id + rota, 'PATCH', {'motivo': motivos})
        operacoes.append('etapa')
    for entregavel_id in dict.fromkeys(entregaveis):
        registro = exigir_api(page, api, base + '/entregaveis/' + entregavel_id)
        if registro.get('statusExecucao') in ('CONCLUIDO', 'FINALIZADO', 'PENDENTE_CONCLUSAO', 'PENDENTE_ENCERRAMENTO'):
            exigir_api(page, api, base + '/entregaveis/' + entregavel_id + '/reabrir',
                       'PATCH', {'motivo': motivos})
            operacoes.append('entregavel:' + entregavel_id)
    for ocorrencia_id in dict.fromkeys(ocorrencias):
        item = exigir_api(page, api, base + '/ocorrencias/' + ocorrencia_id)
        if item.get('status') in ('PENDENTE_CONCLUSAO', 'CONCLUIDO', 'PENDENTE_ENCERRAMENTO', 'ENCERRADA'):
            reaberta = exigir_api(page, api, base + '/ocorrencias/' + ocorrencia_id + '/reabrir',
                                  'POST', {'justificativa': motivos}, (200, 201))
            exigir(reaberta.get('status') == 'EM_REVISAO', 'Reabertura não atualizou a ocorrência para EM_REVISAO.')
            operacoes.append('ocorrencia:' + ocorrencia_id)
        elif item.get('status') not in ('NAO_INICIADO', 'EM_ANDAMENTO', 'EM_REVISAO'):
            raise AssertionError(f'Estado inesperado da ocorrência QA para reabrir: {item.get("status")}')
    return operacoes


def lancamentos_concorrentes_mesma_operacao(page, api: str, rota: str, operacao_id: str):
    """Dispara duas transações HTTP simultâneas contra a mesma chave idempotente.

    O navegador usa uma sessão autenticada; não substitui um teste de atores
    diferentes, mas exerce locks de PostgreSQL sob duas requisições concorrentes.
    """
    return page.evaluate('''async ({url, id}) => {
      const post = async () => {
        const resposta = await fetch(url, {method:'POST', credentials:'include', cache:'no-store',
          headers:{'Content-Type':'application/json', Accept:'application/json'},
          body: JSON.stringify({id, quantidade:'1.000'})});
        const texto = await resposta.text();
        let dados = null;try{dados=JSON.parse(texto);}catch{dados=texto;}
        return {status:resposta.status, dados};
      };
      return await Promise.all([post(), post()]);
    }''', {'url': api.rstrip('/') + rota, 'id': operacao_id})



def conferir_rollback_postgres_isolado() -> dict:
    """Falha SQL real em tabela temporária, sem afetar dados do sistema.

    Isto testa rollback do PostgreSQL; NÃO simula indisponibilidade da aplicação
    ou uma falha de COMMIT de sua transação de negócio.
    """
    js = r"""const {Client}=require('pg');const db=new Client({connectionString:process.env.DATABASE_URL});
    (async()=>{await db.connect();try{
      await db.query('BEGIN');
      await db.query('CREATE TEMP TABLE qa_r32_rollback (id integer PRIMARY KEY) ON COMMIT DROP');
      await db.query('INSERT INTO qa_r32_rollback (id) VALUES (1)');
      let esperado=false;
      try {await db.query('INSERT INTO qa_r32_rollback (id) VALUES (1)')}
      catch(e){if(e.code==='23505')esperado=true;else throw e;}
      if(!esperado)throw new Error('Violação UNIQUE não foi detectada');
      await db.query('ROLLBACK');
      const r=await db.query("SELECT to_regclass('pg_temp.qa_r32_rollback') IS NULL AS descartada, 1 AS ativo");
      process.stdout.write(JSON.stringify({falhaControlada:esperado,rollback:r.rows[0].descartada,
        conexaoSaudavel:Number(r.rows[0].ativo)===1}));
    }finally{await db.end()}})().catch(e=>{process.stderr.write(e.message);process.exit(1)});"""
    comando = ['docker', 'compose', 'exec', '-T', 'backend', 'node', '-e', js]
    proc = subprocess.run(comando, cwd=RAIZ, text=True, capture_output=True, check=False)
    exigir(proc.returncode == 0, 'Teste SQL de rollback falhou: ' + proc.stderr[-250:])
    resultado = json.loads(proc.stdout)
    exigir(all(resultado.get(chave) is True for chave in
        ('falhaControlada', 'rollback', 'conexaoSaudavel')),
        'PostgreSQL não confirmou rollback completo após erro controlado.')
    return resultado


def preparar_planejamento_sintetico(page, api: str, contrato_id: str, hoje: date | None = None):
    """Reserva uma etapa e dois entregáveis EXCLUSIVOS para este ensaio.

    Contratos são criados anteriormente por QA-REAL-CRIAR-CONTRATOS. Não usar
    entregáveis de HU07 ou dados não marcados como QA; ninguém fornece UUIDs.
    """
    contrato = exigir_api(page, api, f'/contratos/{quote(contrato_id)}')
    exigir(isinstance(contrato, dict) and str(contrato.get('observacoes') or '').startswith('QA código público:'),
          'O QA integrado só modifica contratos sintéticos criados pelo próprio executor central.')
    exigir(contrato.get('status') in ('PLANEJAMENTO', 'EM_EXECUCAO'),
          'Contrato sintético já não admite novas etapas ou entregáveis.')
    hoje = hoje or datetime.now(ZoneInfo('America/Sao_Paulo')).date()
    # Um dia histórico + sete dias futuros: a conversão DIARIA → SEMANAL
    # exige período semanal COMPLETO, sem introduzir obrigação parcial.
    final = hoje + timedelta(days=7)
    inicio_txt, fim_txt = hoje.isoformat(), final.isoformat()
    exigir(str(contrato['inicioVigencia']) <= inicio_txt and fim_txt <= str(contrato['terminoVigencia']),
          'A vigência do contrato QA não comporta a agenda de teste; recrie a fixture DEV.')
    marca = secrets.token_hex(4).upper()
    base = f'/contratos/{quote(contrato_id)}'
    etapa = exigir_api(page, api, base + '/etapas', 'POST', {
        'nome': f'QA HU08/HU09 {marca}', 'codigo': f'Q829-{marca}',
        'inicioPrevisto': inicio_txt, 'terminoPrevisto': fim_txt,
    }, (201,))
    exigir(UUID.fullmatch(str(etapa.get('id') or '')) is not None, 'Etapa QA sem identificador válido.')
    comum = {'etapaId': etapa['id'], 'inicioPrevisto': inicio_txt, 'peso': '1.0000'}
    recorrente = exigir_api(page, api, base + '/entregaveis', 'POST', {
        **comum, 'nome': f'QA R29 Recorrente {marca}', 'codigo': f'QR-{marca}',
        'tipo': 'RECORRENTE', 'terminoPrevisto': fim_txt,
        'periodicidade': 'DIARIA', 'configuracaoPeriodicidade': {'versao': 1},
    }, (201,))
    quantitativo = exigir_api(page, api, base + '/entregaveis', 'POST', {
        **comum, 'nome': f'QA R29 Quantitativo {marca}', 'codigo': f'QQ-{marca}',
        'tipo': 'QUANTITATIVO', 'quantidadePrevista': '20.000', 'unidadeMedida': 'unidades',
    }, (201,))
    for item, tipo in ((recorrente, 'RECORRENTE'), (quantitativo, 'QUANTITATIVO')):
        exigir(UUID.fullmatch(str(item.get('id') or '')) is not None and
              item.get('etapaId') == etapa['id'] and item.get('tipo') == tipo,
              f'Planejamento QA {tipo} não persistiu na etapa recém-criada.')
    return etapa, recorrente, quantitativo

def conferir_postgres(contrato: str, ocorrencia: str, atividade: str, lancamento: str):
    """Compara IDs reais; não altera dados nem expõe DATABASE_URL."""
    js = r'''
    const {Client}=require('pg');
    const db=new Client({connectionString:process.env.DATABASE_URL});
    (async()=>{await db.connect();try {
      const o=await db.query(`SELECT id,contrato_id,entregavel_id,status FROM ocorrencias WHERE id=$1 AND contrato_id=$2`,[process.argv[1],process.argv[2]]);
      const a=await db.query(`SELECT id,"contratoId" FROM atividades WHERE id=$1 AND "contratoId"=$2`,[process.argv[3],process.argv[2]]);
      const ao=await db.query(`SELECT count(*)::int total FROM atividade_ocorrencias WHERE "atividadeId"=$1 AND "ocorrenciaId"=$2`,[process.argv[3],process.argv[1]]);
      const l=await db.query(`SELECT id,quantidade::text FROM ocorrencia_lancamentos WHERE id=$1 AND contrato_id=$2`,[process.argv[4],process.argv[2]]);
      const ev=await db.query(`SELECT count(*)::int total FROM eventos_auditoria WHERE contrato_id=$1 AND entidade_id=$2`,[process.argv[2],process.argv[1]]);
      process.stdout.write(JSON.stringify({ocorrencias:o.rowCount,atividades:a.rowCount,vinculos:ao.rows[0].total,lancamentos:l.rowCount,auditoria:ev.rows[0].total}));
    }finally{await db.end();}})().catch(e=>{process.stderr.write(e.message);process.exit(1)});
    '''
    cmd = ['docker', 'compose', 'exec', '-T', 'backend', 'node', '-e', js, ocorrencia, contrato, atividade, lancamento]
    p = subprocess.run(cmd, cwd=RAIZ, text=True, capture_output=True, check=False)
    exigir(p.returncode == 0, 'Consulta PostgreSQL de QA falhou: ' + p.stderr[-280:])
    result = json.loads(p.stdout)
    exigir(all(result[k] == 1 for k in ('ocorrencias', 'atividades', 'vinculos', 'lancamentos')),
          'Banco e API divergentes nos registros ou vínculos de execução.')
    exigir(result['auditoria'] >= 1, 'Histórico de auditoria da ocorrência ausente no PostgreSQL.')
    return result



def concluir_periodo_recorrente_apos_revisao(page, api: str, base: str, ocorrencia_id: str) -> dict:
    """Conclusão explícita pós-reabertura: a revisão não é encerrada automaticamente.

    O recálculo da atividade mantém EM_REVISAO até uma nova solicitação
    autorizada. Rejeitar critérios físicos incompletos; nunca forçar status.
    """
    rota = base + '/ocorrencias/' + ocorrencia_id
    atual = exigir_api(page, api, rota)
    if atual.get('status') not in ('EM_REVISAO', 'EM_ANDAMENTO', 'NAO_INICIADO', 'PENDENTE_CONCLUSAO'):
        raise AssertionError(f'Período recorrente em estado inesperado para conclusão: {atual.get("status")}')
    exigir(atual.get('metaAtingida') is True and atual.get('requisitosAtendidos') is True,
          'Período recorrente não atende à meta ou às exigências após a reaprovação da atividade.')
    if atual.get('status') != 'PENDENTE_CONCLUSAO':
        solicitada = exigir_api(page, api, rota + '/solicitar-conclusao', 'POST', {}, (200, 201))
        exigir(solicitada.get('status') == 'PENDENTE_CONCLUSAO',
              'Solicitar conclusão não deixou a ocorrência em PENDENTE_CONCLUSAO.')
        pendente = exigir_api(page, api, rota)
        exigir(pendente.get('status') == 'PENDENTE_CONCLUSAO',
              'A solicitação não persistiu o estado pendente no banco.')
    aprovada = exigir_api(page, api, rota + '/concluir', 'POST', {}, (200, 201))
    exigir(aprovada.get('status') == 'CONCLUIDO',
          'A aprovação não retornou estado CONCLUIDO.')
    final = exigir_api(page, api, rota)
    exigir(final.get('status') == 'CONCLUIDO',
          'Período recorrente não permaneceu CONCLUIDO após recarregar.')
    return final



def testar_ciclo_marco_real(page, api: str, base: str, etapa_id: str,
                            recorrente_id: str, quantitativo_id: str,
                            ocorrencia_historica_id: str, ocorrencia_quantitativa_id: str,
                            atividade_id: str, inicio: str) -> dict:
    """Meta Marco real: cadastro, vínculo verificado, rejeição e revogação dinâmica.

    Usa somente a etapa e os registros sintéticos já criados pelo ensaio. A
    invalidação vem da reabertura efetiva da atividade, não de PATCH direto
    na tabela de metas ou alteração artificial de status.
    """
    marco = exigir_api(page, api, base + '/entregaveis', 'POST', {
        'etapaId': etapa_id, 'inicioPrevisto': inicio, 'peso': '1.0000',
        'nome': 'QA Meta Marco ' + secrets.token_hex(4).upper(),
        'codigo': 'QM-' + secrets.token_hex(4).upper(),
        'tipo': 'MARCO', 'criterioConclusao': 'Atividade fiscalizada e aprovada de forma verificável.',
    }, (201,))
    marco_id = marco.get('id')
    exigir(isinstance(marco_id, str) and UUID.fullmatch(marco_id),
          'Entregável Marco QA não foi criado corretamente.')
    caminho = base + '/entregaveis/' + marco_id + '/metas'
    meta = exigir_api(page, api, caminho, 'POST', {
        'tipo': 'ATIVIDADE', 'titulo': 'Atividade verificada do Marco', 'quantidadeExigida': 1,
    }, (201,))
    meta_id = meta['id']
    exigir(meta.get('quantidadeAprovada') == 0 and meta.get('pronto') is False,
          'Meta recém-criada não pode estar pronta sem vínculo aprovado.')
    candidatos = exigir_api(page, api, caminho + '/' + meta_id + '/candidatos')
    exigir(any(c.get('id') == atividade_id for c in candidatos),
          'Atividade verificada não aparece como candidata à meta do Marco.')
    criada = exigir_api(page, api, caminho + '/' + meta_id + '/vinculos', 'POST',
                        {'registroId': atividade_id}, (201,))
    vinculos = criada.get('vinculos') or []
    exigir(len(vinculos) == 1 and vinculos[0].get('status') == 'PENDENTE',
          'Vínculo da meta Marco deve aguardar decisão explícita.')
    vinculo_id = vinculos[0]['id']
    duplicado = requisitar(page, api, caminho + '/' + meta_id + '/vinculos', 'POST',
                          {'registroId': atividade_id})
    exigir(duplicado['status'] == 409, 'Marco aceitou vínculo duplicado antes da aprovação.')
    aprovacao = exigir_api(page, api, caminho + '/' + meta_id + '/vinculos/' + vinculo_id + '/aprovar',
                          'POST', {}, (200, 201))
    exigir(aprovacao.get('pronto') is True and aprovacao.get('quantidadeAprovada') == 1,
          'Aprovação do vínculo não tornou a meta Marco pronta.')
    segunda_decisao = requisitar(page, api,
        caminho + '/' + meta_id + '/vinculos/' + vinculo_id + '/aprovar', 'POST', {})
    exigir(segunda_decisao['status'] == 409, 'Meta Marco permitiu decidir duas vezes o mesmo vínculo.')
    # Segundo requisito independente: rejeição não contabiliza a atividade.
    rejeitada = exigir_api(page, api, caminho, 'POST', {
        'tipo': 'ATIVIDADE', 'titulo': 'Vínculo rejeitado do Marco', 'quantidadeExigida': 1,
    }, (201,))
    rejeitada_id = rejeitada['id']
    nova = exigir_api(page, api, caminho + '/' + rejeitada_id + '/vinculos', 'POST',
                     {'registroId': atividade_id}, (201,))
    rejeitada_vinculo_id = nova['vinculos'][0]['id']
    motivo = 'QA Marco: vínculo não aceito para o segundo requisito.'
    rejeicao = exigir_api(page, api,
        caminho + '/' + rejeitada_id + '/vinculos/' + rejeitada_vinculo_id + '/rejeitar',
        'POST', {'justificativa': motivo}, (200, 201))
    exigir(rejeicao.get('pronto') is False and rejeicao.get('quantidadeAprovada') == 0,
          'Rejeição do vínculo fez meta indevidamente pronta.')
    # Revogação dinâmica, não simulação: status da atividade deixa VERIFICADA.
    reabrir_contexto_de_atividade(page, api, base, etapa_id,
        [recorrente_id, quantitativo_id], [ocorrencia_historica_id, ocorrencia_quantitativa_id])
    exigir_api(page, api, base + '/atividades/' + atividade_id + '/reabrir', 'POST',
               {'justificativa': 'QA Marco: verificar revogação da elegibilidade após reabertura.'}, (200, 201))
    apos_abertura = exigir_api(page, api, caminho)
    ativa = next((m for m in apos_abertura.get('metas', []) if m['id'] == meta_id), None)
    exigir(ativa and ativa['quantidadeAprovada'] == 0 and ativa['pronto'] is False,
          'Reabertura da atividade não invalidou dinamicamente a meta Marco.')
    exigir_api(page, api, base + '/atividades/' + atividade_id + '/solicitar-conclusao', 'POST', {}, (200, 201))
    exigir_api(page, api, base + '/atividades/' + atividade_id + '/aprovar-conclusao', 'POST', {}, (200, 201))
    apos_nova_aprovacao = exigir_api(page, api, caminho)
    ativa = next((m for m in apos_nova_aprovacao.get('metas', []) if m['id'] == meta_id), None)
    rejeitada_atual = next((m for m in apos_nova_aprovacao.get('metas', []) if m['id'] == rejeitada_id), None)
    exigir(ativa and ativa['pronto'] is True and ativa['quantidadeAprovada'] == 1,
          'Reaprovação da atividade não restaurou a elegibilidade da meta Marco.')
    exigir(rejeitada_atual and rejeitada_atual['quantidadeAprovada'] == 0 and rejeitada_atual['pronto'] is False,
          'Vínculo rejeitado contabilizou indevidamente após reaprovação da atividade.')
    final_q = exigir_api(page, api, base + '/ocorrencias/' + ocorrencia_quantitativa_id)
    exigir(abs(float(final_q.get('quantidadeExecutada', 0)) - 2) < 0.001,
          'Ciclo de Marco corrompeu medição quantitativa independente.')
    return {'marcoId': marco_id, 'metaAprovadaId': meta_id, 'metaRejeitadaId': rejeitada_id,
            'aprovada': ativa['quantidadeAprovada'], 'rejeitada': rejeitada_atual['quantidadeAprovada'],
            'revogacaoPorReabertura': True, 'restauracaoPorAprovacao': True}

def main():
    a = parametros()
    from playwright.sync_api import sync_playwright
    evidencias = {'status': 'EM_ANDAMENTO', 'etapas': [], 'contrato': a.contrato_id, 'outroContrato': a.outro_contrato_id}
    try:
        with sync_playwright() as pw:
            navegador = pw.chromium.launch(headless=True)
            try:
                context = navegador.new_context(locale='pt-BR', viewport={'width': 1280, 'height': 820})
                page = context.new_page()
                page.goto(a.frontend_url + '/login', wait_until='domcontentloaded')
                email, senha = carregar_credenciais('administrador')
                try:
                    entrar_no_next(page, email, senha)
                finally:
                    del senha
                me = exigir_api(page, a.api_url, '/auth/me')
                exigir(me.get('id') and me.get('perfil') == 'ADMINISTRADOR', 'Login ADMIN de teste não validado.')
                evidencias['etapas'].append('Login real / sessão de domínio / ADMIN')
                c = quote(a.contrato_id)
                base = f'/contratos/{c}'
                etapa_qa, recorrente, quantitativo = preparar_planejamento_sintetico(
                    page, a.api_url, a.contrato_id)
                evidencias['etapas'].append('Fixture automática: etapa exclusiva + entregáveis recorrente e quantitativo')
                evidencias['fixture'] = {'etapaId': etapa_qa['id'],
                    'recorrenteId': recorrente['id'], 'quantitativoId': quantitativo['id']}
                gerar = f'{base}/entregaveis/{recorrente["id"]}/ocorrencias/gerar'
                dto = {'minimoAtividadesVerificadas': 1, 'minimoEvidenciasVerificadas': 0, 'evidenciaExigida': 'NENHUMA'}
                primeira = exigir_api(page, a.api_url, gerar, 'POST', dto, (201,))
                segunda = exigir_api(page, a.api_url, gerar, 'POST', dto, (201,))
                exigir(segunda.get('novasGeradas') == 0, 'Geração idempotente criou duplicações no segundo POST.')
                ocorrencias = exigir_api(page, a.api_url, base + '/ocorrencias')
                ocorrencia_r = next((o for o in ocorrencias if o['entregavelId'] == recorrente['id'] and o['origem'] == 'RECORRENTE' and not o.get('substituidaEm')), None)
                exigir(ocorrencia_r is not None, 'Não foi possível consultar ocorrência recorrente gerada.')
                evidencias['etapas'].append(f'Recorrente gerado/idempotente: {primeira.get("novasGeradas")} novo(s), segunda geração zero')
                hoje = datetime.now(ZoneInfo('America/Sao_Paulo')).date().isoformat()
                titulo = 'QA HU09 ' + secrets.token_hex(4).upper()
                ocorrencia_q = exigir_api(page, a.api_url, f'{base}/entregaveis/{quantitativo["id"]}/ocorrencias',
                    'POST', {'titulo': titulo, 'modoRegistro': 'QUANTITATIVO', 'metaQuantidade': '5.000',
                             'periodoInicio': hoje, 'periodoFim': hoje, 'minimoAtividadesVerificadas': 0}, (201,))
                oq = ocorrencia_q['id']
                lancamento = str(uuid4())
                rota_l = f'{base}/ocorrencias/{oq}/lancamentos'
                primeiro_l = exigir_api(page, a.api_url, rota_l, 'POST', {'id': lancamento, 'quantidade': '2.000'}, (201,))
                repetir_l = exigir_api(page, a.api_url, rota_l, 'POST', {'id': lancamento, 'quantidade': '2.000'}, (201,))
                exigir(repetir_l.get('repetido') is True, 'Retry de lançamento gerou duplicação de quantidade.')
                exigir(len([l for l in exigir_api(page, a.api_url, rota_l) if l['id'] == lancamento]) == 1,
                      'Lançamento idempotente persistiu múltiplos registros.')
                evidencias['etapas'].append('Ocorrência quantitativa, lançamento e retry idempotente por UUID')
                titulo_atividade = 'QA HU08 ' + secrets.token_hex(4).upper()
                atividade = exigir_api(page, a.api_url, base + '/atividades', 'POST', {
                    'contratoId': a.contrato_id, 'titulo': titulo_atividade, 'tipo': 'Vistoria',
                    'descricao': 'Atividade sintética de integração contratual',
                    'dataHora': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
                    'entregavelIds': [recorrente['id'], quantitativo['id']],
                    'ocorrenciaIds': [ocorrencia_r['id'], oq],
                }, (201,))
                aid = atividade['id']
                detalhe = exigir_api(page, a.api_url, base + '/atividades/' + aid)
                exigir(detalhe.get('id') == aid and detalhe.get('contratoId') == a.contrato_id,
                      'Atividade não pôde ser consultada após criação.')
                negar = requisitar(page, a.api_url, f'/contratos/{quote(a.outro_contrato_id)}/atividades/{aid}')
                exigir(negar['status'] in (403, 404), 'Atividade exposta sob contrato raiz incorreto.')
                # A proteção anti-IDOR deve valer também para gravação. Confirmar
                # que a tentativa recusada não alterou a atividade no contrato certo.
                negar_edicao = requisitar(page, a.api_url,
                    f'/contratos/{quote(a.outro_contrato_id)}/atividades/{aid}', 'PATCH',
                    {'titulo': 'Título que não pode ser salvo fora do contrato'})
                exigir(negar_edicao['status'] in (403, 404),
                      f'PATCH entre contratos deveria ser negado; recebeu HTTP {negar_edicao["status"]}.')
                detalhe_apos_negativa = exigir_api(page, a.api_url, base + '/atividades/' + aid)
                exigir(detalhe_apos_negativa.get('titulo') == titulo_atividade,
                      'PATCH anti-IDOR negado alterou a atividade original: violação de isolamento.')
                evidencias['etapas'].append('Anti-IDOR leitura e escrita com rollback verificado')
                progresso = exigir_api(page, a.api_url, base + '/progresso')
                ids = {e.get('entregavelId') for e in progresso.get('entregaveis', [])}
                exigir({recorrente['id'], quantitativo['id']}.issubset(ids), 'Motor TEC09 perdeu entregáveis no agregado.')
                evidencias['etapas'].append('Atividade multivínculo HU08 + anti-IDOR + agregação física TEC09')
                page.goto(a.frontend_url + f'/contratos/{c}', wait_until='domcontentloaded')
                page.get_by_role('tab', name='Atividades', exact=True).click()
                page.get_by_text(titulo_atividade, exact=False).first.wait_for(timeout=20000)
                page.get_by_role('tab', name='Execução', exact=True).click()
                page.get_by_role('tab', name='Geral', exact=True).wait_for(timeout=20000)
                evidencias['etapas'].append('Frontend real: atividade no diário e aba Execução renderizada')
                if a.validar_banco:
                    evidencias['postgres'] = conferir_postgres(a.contrato_id, oq, aid, lancamento)
                    evidencias['etapas'].append('PostgreSQL: ocorrências, atividades, vínculo N:N, lançamento e auditoria')
                # R28: valida o fluxo REAL da medição em duas ocorrências, o bloqueio
                # de remoção implícita, a substituição explícita e o progresso após aprovação.
                outra_q = exigir_api(page, a.api_url, f'{base}/entregaveis/{quantitativo["id"]}/ocorrencias',
                    'POST', {'titulo': 'QA HU09 revisão ' + secrets.token_hex(4).upper(),
                             'modoRegistro': 'QUANTITATIVO', 'metaQuantidade': '5.000',
                             'periodoInicio': hoje, 'periodoFim': hoje,
                             'minimoAtividadesVerificadas': 0}, (201,))
                oq2 = outra_q['id']
                # Concorrência real: dois POSTs em paralelo com a mesma chave
                # precisam produzir uma única linha, mesmo em transações distintas.
                concorrente = exigir_api(page, a.api_url, f'{base}/entregaveis/{quantitativo["id"]}/ocorrencias',
                    'POST', {'titulo': 'QA concorrência ' + secrets.token_hex(4).upper(),
                             'modoRegistro': 'QUANTITATIVO', 'metaQuantidade': '5.000',
                             'periodoInicio': hoje, 'periodoFim': hoje,
                             'minimoAtividadesVerificadas': 0}, (201,))
                chave_concorrente = str(uuid4())
                rota_concorrente = base + '/ocorrencias/' + concorrente['id'] + '/lancamentos'
                respostas_concorrentes = lancamentos_concorrentes_mesma_operacao(page, a.api_url,
                    rota_concorrente, chave_concorrente)
                exigir(len(respostas_concorrentes) == 2 and all(r['status'] in (200, 201) for r in respostas_concorrentes),
                      'Envios simultâneos da mesma operação falharam: ' + str(respostas_concorrentes))
                lancamentos_conferidos = exigir_api(page, a.api_url, rota_concorrente)
                exigir(len([r for r in lancamentos_conferidos if r['id'] == chave_concorrente]) == 1,
                      'Requisições concorrentes duplicaram a operação no PostgreSQL.')
                estado_concorrente = exigir_api(page, a.api_url, base + '/ocorrencias/' + concorrente['id'])
                exigir(abs(float(estado_concorrente.get('quantidadeExecutada', 0)) - 1) < 0.001,
                      'Concorrência acumulou quantidade duplicada na ocorrência.')
                evidencias['etapas'].append('Concorrência de duas transações HTTP: UUID único, quantidade 1 vez')
                novas_ligacoes = [ocorrencia_r['id'], oq, oq2]
                atualizado = exigir_api(page, a.api_url, base + '/atividades/' + aid, 'PATCH', {
                    'ocorrenciaIds': novas_ligacoes,
                    'medicoes': [{'ocorrenciaId': oq, 'quantidade': '1.000'},
                                {'ocorrenciaId': oq2, 'quantidade': '2.000'}],
                }, (200,))
                exigir(atualizado.get('id') == aid, 'Medição dupla não retornou a atividade esperada.')
                medidas = exigir_api(page, a.api_url, base + '/atividades/' + aid)
                exigir({m['ocorrenciaId'] for m in medidas.get('medicoes', [])} >= {oq, oq2},
                      'Medições distintas não foram persistidas para as duas ocorrências.')
                evidencias['etapas'].append('Medições individuais A=1, B=2 persistidas por API')
                negada = requisitar(page, a.api_url, base + '/atividades/' + aid, 'PATCH', {
                    'ocorrenciaIds': [ocorrencia_r['id'], oq2],
                })
                exigir(negada['status'] == 409,
                      f'Desvinculação silenciosa de ocorrência medida deveria retornar 409, recebeu {negada["status"]}')
                medidas = exigir_api(page, a.api_url, base + '/atividades/' + aid)
                exigir({m['ocorrenciaId'] for m in medidas.get('medicoes', [])} >= {oq, oq2},
                      'Tentativa rejeitada alterou as medições: violação de atomicidade.')
                exigir_api(page, a.api_url, base + '/atividades/' + aid, 'PATCH', {
                    'ocorrenciaIds': [ocorrencia_r['id'], oq2],
                    'medicoes': [{'ocorrenciaId': oq2, 'quantidade': '2.000'}],
                }, (200,))
                atividade_pos = exigir_api(page, a.api_url, base + '/atividades/' + aid)
                exigir({m['ocorrenciaId'] for m in atividade_pos.get('medicoes', [])} == {oq2},
                      'Correção explícita de medições manteve a medição retirada.')
                exigir(oq not in {o['id'] for o in atividade_pos.get('ocorrencias', [])},
                      'Ocorrência antiga ainda está vinculada após desvinculação explícita.')
                r_antiga = exigir_api(page, a.api_url, base + '/ocorrencias/' + oq)
                exigir(abs(float(r_antiga.get('quantidadeExecutada', 0)) - 2) < 0.001,
                      'A ocorrência A deveria preservar apenas as 2 unidades do lançamento manual.')
                evidencias['etapas'].append('Remoção implícita negada (409), atomicidade e conciliação explícita aprovadas')
                # O período B só passa a computar a medição da atividade após a aprovação.
                r_antes = exigir_api(page, a.api_url, base + '/ocorrencias/' + oq2)
                exigir(abs(float(r_antes.get('quantidadeExecutada', 0))) < 0.001,
                      'Medição de atividade não verificada foi contada prematuramente.')
                exigir_api(page, a.api_url, base + '/atividades/' + aid + '/solicitar-conclusao', 'POST', {}, (200, 201))
                exigir_api(page, a.api_url, base + '/atividades/' + aid + '/aprovar-conclusao', 'POST', {}, (200, 201))
                r_depois = exigir_api(page, a.api_url, base + '/ocorrencias/' + oq2)
                exigir(abs(float(r_depois.get('quantidadeExecutada', 0)) - 2) < 0.001,
                      'Aprovação da atividade não atualizou as 2 unidades do período B.')
                negativa_null = requisitar(page, a.api_url, base + '/ocorrencias/' + oq2, 'PATCH', {'minimoFotos': None})
                exigir(negativa_null['status'] == 400,
                      'PATCH de cota documental com null deveria ser rejeitado (HTTP 400).')
                evidencias['etapas'].append('Atividade aprovada: quantidade B 0→2, sem regressão em A; mínimo null negado')
                # Regressão de ciclo de vida: a aprovação pode colocar as
                # ocorrências relacionadas em PENDENTE_CONCLUSAO. A API deve
                # negar a reabertura da atividade até que os pais sejam reabertos.
                bloqueadas = [o for o in (ocorrencia_r['id'], oq2)
                              if exigir_api(page, a.api_url, base + '/ocorrencias/' + o).get('status')
                              in ('PENDENTE_CONCLUSAO', 'CONCLUIDO', 'PENDENTE_ENCERRAMENTO', 'ENCERRADA')]
                if bloqueadas:
                    recusada = requisitar(page, a.api_url, base + '/atividades/' + aid + '/reabrir', 'POST',
                                         {'justificativa': 'QA: revisão com ocorrência ainda bloqueada.'})
                    exigir(recusada['status'] == 409,
                          'Reabrir atividade com ocorrência bloqueada deveria retornar HTTP 409.')
                    exigir(exigir_api(page, a.api_url, base + '/atividades/' + aid).get('status') == 'VERIFICADA',
                          'Reabertura rejeitada alterou a atividade: erro de atomicidade.')
                    evidencias['etapas'].append('Atividade bloqueada por ocorrência pendente: HTTP 409, sem escrita')
                reaberturas = reabrir_contexto_de_atividade(
                    page, a.api_url, base, etapa_qa['id'],
                    [recorrente['id'], quantitativo['id']], [ocorrencia_r['id'], oq2])
                exigir_api(page, a.api_url, base + '/atividades/' + aid + '/reabrir', 'POST',
                           {'justificativa': 'QA: revisão de medição após aprovação da atividade.'}, (200, 201))
                evidencias['etapas'].append('Reabertura autorizada de hierarquia: ' + ', '.join(reaberturas or ['pais já abertos']))
                reaberta = exigir_api(page, a.api_url, base + '/atividades/' + aid)
                exigir(reaberta.get('status') == 'REGISTRADA', 'Atividade reaberta não retornou ao estado REGISTRADA.')
                sem_aprovacao = exigir_api(page, a.api_url, base + '/ocorrencias/' + oq2)
                exigir(abs(float(sem_aprovacao.get('quantidadeExecutada', 0))) < 0.001,
                      'Reabrir atividade manteve quantidade de medição não verificada no progresso.')
                repeticao = requisitar(page, a.api_url, base + '/atividades/' + aid + '/reabrir', 'POST',
                                       {'justificativa': 'QA: reabertura duplicada não pode alterar o estado.'})
                exigir(repeticao['status'] == 409, 'Reabrir duas vezes deveria retornar conflito de estado 409.')
                exigir_api(page, a.api_url, base + '/atividades/' + aid + '/solicitar-conclusao', 'POST', {}, (200, 201))
                exigir_api(page, a.api_url, base + '/atividades/' + aid + '/aprovar-conclusao', 'POST', {}, (200, 201))
                reaprovada = exigir_api(page, a.api_url, base + '/ocorrencias/' + oq2)
                exigir(abs(float(reaprovada.get('quantidadeExecutada', 0)) - 2) < 0.001,
                      'Nova aprovação da atividade não restaurou a medição B exatamente uma vez.')
                evidencias['etapas'].append('Reabertura 2→0, reabertura duplicada negada, nova aprovação 0→2')
                # Replanejamento de agenda futura após concluir período histórico.
                # Quando a atividade foi reaberta, a ocorrência ficou EM_REVISAO;
                # reaprová-la não encerra automaticamente a revisão. É necessário
                # solicitar e aprovar explicitamente a conclusão desse período.
                concluir_periodo_recorrente_apos_revisao(page, a.api_url, base, ocorrencia_r['id'])
                evidencias['etapas'].append(
                    'Ocorrência recorrente pós-revisão: requisitos conferidos, conclusão solicitada e aprovada')
                inicio_futuro = (date.fromisoformat(hoje) + timedelta(days=1)).isoformat()
                termino_futuro = (date.fromisoformat(hoje) + timedelta(days=7)).isoformat()
                rota_revisao = f'{base}/entregaveis/{recorrente["id"]}/ocorrencias/replanejar'
                parametros_revisao = {'inicioFuturo': inicio_futuro,
                                      'terminoPrevisto': termino_futuro, 'periodicidade': 'SEMANAL'}
                # Caso negativo: a grade semanal não pode ser criada com apenas
                # dois dias. Uma prévia inválida não deve modificar a agenda nem
                # o entregável; preservar o domínio é mais importante que PASS.
                antes_parcial = exigir_api(page, a.api_url, base + '/ocorrencias')
                ids_antes = {o['id']: (o.get('status'), o.get('substituidaEm'),
                                        o.get('periodoInicio'), o.get('periodoFim'))
                             for o in antes_parcial if o.get('entregavelId') == recorrente['id']}
                entrega_antes = exigir_api(page, a.api_url, base + '/entregaveis/' + recorrente['id'])
                parcial = requisitar(page, a.api_url, rota_revisao, 'POST',
                    {**parametros_revisao,
                     'terminoPrevisto': (date.fromisoformat(hoje) + timedelta(days=2)).isoformat()})
                exigir(parcial['status'] == 400,
                    f'Período semanal incompleto deveria ser rejeitado com HTTP 400; recebido {parcial["status"]}.')
                motivo_parcial = parcial.get('body')
                motivo_parcial = motivo_parcial.get('message') if isinstance(motivo_parcial, dict) else motivo_parcial
                exigir('períodos completos' in str(motivo_parcial).lower(),
                    'O HTTP 400 não foi causado pela semana parcial; investigar o motivo antes de aprovar o QA.')
                depois_parcial = exigir_api(page, a.api_url, base + '/ocorrencias')
                ids_depois = {o['id']: (o.get('status'), o.get('substituidaEm'),
                                         o.get('periodoInicio'), o.get('periodoFim'))
                              for o in depois_parcial if o.get('entregavelId') == recorrente['id']}
                entrega_depois = exigir_api(page, a.api_url, base + '/entregaveis/' + recorrente['id'])
                exigir(ids_depois == ids_antes and
                    entrega_depois.get('periodicidade') == entrega_antes.get('periodicidade') and
                    entrega_depois.get('agendaInicioFuturo') == entrega_antes.get('agendaInicioFuturo'),
                    'Prévia semanal inválida alterou ocorrências ou periodicidade: violação de atomicidade.')
                evidencias['etapas'].append(
                    'Semana incompleta rejeitada HTTP 400 sem modificar agenda ou entregável')
                # Caso positivo: os sete dias futuros formam exatamente uma
                # semana; o período concluído de hoje deve ser preservado.
                previa = exigir_api(page, a.api_url, rota_revisao, 'POST', parametros_revisao, (200, 201))
                exigir(previa.get('aplicado') is False and isinstance(previa.get('confirmacao'), str),
                      'Prévia do replanejamento não retornou token de confirmação.')
                exigir(len(previa.get('substituir') or []) == 7 and len(previa.get('novas') or []) == 1
                      and int(previa.get('preservadas') or 0) >= 1,
                      'Prévia não preservou o histórico ou não consolidou exatamente 7 períodos em 1.')
                exigir(previa['novas'][0].get('inicio') == inicio_futuro and
                      previa['novas'][0].get('fim') == termino_futuro,
                      'Prévia apresentou período diferente da semana completa solicitada.')
                confirmado = exigir_api(page, a.api_url, rota_revisao, 'POST',
                    {**parametros_revisao, 'confirmacao': previa['confirmacao']}, (200, 201))
                exigir(confirmado.get('aplicado') is True, 'Replanejamento confirmado não foi aplicado.')
                apos_revisao = exigir_api(page, a.api_url, base + '/ocorrencias')
                historico = next((o for o in apos_revisao if o['id'] == ocorrencia_r['id']), None)
                exigir(historico and historico.get('status') == 'CONCLUIDO' and not historico.get('substituidaEm'),
                      'Replanejamento descartou ou substituiu o período concluído.')
                periodos_novos = [o for o in apos_revisao if o.get('entregavelId') == recorrente['id']
                    and not o.get('substituidaEm') and o.get('periodoInicio') >= inicio_futuro]
                exigir(len(periodos_novos) == 1 and
                       periodos_novos[0].get('periodoInicio') == inicio_futuro and
                       periodos_novos[0].get('periodoFim') == termino_futuro,
                      'Replanejamento não consolidou sete períodos futuros em uma semana completa.')
                substituidas = [o for o in apos_revisao if o.get('entregavelId') == recorrente['id']
                    and o.get('substituidaEm')]
                exigir(len(substituidas) == 7,
                    'Replanejamento deveria substituir exatamente os sete períodos futuros, sem tocar no histórico.')
                revisao_repetida = requisitar(page, a.api_url, rota_revisao, 'POST',
                    {**parametros_revisao, 'confirmacao': previa['confirmacao']})
                exigir(revisao_repetida['status'] == 409,
                      'Token de prévia anterior não pode ser reaproveitado após replanejar.')
                evidencias['etapas'].append('Replanejamento: histórico concluído preservado, 7 períodos futuros → 1 semanal, token expirado')
                evidencias['marco'] = testar_ciclo_marco_real(
                    page, a.api_url, base, etapa_qa['id'], recorrente['id'], quantitativo['id'],
                    ocorrencia_r['id'], oq2, aid, hoje)
                evidencias['etapas'].append(
                    'Marco: 2 metas reais, vínculo aprovado/rejeitado, duplicação negada, reabertura invalida e reaprovação restaura')
                if a.validar_banco:
                    evidencias['rollbackSql'] = conferir_rollback_postgres_isolado()
                    evidencias['etapas'].append('PostgreSQL: falha SQL controlada, rollback e conexão saudável')
                    # SQL independente da API: rejeição não cria órfãos nem duplica medições.
                    js = r'''const {Client}=require('pg');const db=new Client({connectionString:process.env.DATABASE_URL});
                    (async()=>{await db.connect();try{const q=await db.query(`SELECT ocorrencia_id AS id, quantidade::text AS qtd
                      FROM atividade_ocorrencia_medicoes WHERE atividade_id=$1 AND contrato_id=$2 ORDER BY ocorrencia_id`,
                      [process.argv[1],process.argv[2]]);const v=await db.query(`SELECT "ocorrenciaId" AS id FROM atividade_ocorrencias
                      WHERE "atividadeId"=$1`,[process.argv[1]]);process.stdout.write(JSON.stringify({medicoes:q.rows,vinculos:v.rows}));
                    }finally{await db.end()}})().catch(e=>{process.stderr.write(e.message);process.exit(1)});'''
                    cmd = ['docker', 'compose', 'exec', '-T', 'backend', 'node', '-e', js, aid, a.contrato_id]
                    proc = subprocess.run(cmd, cwd=RAIZ, text=True, capture_output=True, check=False)
                    exigir(proc.returncode == 0, 'Consulta SQL R28 falhou: ' + proc.stderr[-200:])
                    dados_sql = json.loads(proc.stdout)
                    exigir(dados_sql['medicoes'] == [{'id': oq2, 'qtd': '2.000'}],
                          'PostgreSQL reteve medição antiga ou perdeu a medição aprovada.')
                    exigir(oq not in [v['id'] for v in dados_sql['vinculos']],
                          'PostgreSQL manteve vínculo N:N removido.')
                    evidencias['etapas'].append('PostgreSQL: medição B preservada; A ausente dos vínculos e da tabela')
                evidencias['ids'] = {'ocorrencia': oq, 'outraOcorrencia': oq2, 'atividade': aid, 'lancamento': lancamento,
                                    'ocorrenciaConcorrente': concorrente['id']}
                evidencias['status'] = 'APROVADO'
                context.close()
            finally:
                navegador.close()
    except Exception as exc:
        evidencias['erro'] = f'{type(exc).__name__}: {str(exc)[:350]}'
        evidencias['status'] = 'REPROVADO'
        raise
    finally:
        if a.saida:
            a.saida.parent.mkdir(parents=True, exist_ok=True)
            a.saida.write_text(json.dumps(evidencias, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(evidencias, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
