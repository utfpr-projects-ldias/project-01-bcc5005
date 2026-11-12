"""Interações testáveis com o contrato atual da interface TEC08.

Não importa Playwright nem armazena segredos. Recebe locators do navegador real.
"""


def anexar_primeiro_comprovante(modal, *, nome: str, conteudo: bytes, mime: str = 'text/plain') -> None:
    """Seleciona no input oculto antes de confirmar: o form é condicional.

    No produto atual, o clique no clipe abre o seletor nativo; apenas após
    escolher um arquivo aparece o form Anexar comprovante.
    """
    seletor = modal.locator('input[type="file"][aria-label="Selecionar arquivo"]')
    if seletor.count() != 1:
        raise AssertionError('Input de arquivo não disponível no modal editável')
    if modal.get_by_role('form', name='Anexar comprovante').count() != 0:
        raise AssertionError('Form de upload apareceu antes da seleção de arquivo')
    seletor.set_input_files({'name': nome, 'mimeType': mime, 'buffer': conteudo})
    formulario = modal.get_by_role('form', name='Anexar comprovante')
    formulario.wait_for(state='visible', timeout=10000)
    formulario.get_by_text(nome, exact=True).wait_for(timeout=10000)
    formulario.get_by_role('button', name='Anexar', exact=True).click()
    formulario.wait_for(state='hidden', timeout=15000)
