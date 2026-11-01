#!/usr/bin/env python3
"""QA real HU07-06 e HU06-05, do zero, por contas DEV provisionadas.

Requer consentimento explícito para novas etapas/entregáveis permanentes. Reúne
somente JSONs de evidência e logs de QA em ZIP local, excluindo segredos.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import uuid
from zipfile import ZipFile, ZIP_DEFLATED

RAIZ = Path(__file__).resolve().parents[2]
QA = RAIZ / 'qa'
HU07 = QA / 'hu07-06'
HU06 = QA / 'hu06-05'
LOCAL = QA / '.local' / 'execucoes'
PYTHON = HU07 / '.local' / 'venv' / 'bin' / 'python'
MODOS = {'sem vínculo': 'revogar', 'somente leitura': 'leitura', 'edição': 'edicao'}
PERFIS = ('administrador', 'gestor-edicao', 'gestor-leitura', 'colaborador', 'sem-vinculo')


def uuid_valido(valor: str) -> str:
    try:
        return str(uuid.UUID(valor))
    except (ValueError, TypeError, AttributeError) as e:
        raise argparse.ArgumentTypeError('UUID inválido') from e


def opcoes(argv=None):
    ap = argparse.ArgumentParser(description='Executa TODOS os QA automatizados reais de HU06-05/HU07-06; manual fica pendente')
    ap.add_argument('--contrato-id', required=True, type=uuid_valido)
    ap.add_argument('--outro-contrato-id', required=True, type=uuid_valido,
                    help='Segundo contrato existente, com etapa para teste anti-IDOR')
    ap.add_argument('--confirmar-alteracoes', action='store_true',
                    help='Confirma 4 etapas HU06 + 2 etapas HU07 + 10 entregáveis persistentes e alterações temporárias de vínculos')
    ap.add_argument('--login-automatico-bootstrap', action='store_true', help='Não aguardar ENTER; autentica Admin pelo arquivo local')
    ap.add_argument('--adicional', action='append', default=[], help='Funcionário extra NOME,EMAIL,PERFIL')
    ap.add_argument('--pular-regressoes', action='store_true', help='Somente para diagnóstico, não é ciclo final completo')
    a = ap.parse_args(argv)
    if not a.confirmar_alteracoes:
        ap.error('Requer --confirmar-alteracoes: as etapas e entregáveis de QA são persistidos')
    if a.contrato_id == a.outro_contrato_id:
        ap.error('Contrato de IDOR deve ser distinto do contrato principal')
    return a


def status_json(caminho: Path, *, hu07: bool = True) -> dict:
    dado = json.loads(caminho.read_text(encoding='utf-8'))
    if dado.get('status') != 'APROVADO' or (hu07 and dado.get('tipoTeste') != 'NAVEGADOR_REAL_SEM_MOCK'):
        raise ValueError(f'Cenário não aprovado: {caminho.name}')
    return dado


def estado_de_consulta(texto: str) -> str:
    estados = re.findall(r'^Antes: (.*)$', texto, flags=re.MULTILINE)
    if len(estados) != 1 or estados[0] not in MODOS:
        raise ValueError('Estado de vínculo não reconhecido; abortando escrita')
    return estados[0]


def zip_evidencias(saida: Path, qa07: Path, qa06: Path | None, status: dict, logs: Path) -> Path:
    """Allowlist estrita: somente relatórios JSON e logs desta execução."""
    pacote = saida / 'EVIDENCIAS-REAL-HU06-HU07-PARA-ENVIO.zip'
    permitidos_hu07 = {'administrador-retomado.json', 'gestor-edicao-final.json',
                       'gestor-leitura-final.json', 'colaborador-final.json', 'sem-vinculo-final.json'}
    with ZipFile(pacote, 'w', ZIP_DEFLATED) as z:
        for p in sorted(qa07.glob('*.json')):
            if p.is_file() and p.name in permitidos_hu07:
                z.write(p, 'hu07-06/' + p.name)
        if qa06 and qa06.is_dir():
            for p in sorted(qa06.iterdir()):
                if p.is_file() and (
                    (p.suffix == '.json' and (p.name.startswith('hu06-05-') or p.name in ('resumo.json', 'registro-visual.json')))
                    or (p.suffix == '.log' and p.name.startswith('gate-hu06-05'))
                ):
                    z.write(p, 'hu06-05/' + p.name)
        for p in sorted(logs.glob('*.log')):
            if p.is_file():
                z.write(p, 'execucao/' + p.name)
        z.writestr('resumo-geral.json', json.dumps(status, ensure_ascii=False, indent=2) + '\n')
    pacote.chmod(0o600)
    return pacote


class Executor:
    def __init__(self, args):
        self.args = args
        identificador = datetime.now().strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6]
        self.saida = LOCAL / identificador
        self.saida.mkdir(mode=0o700, parents=True, exist_ok=False)
        self.saida.chmod(0o700)
        self.qa07 = HU07 / '.local' / 'relatorios' / identificador
        self.qa07.mkdir(mode=0o700, parents=True, exist_ok=False)
        self.qa07.chmod(0o700)
        self.logs = self.saida / 'logs'
        self.logs.mkdir(mode=0o700)
        self.env = {**os.environ, 'PLAYWRIGHT_BROWSERS_PATH': str(HU07 / '.local' / 'browsers'),
                    'PYTHONUNBUFFERED': '1', 'PYTHONDONTWRITEBYTECODE': '1'}
        self.steps: list[dict] = []
        self.estados: dict[str, str] = {}
        self.restauracao: list[str] = []
        self.hu06_dir: Path | None = None

    def passo(self, nome: str, comando: list[str]) -> str:
        print(f'\n[QA INTEGRADO] {nome}', flush=True)
        log = self.logs / f'{len(self.steps)+1:02d}-{re.sub(r"[^a-z0-9-]", "-", nome.lower())}.log'
        linhas = []
        with log.open('x', encoding='utf-8') as f:
            log.chmod(0o600)
            pr = subprocess.Popen(comando, cwd=RAIZ, env=self.env, stdin=None,
                                  stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                  text=True, bufsize=1)
            assert pr.stdout is not None
            for linha in pr.stdout:
                print(linha, end='', flush=True)
                f.write(linha)
                linhas.append(linha)
            codigo = pr.wait()
        self.steps.append({'nome': nome, 'codigo': codigo, 'log': log.name})
        if codigo:
            raise RuntimeError(f'{nome}: código {codigo}; arquivo {log.name}')
        return ''.join(linhas)

    def vinculo(self, perfil: str, modo: str) -> str:
        sys.path.insert(0, str(HU07))
        from credenciais_locais import carregar_credenciais
        email, senha = carregar_credenciais(perfil)
        del senha
        cmd = [str(PYTHON), str(HU07 / 'ajustar_vinculo_qa.py'), '--contrato-id', self.args.contrato_id,
               '--email', email, '--modo', modo]
        if modo != 'consultar':
            cmd.append('--confirmar')
        return self.passo('vinculo-' + perfil + '-' + modo, cmd)

    def verificar_estado(self):
        # Estado inicial é registrado antes de QUALQUER mutação de vínculo.
        self.estados['gestor-edicao'] = estado_de_consulta(self.vinculo('gestor-edicao', 'consultar'))
        self.estados['colaborador'] = estado_de_consulta(self.vinculo('colaborador', 'consultar'))

    def restaurar(self):
        for perfil, estado in self.estados.items():
            try:
                atual = estado_de_consulta(self.vinculo(perfil, 'consultar'))
                if atual != estado:
                    self.vinculo(perfil, MODOS[estado])
                self.restauracao.append(f'{perfil}: restaurado para {estado}')
            except Exception as exc:
                self.restauracao.append(f'{perfil}: FALHA ao restaurar: {str(exc)[:180]}')

    def hu07_cenario(self, perfil: str, id_existente: str | None = None, escrita=False):
        nome = 'administrador-retomado' if perfil == 'administrador' else perfil + '-final'
        destino = self.qa07 / f'{nome}.json'
        cmd = [str(PYTHON), str(HU07 / 'validar_fluxo_real.py'), '--contrato-id', self.args.contrato_id,
               '--perfil', perfil, '--login-automatico', '--saida', str(destino)]
        if escrita:
            cmd += ['--escrita', '--confirmar-persistencia', '--validar-banco']
        else:
            cmd += ['--entregavel-id', id_existente or '', '--validar-banco'] if perfil != 'sem-vinculo' else ['--entregavel-id', id_existente or '']
        self.passo('hu07-06-' + perfil, cmd)
        return status_json(destino)

    def executar_hu07(self):
        admin = self.hu07_cenario('administrador', escrita=True)
        ids = admin.get('entregaveisCriados') or []
        if len(ids) != 5 or not all(isinstance(x, dict) and x.get('id') for x in ids):
            raise ValueError('Administrador não retornou cinco entregáveis válidos')
        id_existente = ids[0]['id']
        self.vinculo('gestor-edicao', 'edicao')
        self.hu07_cenario('gestor-edicao', escrita=True)
        self.vinculo('gestor-leitura', 'leitura')
        self.hu07_cenario('gestor-leitura', id_existente)
        self.vinculo('colaborador', 'leitura')
        self.hu07_cenario('colaborador', id_existente)
        self.vinculo('sem-vinculo', 'revogar')
        self.hu07_cenario('sem-vinculo', id_existente)
        arquivos = [str(self.qa07 / (('administrador-retomado' if perfil == 'administrador' else perfil + '-final') + '.json')) for perfil in PERFIS]
        self.passo('hu07-06-consolidacao-real', [str(PYTHON), str(HU07 / 'consolidar_evidencias.py'), *arquivos])

    def executar(self):
        if not PYTHON.is_file():
            raise ValueError('Playwright não instalado no projeto; use bash qa/hu07-06/INSTALAR-LOCAL.sh')
        # Por padrão, primeiro o Admin entra manualmente e aperta ENTER; sem senha em argumentos.
        bootstrap = [str(PYTHON), str(QA / 'preparar-qa' / 'provisionar_funcionarios.py'), '--confirmar']
        if self.args.login_automatico_bootstrap:
            bootstrap += ['--login-automatico']
        for adicional in self.args.adicional:
            bootstrap += ['--adicional', adicional]
        self.passo('bootstrap-funcionarios', bootstrap)
        self.passo('preflight', [str(PYTHON), str(HU07 / 'preflight.py')])
        if not self.args.pular_regressoes:
            self.passo('backend-e-frontend-regressoes-hu07', ['bash', str(HU07 / 'VALIDAR-HU07-06.sh'), str(RAIZ)])
            self.passo('regressoes-hu06-runner', [str(PYTHON), '-m', 'unittest', 'discover', '-s', str(HU06), '-p', 'teste_executar_tudo.py', '-v'])
            self.passo('regressoes-bootstrap', [str(PYTHON), '-m', 'unittest', 'discover', '-s', str(QA / 'preparar-qa'), '-p', 'teste_*.py', '-v'])
        self.verificar_estado()
        try:
            self.executar_hu07()
        finally:
            self.restaurar()
        if any('FALHA' in resultado for resultado in self.restauracao):
            raise RuntimeError('Permissões HU07 não puderam ser restauradas; não iniciar HU06')
        antigos = {p.resolve() for p in (HU06 / '.local' / 'execucoes').glob('*') if p.is_dir()} if (HU06 / '.local' / 'execucoes').exists() else set()
        # HU06 preserva/restaura permissões em finally e deixa o gate manual pendente.
        cmd = ['bash', str(QA / 'EXECUTAR-OUTROS-QA.sh'), '--contrato-id', self.args.contrato_id,
               '--outro-contrato-id', self.args.outro_contrato_id,
               '--confirmar-alteracoes', '--pular-regressoes']
        self.passo('hu06-05-cinco-perfis-e-acesso-cruzado', cmd)
        novos = [p for p in (HU06 / '.local' / 'execucoes').glob('*') if p.is_dir() and p.resolve() not in antigos]
        if len(novos) != 1:
            raise ValueError('Não foi possível identificar unicamente a nova execução HU06')
        self.hu06_dir = novos[0]
        resumo = json.loads((self.hu06_dir / 'resumo.json').read_text(encoding='utf-8'))
        if resumo.get('statusAutomatizado') != 'APROVADO':
            raise ValueError('HU06 não ficou aprovada na automação')
        for perfil in PERFIS:
            status_json(self.hu06_dir / f'hu06-05-{perfil}.json', hu07=False)
        status_json(self.hu06_dir / 'hu06-05-admin-cruzado.json', hu07=False)


def main(argv=None):
    args = opcoes(argv)
    executor = Executor(args)
    falha = None
    try:
        executor.executar()
    except Exception as erro:
        falha = str(erro).splitlines()[0][:400]
        print('[QA INTEGRADO] FALHA:', falha, file=sys.stderr, flush=True)
    resumo = {
        'inicioDiretorio': executor.saida.name, 'contratoId': args.contrato_id,
        'outroContratoId': args.outro_contrato_id,
        'statusAutomatizado': 'APROVADO' if falha is None else 'REPROVADO',
        'statusAceiteGlobalHU06': 'PENDENTE_INSPECAO_MANUAL' if falha is None else 'NÃO_CONCLUÍDO',
        'motivoFalha': falha, 'passos': executor.steps,
        'vinculosIniciaisHU07': executor.estados,
        'restauracaoHU07': executor.restauracao,
        'hu06Diretorio': str(executor.hu06_dir.relative_to(RAIZ)) if executor.hu06_dir else None,
        'fimUtc': datetime.now(timezone.utc).isoformat(),
    }
    resumo_path = executor.saida / 'resumo-geral.json'
    resumo_path.write_text(json.dumps(resumo, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    resumo_path.chmod(0o600)
    pacote = zip_evidencias(executor.saida, executor.qa07, executor.hu06_dir, resumo, executor.logs)
    print('\n[QA INTEGRADO] Diretório de execução:', executor.saida)
    print('[QA INTEGRADO] HU07-06 JSONs:', executor.qa07)
    print('[QA INTEGRADO] HU06-05 JSONs:', executor.hu06_dir if executor.hu06_dir else 'não concluído')
    print('[QA INTEGRADO] ZIP seguro para enviar:', pacote)
    print('[QA INTEGRADO] Aceite manual HU06 permanece pendente; não foi simulado.')
    return 1 if falha else 0


if __name__ == '__main__':
    sys.exit(main())
