# HU07-05 — Regressões dos cinco tipos, vínculos, permissões e checklist

**Origem**: Sprint 04 / HU07-05-TESTES-VALIDAR-CINCO-TIPOS-E-VINCULOS.md.

## O que este primeiro commit prova

- Jest no backend executa o contrato de autorização EXTRAÍDO dos decorators reais do controller; ADMIN, Gestor com/sem `podeEditar`, Colaborador e usuário sem vínculo. `responsavelId` não substitui PermissaoContrato.
- DTOs com `class-validator`: UUIDs, campos obrigatórios, checklist de 100 itens, flag obrigatória, PATCH nulo rejeitado.
- Jest no frontend garante a consistência do payload dos cinco tipos, a separação entre planejamento e execução, a configuração recorrente V1 e erros de entrada.
- E2E isolado em PostgreSQL real (`app_hu07_test`, schema único descartável) cobre persistência dos cinco tipos, quantidade decimal, FK composta de contrato/etapa, tipos/recorrência inválidos, checklist e leitura em segunda conexão.

## O que fica para o segundo commit (HU07-06)

- Navegador e SuperTokens reais, sem mocks: fluxo completo de cada tipo, perfis e HTTP 401/403/404, reload, comparação com PostgreSQL e resultados QA.
- A edição com ocorrências já executadas depende da HU09, que ainda não cria tais ocorrências; a HU07-05 só verifica o comportamento de proteção que já existe no serviço, sem fabricar dados de execução.
- Não afirmar que o checklist esperado equivale a evidência real ou comprovação concluída. A trilha de auditoria é verificada por testes do módulo e deverá ser conferida com persistência real durante HU07-06.

## Banco isolado

`TESTAR-HU07-05-ISOLADO.sh` cria **somente** `app_hu07_test` quando não existir, no mesmo servidor PostgreSQL do Docker, executa Jest E2E, e cada teste usa schema descartável sob esse banco. Não aponta para o DB de desenvolvimento e não chama migration:run.

## Execução

```bash
bash /tmp/hu07-passo5/VALIDAR-HU07-05.sh "$PWD"
```

Rode esse comando dentro da raiz do repositório. Depois dos resultados positivos, adicione somente este primeiro commit à branch da HU07-05 e deixe HU07-06 para um segundo commit no mesmo PR.

**Escopo:** testes e automação de QA. README principal, migrations, backend operacional, frontend operacional e dados do DB de desenvolvimento permanecem intocados.
