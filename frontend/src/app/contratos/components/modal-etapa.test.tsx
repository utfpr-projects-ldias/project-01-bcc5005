import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ModalEtapa } from './modal-etapa';

function Cenario({ ocupado = false }: { ocupado?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [origem, setOrigem] = useState<HTMLButtonElement | null>(null);
  return <div>
    <button type="button" onClick={(evento) => { setOrigem(evento.currentTarget); setAberto(true); }}>Editar etapa QA</button>
    {aberto && <ModalEtapa titulo="Editar etapa · QA" ocupado={ocupado} focoRetorno={origem} onFechar={() => setAberto(false)}>
      <form aria-label="Editar etapa QA"><label htmlFor="nome-qa">Nome</label><input id="nome-qa" defaultValue="QA" />
        <button type="button" onClick={() => setAberto(false)} disabled={ocupado}>Voltar sem salvar</button>
      </form>
    </ModalEtapa>}
  </div>;
}

test('abrir edição cria dialog, bloqueia scroll, Esc fecha e devolve foco ao botão de origem', () => {
  const scrollAntes = document.body.style.overflow;
  try {
    render(<Cenario />);
    const gatilho = screen.getByRole('button', { name: 'Editar etapa QA' });
    fireEvent.click(gatilho);
    const modal = screen.getByRole('dialog', { name: 'Editar etapa · QA' });
    expect(modal).toHaveAttribute('aria-modal', 'true');
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByRole('button', { name: 'Fechar edição da etapa' })).toHaveFocus();
    fireEvent.keyDown(modal, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(gatilho).toHaveFocus();
    expect(document.body.style.overflow).toBe(scrollAntes);
  } finally { document.body.style.overflow = scrollAntes; }
});

test('Voltar sem salvar fecha apenas o modal; não muda rota nem valores externos', () => {
  const rotaInicial = window.location.href;
  render(<Cenario />);
  fireEvent.click(screen.getByRole('button', { name: 'Editar etapa QA' }));
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Alterado não salvo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Voltar sem salvar' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(window.location.href).toBe(rotaInicial);
  fireEvent.click(screen.getByRole('button', { name: 'Editar etapa QA' }));
  expect(screen.getByLabelText('Nome')).toHaveValue('QA');
});

test('durante gravação o botão Fechar e a tecla Esc não podem encerrar o modal', () => {
  render(<Cenario ocupado />);
  fireEvent.click(screen.getByRole('button', { name: 'Editar etapa QA' }));
  const modal = screen.getByRole('dialog');
  expect(screen.getByRole('button', { name: 'Fechar edição da etapa' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Voltar sem salvar' })).toBeDisabled();
  fireEvent.keyDown(modal, { key: 'Escape' });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test.each(['x', 'fundo', 'voltar'] as const)('fechar modal por %s preserva foco, URL e scroll', (metodo) => {
  const rota = window.location.href;
  const original = document.body.style.overflow;
  render(<Cenario />);
  const abrir = screen.getByRole('button', { name: 'Editar etapa QA' });
  abrir.focus();
  fireEvent.click(abrir);
  const modal = screen.getByRole('dialog');
  expect(modal).toBeInTheDocument();
  if (metodo === 'x') fireEvent.click(screen.getByRole('button', { name: 'Fechar edição da etapa' }));
  else if (metodo === 'voltar') fireEvent.click(screen.getByRole('button', { name: 'Voltar sem salvar' }));
  else fireEvent.mouseDown(modal.parentElement!, { button: 0 });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(abrir).toHaveFocus();
  expect(window.location.href).toBe(rota);
  expect(document.body.style.overflow).toBe(original);
});

test('modal compartilhado aceita contexto documental sem alterar a semântica de etapa', () => {
  const fechar = jest.fn();
  const paddingAnterior = document.body.style.paddingRight;
  const view = render(<ModalEtapa titulo="Anexar documento contratual" contexto="Documentos do contrato"
    rotuloFechar="Fechar anexo de documento" ocupado={false} onFechar={fechar}>
    <p>Arquivo protegido</p>
  </ModalEtapa>);
  expect(screen.getByRole('dialog', { name: 'Anexar documento contratual' })).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByText('Documentos do contrato')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Fechar anexo de documento' }));
  expect(fechar).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(document.body.style.paddingRight).toBe(paddingAnterior);
});

function PilhaModais({ externo, interno }: { externo: boolean; interno: boolean }) {
  return <>
    {externo && <ModalEtapa titulo="Modal externo" ocupado={false} onFechar={() => {}}><p>Camada externa</p></ModalEtapa>}
    {interno && <ModalEtapa titulo="Modal interno" camada="aninhada" ocupado={false} onFechar={() => {}}><p>Camada interna</p></ModalEtapa>}
  </>;
}

test.each(['pai antes do filho', 'filho antes do pai'])(
  'rolagem nunca fica bloqueada após desmontar modais aninhados: %s', (sequencia) => {
    const anterior = document.body.style.overflow;
    const padding = document.body.style.paddingRight;
    const view = render(<PilhaModais externo interno />);
    expect(document.body.style.overflow).toBe('hidden');
    if (sequencia === 'pai antes do filho') {
      view.rerender(<PilhaModais externo={false} interno />);
      expect(document.body.style.overflow).toBe('hidden');
      view.rerender(<PilhaModais externo={false} interno={false} />);
    } else {
      view.rerender(<PilhaModais externo interno={false} />);
      expect(document.body.style.overflow).toBe('hidden');
      view.rerender(<PilhaModais externo={false} interno={false} />);
    }
    expect(document.body.style.overflow).toBe(anterior);
    expect(document.body.style.paddingRight).toBe(padding);
  },
);

test('botão lateral Voltar do mouse fecha somente a camada mais recente, preservando o pai', () => {
  function Pilha() {
    const [filho, setFilho] = useState(true);
    const [pai, setPai] = useState(true);
    return <>
      {pai && <ModalEtapa titulo="Etapa QA" ocupado={false} onFechar={() => setPai(false)}
        bloqueadoPorSubmodal={filho}><p>Etapa preservada</p></ModalEtapa>}
      {filho && <ModalEtapa titulo="Evidência QA" camada="evidencia" ocupado={false}
        onFechar={() => setFilho(false)}><p>Arquivo esperado</p></ModalEtapa>}
    </>;
  }
  render(<Pilha />);
  const filho = screen.getByRole('dialog', { name: 'Evidência QA' });
  fireEvent.mouseDown(filho.parentElement!, { button: 3 });
  expect(screen.queryByRole('dialog', { name: 'Evidência QA' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Etapa QA' })).toBeInTheDocument();
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.click(screen.getByRole('button', { name: 'Fechar edição da etapa' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('titulos longos nao expandem indefinidamente o cabecalho do modal', () => {
  const longo = `Relatorio ${'A'.repeat(90)}`;
  render(<ModalEtapa titulo={longo} contexto="Evidencia esperada" ocupado={false} onFechar={() => {}}>
    <p>Detalhe</p>
  </ModalEtapa>);
  const titulo = screen.getByRole('heading', { name: longo });
  expect(titulo).toHaveClass('line-clamp-2');
  expect(titulo).toHaveAttribute('title', longo);
});


test('Escape dentro do modal filho não fecha nem aciona a etapa ao fundo', () => {
  const aoFecharPai = jest.fn();
  const aoFecharFilho = jest.fn();
  render(<><ModalEtapa titulo="Etapa" ocupado={false} onFechar={aoFecharPai} bloqueadoPorSubmodal>
    <p>Etapa preservada</p></ModalEtapa>
    <ModalEtapa titulo="Entregável" ocupado={false} camada="aninhada" onFechar={aoFecharFilho}>
      <p>Entregável sobreposto</p></ModalEtapa></>);
  fireEvent.keyDown(screen.getByRole('dialog', { name: 'Entregável' }), { key: 'Escape' });
  expect(aoFecharFilho).toHaveBeenCalledTimes(1);
  expect(aoFecharPai).not.toHaveBeenCalled();
});


test('modal de evidência não reserva altura vazia; a rastreabilidade expandida usa scroll interno', () => {
  render(<ModalEtapa titulo="Evidência pequena" camada="evidencia" compacto ocupado={false} onFechar={() => {}}>
    <p>Comprovante verificado</p>
  </ModalEtapa>);
  const modal = screen.getByRole('dialog', { name: 'Evidência pequena' });
  expect(modal.className).not.toContain('min-h-[min(72dvh,630px)]');
  expect(modal.className).toContain('max-h-[min(64dvh,590px)]');
  expect(modal.querySelector('.overflow-y-auto')).toBeInTheDocument();
});


test('sobreposições são leves, com camadas distintas sem escurecimento cumulativo forte', () => {
  const { unmount } = render(<><ModalEtapa titulo="Etapa" ocupado={false} onFechar={() => {}}><p>Etapa</p></ModalEtapa>
    <ModalEtapa titulo="Entregável" camada="aninhada" ocupado={false} onFechar={() => {}}><p>Entregável</p></ModalEtapa>
    <ModalEtapa titulo="Evidência" camada="evidencia" ocupado={false} onFechar={() => {}}><p>Evidência</p></ModalEtapa></>);
  expect(screen.getByRole('dialog', { name: 'Etapa' }).parentElement).toHaveClass('bg-black/[0.04]', 'backdrop-blur-[0.5px]');
  expect(screen.getByRole('dialog', { name: 'Entregável' }).parentElement).toHaveClass('bg-black/[0.025]', 'backdrop-blur-[0.5px]');
  expect(screen.getByRole('dialog', { name: 'Evidência' }).parentElement).toHaveClass('bg-black/[0.025]', 'backdrop-blur-[0.5px]');
  for (const titulo of ['Etapa', 'Entregável', 'Evidência']) {
    const camada = screen.getByRole('dialog', { name: titulo }).parentElement!;
    expect(camada.className).not.toMatch(/bg-background\/(90|95)/);
  }
  unmount();
});


test('as tres camadas ficam centralizadas, etapa e entregavel com mesma largura e blur leve', () => {
  render(<><ModalEtapa titulo="Etapa alinhada" ocupado={false} onFechar={() => {}}><p>etapa</p></ModalEtapa>
    <ModalEtapa titulo="Entregável alinhado" camada="aninhada" ocupado={false} onFechar={() => {}}><p>entregável</p></ModalEtapa>
    <ModalEtapa titulo="Evidência alinhada" camada="evidencia" ocupado={false} onFechar={() => {}}><p>evidência</p></ModalEtapa></>);
  for (const [titulo, largura] of [
    ['Etapa alinhada', 'max-w-3xl'],
    ['Entregável alinhado', 'max-w-3xl'],
    ['Evidência alinhada', 'max-w-xl'],
  ]) {
    const dialogo = screen.getByRole('dialog', { name: titulo });
    expect(dialogo).toHaveClass(largura);
    expect(dialogo.parentElement).toHaveClass('items-center', 'justify-center');
    expect(dialogo.parentElement?.className).toContain('backdrop-blur-[0.5px]');
    expect(dialogo.parentElement?.className).not.toContain('items-start');
  }
});


test('modal filho centralizado mantém painel pai VISÍVEL, inativo e com sua seta de retorno', () => {
  function Navegar() {
    const [filho, setFilho] = useState(false);
    return <>
      <button onClick={() => setFilho(true)}>Abrir filho</button>
      <ModalEtapa titulo="Etapa pai" ocupado={false} onFechar={() => {}} bloqueadoPorSubmodal={filho}>
        <button type="button" onClick={() => {}}>Voltar etapa</button>
      </ModalEtapa>
      {filho && <ModalEtapa titulo="Entregável filho" camada="aninhada" ocupado={false}
        retornoEsquerda onFechar={() => setFilho(false)}><p>Conteúdo do entregável</p></ModalEtapa>}
    </>;
  }
  render(<Navegar />);
  fireEvent.click(screen.getByRole('button', { name: 'Abrir filho' }));
  const todos = Array.from(document.querySelectorAll<HTMLElement>('[data-tec08-modal]'));
  expect(todos).toHaveLength(2);
  const painelPai = todos[0].querySelector<HTMLElement>('[role="dialog"]')!;
  const painelFilho = todos[1].querySelector<HTMLElement>('[role="dialog"]')!;
  expect(painelPai).not.toHaveClass('invisible', 'opacity-0', 'hidden');
  expect(painelPai).toHaveClass('pointer-events-none');
  expect(todos[0]).toHaveClass('pointer-events-none');
  expect(painelPai).toHaveAttribute('aria-hidden', 'true');
  expect(painelFilho).not.toHaveClass('invisible');
  expect(painelPai).toHaveClass('max-w-3xl');
  expect(painelFilho).toHaveClass('max-w-3xl');
  expect(painelFilho.parentElement).toHaveClass('items-center');
  expect(painelPai.querySelector('button')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Fechar edição da etapa' }));
  expect(todos[0].querySelector('[role="dialog"]')).not.toHaveClass('invisible');
  expect(screen.getByRole('button', { name: 'Voltar etapa' })).toBeInTheDocument();
  expect(document.querySelectorAll('[data-tec08-modal]')).toHaveLength(1);
});


test('Etapa e entregável continuam renderizados e visíveis sob a evidência, sem sobreposição opaca', () => {
  render(<>
    <ModalEtapa titulo="Etapa de teste" ocupado={false} onFechar={() => {}} bloqueadoPorSubmodal alturaEstavel><p>Conteúdo original da etapa</p></ModalEtapa>
    <ModalEtapa titulo="Entregável de teste" camada="aninhada" ocupado={false} onFechar={() => {}} retornoEsquerda bloqueadoPorSubmodal><p>Conteúdo do entregável</p></ModalEtapa>
    <ModalEtapa titulo="Evidência de teste" camada="evidencia" ocupado={false} onFechar={() => {}}><p>Conteúdo da evidência</p></ModalEtapa>
  </>);
  const paineis = Array.from(document.querySelectorAll<HTMLElement>('[data-tec08-modal] [role="dialog"]'));
  expect(paineis).toHaveLength(3);
  expect(paineis.map(p => p.className)).not.toEqual(expect.arrayContaining([expect.stringContaining('invisible')]));
  for (const painel of paineis) {
    expect(painel).not.toHaveClass('invisible', 'opacity-0', 'hidden');
    expect(painel.parentElement).toHaveClass('items-center', 'justify-center');
  }
  expect(paineis[1].querySelector('[aria-label="Fechar edição da etapa"]')).toBeInTheDocument();
  expect(paineis[0]).toHaveClass('max-w-3xl');
  expect(paineis[1]).toHaveClass('max-w-3xl');
  expect(paineis[2]).toHaveClass('max-w-xl');
});


test('formulário longo permanece contido no viewport com scroll interno e cabeçalho fora do scroll', () => {
  render(<ModalEtapa titulo="Editar entregável longo" camada="aninhada" ocupado={false}
    formularioLongo ocultarFechar onFechar={() => {}}>
    <form aria-label="Edição longa"><input aria-label="Nome" />{Array.from({ length: 35 }, (_, n) => <p key={n}>Campo {n}</p>)}</form>
  </ModalEtapa>);
  const dialogo = screen.getByRole('dialog', { name: 'Editar entregável longo' });
  expect(dialogo).toHaveStyle({ maxHeight: 'calc(100dvh - 24px)', height: 'min(88dvh, 850px)' });
  expect(dialogo).toHaveClass('min-h-0', 'overflow-hidden');
  const corpo = dialogo.querySelector<HTMLElement>('[data-tec08-corpo-modal]')!;
  expect(corpo).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
  expect(dialogo.querySelector('header')).not.toBe(corpo);
  expect(corpo).toContainElement(screen.getByRole('form', { name: 'Edição longa' }));
});

test('trocar de consulta para edição longa inicia a rolagem no topo sem recriar o modal', () => {
  function Fluxo() {
    const [editando, setEditando] = useState(false);
    return <ModalEtapa titulo="Entregável" camada="aninhada" ocupado={false}
      formularioLongo={editando} onFechar={() => {}}>
      {editando ? <form><input aria-label="Código" /></form> : <button onClick={() => setEditando(true)}>Editar</button>}
    </ModalEtapa>;
  }
  render(<Fluxo />);
  const dialogo = screen.getByRole('dialog', { name: 'Entregável' });
  const corpo = dialogo.querySelector<HTMLElement>('[data-tec08-corpo-modal]')!;
  corpo.scrollTop = 400;
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  expect(screen.getByRole('dialog', { name: 'Entregável' })).toBe(dialogo);
  expect(corpo.scrollTop).toBe(0);
  expect(dialogo).toHaveStyle({ height: 'min(88dvh, 850px)' });
  expect(dialogo).toHaveAttribute('aria-modal', 'true');
});

test('submodal de arquivo não ultrapassa largura da evidência e preserva o contexto', () => {
  const view = render(<>
    <ModalEtapa titulo="Evidência esperada" camada="evidencia" ocupado={false}
      bloqueadoPorSubmodal onFechar={() => {}}><p>Contexto da evidência</p></ModalEtapa>
    <ModalEtapa titulo="Substituir comprovante" camada="edicao" ocupado={false}
      onFechar={() => {}}><p>Selecionar versão</p></ModalEtapa>
  </>);
  // aria-hidden remove o nome acessível do modal-pai enquanto o filho é ativo.
  // O contexto continua montado e visível: localizar pelo conteúdo não interativo.
  const pai = screen.getByText('Contexto da evidência').closest('[role="dialog"]');
  expect(pai).not.toBeNull();
  const filho = screen.getByRole('dialog', { name: 'Substituir comprovante' });
  expect(pai).toHaveClass('max-w-xl');
  expect(filho).toHaveClass('max-w-lg');
  expect(pai).toHaveAttribute('aria-hidden', 'true');
  expect(filho).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByText('Contexto da evidência')).toBeInTheDocument();
  view.unmount();
});

test('conclusão documental altera somente a borda e o título do modal para roxo', () => {
  const view = render(<ModalEtapa titulo="Detalhes verificados" concluido ocupado={false} onFechar={() => {}}>
    <p>Histórico preservado</p>
  </ModalEtapa>);
  const modal = screen.getByRole('dialog', { name: 'Detalhes verificados' });
  expect(modal).toHaveClass('border-violet-400/60');
  expect(screen.getByRole('heading', { name: 'Detalhes verificados' })).toHaveClass('text-violet-300');
  expect(screen.getByText('Histórico preservado')).toBeInTheDocument();
  view.unmount();
});
