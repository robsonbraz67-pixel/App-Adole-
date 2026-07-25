import { Component, type ErrorInfo, type ReactNode } from 'react';

// O projeto não tem @types/react instalado (nada mais aqui usa componente de
// classe, então nunca precisou); com allowJs, TS infere 'Component' a partir
// do .js puro e o resultado não é genérico — extends Component<P,S> perde os
// membros herdados (state/props/setState). O cast para 'any' é só para dar a
// TypeScript uma base da qual herdar sem restrição; os campos abaixo continuam
// tipados normalmente.
const ComponentBase = Component as any;
import { BUILD_ID, buscarBuildPublicado, recarregar } from './version';

// Rede de segurança: sem isto, qualquer erro de render derruba a árvore inteira
// e a pessoa fica olhando uma tela branca, sem saber o que fazer nem o que
// aconteceu — foi o que motivou o pedido de "não quebrar na hora das perguntas".
//
// Além de mostrar uma saída, checa se o erro veio de versão velha em memória:
// se já existe build novo publicado, recarrega sozinho, porque nesse caso o
// erro provavelmente já está corrigido.
type Props = { children: ReactNode };
type State = { erro: Error | null; recarregando: boolean };

export class ErrorBoundary extends ComponentBase {
  props!: Props;
  state: State;

  constructor(props: Props) {
    super(props);
    this.state = { erro: null, recarregando: false };
  }

  static getDerivedStateFromError(erro: Error): Partial<State> {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Erro não tratado:', erro, info.componentStack);
    // Versão nova no ar? Então a tela quebrada é código velho: atualiza.
    buscarBuildPublicado().then(publicado => {
      if (publicado && publicado !== BUILD_ID) {
        this.setState({ recarregando: true });
        setTimeout(recarregar, 1200);
      }
    });
  }

  render() {
    if (!this.state.erro) return this.props.children;

    return (
      <div style={{minHeight:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 24px', textAlign:'center', color:'var(--txt2)', fontFamily:'Poppins,sans-serif'}}>
        <div style={{fontSize:56, marginBottom:16}}>{this.state.recarregando ? '⬆️' : '😕'}</div>
        <div style={{fontSize:20, fontWeight:900, color:'var(--txt)', marginBottom:10}}>
          {this.state.recarregando ? 'Atualizando o app...' : 'Algo deu errado'}
        </div>
        <div style={{fontSize:14, lineHeight:1.6, marginBottom:28, maxWidth:340}}>
          {this.state.recarregando
            ? 'Saiu uma versão nova. Estamos carregando ela agora — só um instante.'
            : 'Seu progresso está salvo. Recarregar costuma resolver; se continuar, avise a liderança da classe.'}
        </div>
        {!this.state.recarregando && (
          <button className="btn btn-gold" onClick={recarregar} style={{width:'auto', display:'inline-flex'}}>
            🔄 Recarregar
          </button>
        )}
        <div style={{fontSize:10, color:'var(--mut)', marginTop:28, opacity:.7}}>versão {BUILD_ID}</div>
      </div>
    );
  }
}
