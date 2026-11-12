# TEC08-04/05 — QA de integração, contas e recuperação DEV

Este diretório complementa, **não substitui**, os roteiros históricos em `qa/hu06-05`, `qa/hu07-06`, `qa/tec08-02`, `qa/tec08-03`, `qa/evidencias-verificacao` e `qa/tec08-uiux-final`.

## Por que mudou

`--qa-verificar` anteriormente aprovava com três **e-mails configurados**, sem provar autenticação. O administrador entrava e as outras duas contas recebiam *E-mail ou senha inválidos*. O provisionador `qa/preparar-qa/provisionar_funcionarios.py` já existia, mas só cria **contas ausentes** — nunca repara a senha de uma conta existente.

A atualização adiciona teste de login real e gate anterior a qualquer fixture persistente; mantém os scripts históricos e as 23 migrations, sem alterar Nest/Next/SuperTokens.

## Fechamento seguro TEC08-04 e TEC08-05 (branch atual)

A branch de trabalho `tec-08--04-05` é aceita por `qa/tec08-uiux-final/VALIDAR.sh`.
O QA existente cobre storage, upload/download, ACL, auditoria e a integração real; **não recriar esses fluxos**.

1. Sem gravar dados de domínio: `bash qa/tec08-uiux-final/VALIDAR.sh --preflight`, `--target` e `--full` (comandos separados).
2. Com serviços DEV ativos: `bash qa/tec08-uiux-final/VALIDAR.sh --qa-verificar` (autentica as três contas; cria sessões).
3. Somente no DEV e após o `--full` aprovar: `bash qa/tec08-uiux-final/VALIDAR.sh --qa-executar --confirmar-persistencia`. **Cria registros sintéticos persistentes.**
4. Depois, testar documento real no storage sem alterar nada: `python3 qa/tec08-04-05/validar_persistencia_reinicio.py --verificar`.
5. Com autorização explícita para interromper temporariamente Next/Nest: `python3 qa/tec08-04-05/validar_persistencia_reinicio.py --executar --confirmar-reinicio`.

A verificação de reinício seleciona o documento ativo mais recente (ou `--documento UUID`), compara SHA-256 do arquivo com o PostgreSQL **antes e depois** de `docker compose restart backend frontend` e compara todos os metadados documentais. Não executa `down`, `-v`, migrations, alteração de contas nem exclusões. Sem documento preexistente, execute antes o QA real do passo 3; a verificação falha em vez de criar dados ocultamente.

**Evidência para um único PR:** anotar o commit-base, os seis resultados de `--full`, os resultados de `--target`/`--qa-verificar`/`--qa-executar` e o teste de reinício. Os logs de QA permanecem em `qa/tec08-uiux-final/.local/execucoes/` (privados). Somente concluir TEC08-04 e TEC08-05 após verificar as saídas reais. Não é necessário executar a reconstrução destrutiva abaixo.

## Opção A — aproveitar o banco existente (sem apagar)

```bash
bash qa/tec08-uiux-final/VALIDAR.sh --qa-logins
# Se falhar, tentar criar apenas os funcionários ainda ausentes:
export PLAYWRIGHT_BROWSERS_PATH="$PWD/qa/hu07-06/.local/browsers"
qa/hu07-06/.local/venv/bin/python qa/preparar-qa/provisionar_funcionarios.py --login-automatico --confirmar
bash qa/tec08-uiux-final/VALIDAR.sh --qa-logins
```

Se o provisionador informar **EXISTENTE** e a autenticação continuar falhando, ele **não** redefiniu a senha. Use a opção B se os dados DEV forem descartáveis.

## Opção B — zerar e recriar TUDO, SEM backup (destrutivo)

```bash
bash qa/tec08-04-05/RECRIAR-DEV.sh --consultar
bash qa/tec08-04-05/RECRIAR-DEV.sh --executar
```

A execução exige terminal interativo e a confirmação textual `APAGAR_TUDO_TEC08_SEM_BACKUP`. Apaga **ambos os volumes Compose**, incluindo PostgreSQL, SuperTokens, sessões, contratos, arquivos documentais, usuários, auditoria e migrations aplicadas. Preserva arquivos do repositório, `.env`, Git e configuração privada de QA. Não gera backup.

Depois do reset, o roteiro executa as 23 migrations, compila o backend, cria o administrador via CLI **não interativa alimentada por stdin**, inicia os serviços, cadastra gestor e colaborador pela API auditada e valida os três logins.

**Nunca repita o reset para resolver uma falha de testes.** O script indica a fase em que parou; retome somente essa fase.

## A seguir, testar

```bash
bash qa/tec08-uiux-final/VALIDAR.sh --qa-logins
bash qa/tec08-uiux-final/VALIDAR.sh --target
bash qa/tec08-uiux-final/VALIDAR.sh --full
bash qa/tec08-uiux-final/VALIDAR.sh --qa-verificar
bash qa/tec08-uiux-final/VALIDAR.sh --qa-executar --confirmar-persistencia
```

`--target` agora inclui as nove famílias Python históricas (além de Jest). `--qa-verificar` executa 6 verificações, incluindo três **logins reais**. Estes logins criam apenas sessões; não criam contratos. `--qa-executar` também exige o gate de login antes das quatro jornadas de Chromium, que geram fixtures persistentes.

A versão headless é recomendada inicialmente para evitar fechamento involuntário das janelas de QA. Depois utilize `--visivel` se for necessário observar a interface.

## Contas DEV

A fixture versionada `qa/hu07-06/contas-dev-fixture.json`, criada pelo usuário, define os três e-mails e a senha *exclusivamente DEV*. `INSTALAR-LOCAL.sh` copia essa configuração para `.local/credenciais.json` com modo 0600 quando não existe. Copiar a fixture **não cadastra contas** no SuperTokens: use o provisionador ou o reset.

## Segurança operacional

Tudo está restrito ao Compose `project-01-bcc5005` e a URLs HTTP `localhost`/`127.0.0.1`. Nenhum script é destinado à produção. O JSON versionado contém uma senha compartilhada de teste; **não a reutilize em serviços ou ambientes reais**.

Para evidências, veja `AUDITORIA-QA-08-11-2026.md`. Não é necessário commitar antes de executar os testes; o manifesto atualizado aceita a branch `tec-08-04-05`.
