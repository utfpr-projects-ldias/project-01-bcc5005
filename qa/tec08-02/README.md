# TEC08-02 — QA integrado real, sem IDs ou tokens manuais

Este executor segue o padrão já existente em `qa/hu07-06` e `qa/preparar-qa`: **Chromium Playwright → login real Next/SuperTokens → API NestJS → PostgreSQL**, sem `mock`, sem `localStorage` artificial e sem credenciais no relatório.

## Pré-requisitos reutilizados

- Branch **`tec-08`**; TEC08-01 e TEC08-02 aplicadas; migration `CriarDocumentosContratuais1793900000000` já marcada `[X]`.
- Os quatro serviços Docker Compose em execução em `localhost:3000/3001`, PostgreSQL e SuperTokens.
- As contas descartáveis ADMIN, GESTOR e COLABORADOR cadastradas e configuradas no arquivo privado **já utilizado pela HU07-06**: `qa/hu07-06/.local/credenciais.json` (0600; ignorado pelo Git). Não cole senha/token no terminal.
- Chromium/Playwright instalado em `qa/hu07-06/.local/venv/` e navegador em `qa/hu07-06/.local/browsers` (mesmo ambiente da HU07-06).
- Backup de desenvolvimento anterior à execução e ambiente não produtivo. O executor não faz backups sozinho e não altera migrations.

## Execução — sem informar IDs

```bash
cd "$HOME/Documents/projetos/project-01-bcc5005"

# Pré-voo somente leitura: não grava nada
bash qa/tec08-02/VALIDAR-INTEGRACAO-REAL.sh --verificar

# Fluxo real completo com confirmação explícita de persistência de dados QA
bash qa/tec08-02/VALIDAR-INTEGRACAO-REAL.sh --executar --confirmar-persistencia
```

O pré-voo aguarda automaticamente o backend e o frontend após `docker compose restart`, inclusive se a primeira conexão for recusada/resetada (até 120 segundos). Falhas HTTP estáveis continuam reprovando.

O script cria **seus próprios dois contratos sintéticos identificados QA**, cria dois `.txt` inofensivos, encontra os três usuários pelo cadastro de teste, autentica via formulário real e verifica:

1. Acesso público 401, migration aplicada, três contas de QA distintas.
2. ADMIN: upload 201, download 200 com SHA-256 idêntico, `nosniff` e anexo, detalhe e paginação, `storageKey` ausente.
3. Anti-IDOR com **dois contratos reais existentes**, incluindo ADMIN com acesso a ambos: documento do contrato A sob URL do B retorna 404.
4. GESTOR: sem vínculo é negado; com edição em A envia documento; com leitura em B não envia; logout gera 401.
5. COLABORADOR: sem vínculo negado; com vínculo lê/baixa em A mas não anexa; sem vínculo em B não lê/baixa.
6. PostgreSQL `BEGIN READ ONLY`: FKs, autores, categorias, tamanhos, SHA-256 e auditoria `DOCUMENTO_ANEXADO` vinculada ao contrato correto, sem `storageKey` no evento; nenhum documento de A aparece em B.
7. Revogação dos **vínculos temporários criados nos contratos de QA**, seguida de novo login e conferência de que ambos os perfis voltaram a não acessar A/B, mesmo em caso de falha. Se a revogação falhar, o resultado é REPROVADO e o relatório identifica os contratos afetados.

**Os dois contratos e dois documentos de QA permanecem no banco/volume.** Não existe DELETE de contratos/documentos nesta sub-issue; não apague o histórico com SQL para limpar o teste. Execute uma única vez por ciclo de QA que queira manter documentado. Em caso de execução parcial, o relatório identifica os registros de QA para triagem. Não execute no ambiente de produção.

O resultado fica **fora do Git**, com diretório 0700 e arquivo 0600, em `qa/tec08-02/.local/execucoes/<identificador>/resultado.json`, contendo apenas IDs sintéticos e provas técnicas. O relatório jamais contém cookies, senhas, chaves do volume, cabeçalhos Authorization ou token SuperTokens.

Teste offline do executor, sem ambiente Docker:

```bash
PYTHONPATH="qa/tec08-02:qa/hu07-06" python3 -m unittest -v qa/tec08-02/teste_validar_integracao.py
```

**Limite do QA:** este ciclo é integração de backend documental com navegador autenticado, não é teste de interface gráfica de documentos (TEC08-03) nem garante 100% do plano de segurança (TEC08-04/05). Não marca uma sub-issue como integrada ao `develop` ou homologada pelo cliente.

## Estratégia de permissões e dados

O teste **não apaga todos os vínculos pré-existentes** de usuários ou contratos do projeto. Isso não é necessário para testar ausência de acesso: os contratos A e B são criados agora pelo ADMIN e, ao nascerem, não têm vínculo de GESTOR/COLABORADOR. O QA comprova esse estado, concede o acesso estritamente necessário, testa as políticas, revoga só o que ele próprio criou e revalida a negação. Isso mantém os outros contratos e autorizações de desenvolvimento inalterados.

Os documentos e contratos sintéticos permanecem depois do QA porque o domínio atual ainda não fornece exclusão auditável. O relatório identifica os UUIDs de fixtures. Uma execução anterior reprovada pode ter deixado fixtures com prefixo `QA-TEC08-02`, sem que isso indique falha do novo teste.

Se o pré-voo expirar por indisponibilidade, a falha será explícita e não gerará nenhuma fixture. Conferir logs do backend é diagnóstico de runtime, não uma etapa manual de teste de autorização.
