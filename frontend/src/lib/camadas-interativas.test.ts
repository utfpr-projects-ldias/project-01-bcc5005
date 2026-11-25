import { registrarCamada } from './camadas-interativas';
test('Escape consome apenas a camada superior; repetição não fecha o pai',()=>{
 const pai=document.createElement('div'),filho=document.createElement('div');document.body.append(pai,filho);
 const fecharPai=jest.fn(),fecharFilho=jest.fn();
 const retirarPai=registrarCamada(document,()=>pai,fecharPai,100),retirarFilho=registrarCamada(document,()=>filho,fecharFilho,150);
 try {filho.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));expect(fecharFilho).toHaveBeenCalledTimes(1);expect(fecharPai).not.toHaveBeenCalled();retirarFilho();pai.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true,repeat:true}));expect(fecharPai).not.toHaveBeenCalled();pai.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));expect(fecharPai).toHaveBeenCalledTimes(1);}finally{retirarFilho();retirarPai();pai.remove();filho.remove();}
});

test('a pilha visual prevalece sobre prioridade estática e ignora camadas ocultas',()=>{
 const menu=document.createElement('div'),modal=document.createElement('div');
 Object.assign(menu.style,{position:'fixed',zIndex:'49'});Object.assign(modal.style,{position:'fixed',zIndex:'150'});
 document.body.append(menu,modal);const fecharMenu=jest.fn(),fecharModal=jest.fn();
 const removerMenu=registrarCamada(document,()=>menu,fecharMenu,1000),removerModal=registrarCamada(document,()=>modal,fecharModal,100);
 try {modal.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));expect(fecharModal).toHaveBeenCalledTimes(1);expect(fecharMenu).not.toHaveBeenCalled();modal.setAttribute('aria-hidden','true');menu.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));expect(fecharMenu).toHaveBeenCalledTimes(1);}finally{removerModal();removerMenu();menu.remove();modal.remove();}
});
