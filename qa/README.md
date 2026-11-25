# Central de testes — Sistema de Gestão de Execução Contratual

**Este é o único guia operacional de testes.** Os READMEs dentro de `qa/hu*`,
`qa/tec*` e `qa/regularizacao-*` documentam as issues históricas; não são
necessários para a execução diária. Não apagar esses roteiros: o executor
central ainda os utiliza.

## 1. Primeira execução em um computador novo (Linux)

Pré-requisitos instalados no sistema: **Git, Docker Engine + Docker Compose v2,
Python 3 com `venv` e `pip`, Bash**. Não é necessário instalar Node, PostgreSQL
ou Jest no host: são executados nos containers. Sua conta precisa poder usar o
Docker. O projeto deve ter sido clonado com as pastas `backend`, `frontend` e
`qa` (não baixe apenas `qa` separadamente).

Na raiz do repositório:

```bash
./configurar-testes
```

O comando configura automaticamente a `.env` *se ainda não existir*, gera
segredos locais, faz o build dos containers, cria o schema por migrations
**no banco DEV, aplicando apenas as migrations pendentes**, prepara Python, Playwright e Chromium,
carrega as contas sintéticas de QA da fixture versionada e cria o primeiro
Administrador por CLI offline *apenas se não houver um*. Não solicita e-mail,
senha ou `Enter` para login. Quando o projeto já está configurado, reutiliza
o `.env`, as contas e o banco, sem reset, backup ou troca de branch.

A fixture de contas é exclusiva do desenvolvimento local, e o arquivo
`qa/hu07-06/.local/credenciais.json` é gerado com permissão `0600`. Não o inclua
nos ZIPs de resultados. Se as credenciais DEV forem diferentes, edite esse
arquivo local; nunca use credenciais de produção.

Caso Docker não esteja iniciado, use `sudo systemctl start docker` e repita o
mesmo comando. Se a primeira configuração for parcialmente interrompida,
execute novamente `./configurar-testes`: os passos são reaplicáveis.

## 2. Três comandos oficiais

Execute na raiz, com Docker ligado:

| Comando | O que executa |
| --- | --- |
| `./back` | Todos os Jest de `backend/src`, os sete E2E HTTP, as **nove suítes E2E com bancos PostgreSQL separados**, Oxlint normal e com tipos, TypeScript, build, migrations em modo consulta e Git |
| `./front` | Todos os Jest de frontend, ESLint, TypeScript, build, todos `teste_*.py` e `test_*.py` do QA e **os fluxos reais de Chromium/API** (incluindo login, criação de funcionários/contratos, HU06/HU07, evidências, documentos, arquivamento e persistência) |
| `./testes-all` | Tudo que `./back` e `./front` fazem, em uma bateria e em um único ZIP de resultados |

Os três usam `qa/central/executar.sh` e preservam logs completos de cada
verificação. Não é preciso executar manualmente cada subpasta ou procurar
`README.md` por issue.

**Onde ficam os resultados:** `~/Downloads/TESTES-BACK-*.zip`,
`TESTES-FRONT-*.zip` ou `TESTES-ALL-*.zip`. Cada TXT contém o código de
saída real; o resumo diferencia `PASS`, `FAIL` e `SKIP`. Uma falha em um QA
não impede que outros QA independentes sejam executados. O comando retorna
código não zero se houver reprovações ou cenários ignorados.

## 3. Dados e efeitos esperados

- Backend E2E usa bancos de teste separados, com nomes guardados e URLs
  próprias; não altera as tabelas do banco DEV principal.
- Frontend real/QA pode criar ou modificar **contas, contratos, etapas,
  entregáveis, evidências e anexos sintéticos** no banco DEV; isso faz parte
  do teste de integração. A execução não apaga automaticamente esse histórico.
- O QA de persistência pode reiniciar `backend`/`frontend`; não elimina volumes.
- Nenhum comando de teste executa `docker compose down -v`, `reset --hard`,
  `git clean`, `migration:revert`, `push` ou `commit`.
- A aprovação dos Jest **não substitui** os resultados do Playwright real.
- A avaliação subjetiva de aparência e decisões formais de PR são externas
  ao QA funcional; não há formulário manual necessário ao `./testes-all`.

## 4. Estrutura

```text
./configurar-testes              configuração inicial idempotente
./back                          regressão completa backend
./front                         regressão completa frontend + QA real
./testes-all                    todas as verificações
qa/README.md                    este guia
qa/central/configurar.sh        configuração canônica
qa/central/executar.sh          executor único
qa/hu*/ qa/tec*/                roteiros históricos reutilizados
qa/regularizacao-r*/           testes de regressão antigos reutilizados
qa/**/.local/                  credenciais, Chromium, relatórios locais (Git ignore)
```

Para diagnosticar uma falha, procure o nome `FAIL(...)` no `00-RESUMO.txt` do
ZIP e abra o TXT correspondente. **Não altere um teste somente para deixá-lo
verde:** confronte o cenário com o código e a regra aprovada.

## 5. Manutenção

Novos arquivos Jest (`*.spec.ts`, `*.test.tsx`) são descobertos pelos próprios
comandos npm. Novas suítes E2E HTTP ou com banco dedicado exigem atualização
da matriz em `qa/central/executar.sh` (a lista de nove E2E com banco contém
nomes e variáveis de ambiente próprios). Novos `teste_*.py` e `test_*.py` são descobertos
automaticamente. Para novos fluxos Chromium reais, acrescente a chamada na
seção `QA-REAL-*` do mesmo executor central.

**Não execute** `qa/tec08-uiux-final/RESET-TOTAL-DEV-SEM-BACKUP.sh` nem os
outros scripts de reset como parte da regressão normal; eles permanecem apenas
para manutenção deliberada.
