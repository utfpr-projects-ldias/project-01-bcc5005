# TEC08-03 — QA integrado real da interface de documentos

Reutiliza `qa/tec08-02/validar_integracao_real.py`, inclusive o pré-voo após restart,
a autenticação real no Chromium via `qa/hu07-06/.local`, a API de permissões e as
consultas SQL de auditoria. **Não há credenciais, IDs estáticos ou tokens versionados.**

## Execução

```bash
bash qa/tec08-03/VALIDAR-INTEGRACAO-REAL.sh --verificar
bash qa/tec08-03/VALIDAR-INTEGRACAO-REAL.sh --executar --confirmar-persistencia
```

O teste real, somente em ambiente DEV e com aceite explícito, cadastra contrato A
pelo formulário Next, contrato B sintético, envia um PDF principal válido e um TXT
anexo, compara os dois downloads, filtra/recarrega, testa falha de PDF inválido,
confere banco/auditoria e alterna perfis GESTOR/COLABORADOR. Revoga vínculos
concedidos apenas aos contratos próprios do QA. **Os contratos/documentos de teste
não são apagados**, preservando a rastreabilidade; backups e limpeza ficam fora do
script. A pasta `.local/execucoes/` é privada e ignorada pelo Git.

A TEC08-05 ainda é responsável pelo gate final de reinício/recriação não destrutiva,
resiliência/órfãos, UX visual ampliada e aceitação da issue-pai. O resultado do QA
não substitui a homologação do cliente nem resolve a política PQ-11.

## Diagnóstico do upload e Chromium visível (v3)

O executor inspeciona o `POST` de upload e guarda somente o código HTTP, categoria,
nome do arquivo sintético e UUID retornado. Se a API devolver HTTP 201 mas a UI não
mostrar a confirmação, a falha é explicitamente classificada como apresentação/React.
Se o backend responder HTTP 400/401/403/413/503, o relatório identifica esse status
sem capturar cookies, tokens, credenciais, bodies ou headers. Não há retry automático
de POST, evitando documentos duplicados em falhas intermitentes.

Com `DISPLAY` definido, abre Chromium **visível**, como o QA HU07-06.
Em CI, `--sem-janela` mantém headless; `--visivel` força GUI quando há X11.
Em falha, a captura `falha-ui.png` é salva apenas na pasta privada `.local/execucoes`,
com permissão 0600. **Não versionar nem compartilhar a captura sem revisão**, pois
pode mostrar informações de sessão na interface.

A fixture PDF passou a conter xref/trailer reais, para representar um PDF
sintético estruturalmente válido, sem dados pessoais.

## Correção de regressão das fixtures (v4)

A execução anterior falhou antes de enviar o PDF válido porque a descrição foi
passada como sexto argumento posicional de `arquivo_na_ui`, ocupando a posição
reservada ao MIME. O frontend rejeitou a seleção antes de fazer o POST, e o
Playwright aguardou inutilmente uma resposta HTTP. O PDF válido e o TXT agora
informam `mime=` e `descricao=` explicitamente; `mime` é parâmetro somente
nomeado, e a fixture é validada antes de interagir com o navegador.

O QA offline possui teste de regressão para os três uploads. O frontend usa
mensagens de formato e tamanho compreensíveis ao usuário, sem termos internos
como MIME, API ou identificadores de requisito. Não houve alteração no backend,
no banco ou na política de armazenamento.

## Validação modal v6

O QA mantém as provas anteriores e passa a operar o formulário real dentro de
`role=dialog`, fora da seção do painel (portal React). A execução confirma que
selecionar categoria/arquivo não desloca o scroll da página, que o retorno do
navegador/mouse fecha somente o modal preservando o contrato, e que Escape e clique
fora fecham o modal. Os testes de upload observam o POST exato e continuam sem
repeti-lo automaticamente. O cadastro e a associação do documento permanecem
etapas distintas; provas de execução (foto, relatório, link) fazem parte do fluxo de
evidências, não do documento contratual TEC08-03.


### QA v7 — estabilidade e seleção de arquivo

A suíte confirma que o botão visual **Escolher arquivo** continua vinculado ao input real, que a troca das categorias não desloca a rolagem e que o usuário não recebe dados de outra categoria durante carregamento. A proteção de sessão também possui testes Jest para retorno rápido e revalidação prolongada, sem colapsar a geometria das páginas.
