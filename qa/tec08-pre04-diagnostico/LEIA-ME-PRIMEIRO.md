# TEC08 — Kit de diagnóstico pré-TEC08-04 (sem patch)

**Finalidade:** reproduzir e registrar os problemas encontrados na exportação `tec-08` antes de escrever qualquer correção. O ZIP contém **apenas arquivos novos na pasta `qa/tec08-pre04-diagnostico/`**. Não modifica `backend/src`, `frontend/src`, migrations, usuários, dados ou autenticação.

## Arquivos esperados

- `EXECUTAR-DIAGNOSTICO.sh`: comandos de testes no Docker já existente.
- `verificar_snapshot.py` e `snapshot-fingerprints.json`: 28 hashes de fontes de código/QA da versão auditada.
- `RELATORIO-TECNICO.md`: diagnóstico e critérios para correção posterior.

## Instalação segura no Linux

Na pasta do projeto `~/Documents/projetos/project-01-bcc5005`, faça uma inspeção do arquivo ZIP antes de extrair. Depois execute:

```bash
cd "$HOME/Documents/projetos/project-01-bcc5005"
unzip -n -q "$HOME/Downloads/tec08-diagnostico-pre04-04-11-2026.zip" -d .
bash qa/tec08-pre04-diagnostico/EXECUTAR-DIAGNOSTICO.sh --preflight
```

`-n` nunca sobrescreve arquivos já existentes. O diretório de QA é novo e tem um nome específico para evitar colisão. **O ZIP não instala dependências, não aplica patches e não executa migrations**.

## Reproduzir o erro conhecido

```bash
bash qa/tec08-pre04-diagnostico/EXECUTAR-DIAGNOSTICO.sh --target
```

A execução deve registrar a falha conhecida no teste de `formulario-entregavel.test.tsx`, caso o snapshot seja idêntico. Uma falha esperada **não é aceite**. Os logs são privados, em `qa/tec08-pre04-diagnostico/.local/execucoes/` (ignorado pelo Git). O script informa a localização.

## Verificar todas as unidades de build separadamente

```bash
bash qa/tec08-pre04-diagnostico/EXECUTAR-DIAGNOSTICO.sh --full
```

Este modo executa as seis verificações independentes: backend Jest, backend lint, Nest build, frontend Jest, frontend lint e Next build. **Ele não para na primeira falha**. Não roda E2E com banco e não cria dados sintéticos.

## Pré-voo de QA real — somente após revisar testes/builds

```bash
bash qa/tec08-pre04-diagnostico/EXECUTAR-DIAGNOSTICO.sh --qa-verificar
```

O modo `--qa-verificar` consulta a prontidão HTTP e o estado de migrations por `migration:show` e lê as contas QA privadas pelo executor existente. Não faz login com criação de dados e não aciona `--executar`. Requer `qa/hu07-06/.local/venv` e browsers **no computador real**, que podem estar ausentes dos ZIPs exportados porque são muito grandes.

O QA **com mutações** só será indicado após corrigir os defeitos e aprovar os gates. Os scripts existentes usam `--executar --confirmar-persistencia` e **criam contratos, entregáveis e comprovantes sintéticos persistentes**; não executá-los como simples diagnóstico.

## O que enviar na próxima conversa

Envie os resultados dos seis gates (códigos de saída e trechos relevantes dos logs, com segredos ocultados), o resultado do `--preflight` e os problemas encontrados. **Não envie** `.env`, `qa/**/.local`, `credenciais.json`, tokens, cookies, dumps ou capturas com dados identificáveis.

## Atenção com Git

Não execute `git add -A`, `git reset --hard`, `git clean`, `docker compose down -v` ou `migration:revert`. A exportação original contém ZIPs aninhados: o `qa/hu07-06.zip` inclui os 21 arquivos que poderiam aparecer como removidos se o ZIP não fosse expandido corretamente.
