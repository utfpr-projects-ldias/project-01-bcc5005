# HU05-05 — Validação de contratos, permissões e persistência

## Escopo

Validar a criação, consulta e edição de contratos, os DTOs, as regras
de vigência, as permissões, a auditoria e a persistência no PostgreSQL.

Exclusão e anexos não fazem parte do escopo desta issue.

## Testes automatizados

### DTOs

- Criação: campos obrigatórios, opcionais, tipos, enums e datas.
- Atualização parcial: omissão de campos e valores nulos.
- Rejeição de ID informado pelo cliente.
- Rejeição de propriedades financeiras e de outras propriedades
  não previstas nos DTOs.

### Serviço de contratos

- Criação com normalização de campos de texto.
- Vigência válida, inválida, virada de ano e anos bissextos.
- Atualização de vigência após combinação com o registro existente.
- Alterações de status e registros de auditoria.
- Tratamento de contrato inexistente e erros SQLSTATE.

### PostgreSQL e migration

- Aplicação inicial da migration de contratos.
- Reexecução pelo executor do TypeORM sem reaplicar migration registrada.
- Geração de UUID pelo banco.
- Persistência das datas civis.
- Restrição de término anterior ao início.
- Ausência de colunas financeiras.

A suíte de migration requer TEST_DATABASE_URL apontando para
um banco exclusivo de testes. Sem essa variável, ela é ignorada.

## Comandos locais

Executar na raiz do repositório:

    docker compose exec backend npx tsc --noEmit

    docker compose exec backend npm run lint

    docker compose exec backend npm test -- --runInBand

    docker compose exec backend npm run test:e2e -- --runInBand

Para executar a suíte de migration, configurar TEST_DATABASE_URL
no container backend com a URL do banco exclusivo de testes e executar:

    docker compose exec -e TEST_DATABASE_URL=postgresql://USUARIO:SENHA@database:5432/BANCO_TESTE backend npm run test:e2e -- --runInBand test/contratos-migration.e2e-spec.ts

Não usar o banco de produção ou um banco com dados que devam ser
preservados. O teste cria e remove um schema próprio.

## Fluxo manual

1. Autenticar como Administrador.
2. Criar um contrato somente com os campos obrigatórios.
3. Consultar a listagem e os detalhes do contrato criado.
4. Editar um campo e conferir os dados persistidos.
5. Conferir os eventos de criação e edição, incluindo ator e alterações.
6. Repetir as operações sem sessão e com Colaborador.
7. Testar usuário inativo, conta sem usuário de domínio e acesso
   a contrato alheio com ID manipulado.
8. Confirmar que operações negadas não alteram o banco nem revelam
   dados de contratos alheios.
9. Testar datas inválidas e propriedades financeiras extras.


## Resultado da execução

Cobertura do CRUD completo depende da integração das HU05-01/02/03/04
e TEC07-02/03.