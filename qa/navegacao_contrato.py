"""Localizadores comuns do workspace contratual (desktop e menu compacto)."""


def localizar_pagina(page, nome):
    desktop = page.locator('.pi-nav-desktop')
    mobile = page.get_by_role('button', name='Abrir navegação do contrato', exact=True)
    desktop.or_(mobile).first.wait_for(state='attached', timeout=25000)
    # Os dois elementos coexistem no DOM, mas apenas um está visível pelo CSS.
    if desktop.is_visible():
        return desktop.get_by_role('button', name=nome, exact=True)
    mobile.wait_for(state='visible', timeout=25000)
    mobile.click()
    return page.locator('[data-pi-navegacao-direita][data-aberto="true"]').get_by_role('button', name=nome, exact=True)


def abrir_pagina(page, nome):
    localizar_pagina(page, nome).click()
    painel = {'Etapas': 'painel-etapas', 'Documentos': 'painel-documentos', 'Acompanhamento': 'painel-visao'}[nome]
    page.locator('#' + painel).wait_for(state='visible', timeout=25000)
