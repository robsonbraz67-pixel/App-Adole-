import { Component, type ErrorInfo, type ReactNode } from 'react';

// O projeto não tem @types/react instalado (nada mais aqui usa componente de
// classe, então nunca precisou); com allowJs, TS infere 'Component' a partir
// do .js puro e o resultado não é genérico — extends Component<P,S> perde os
// membros herdados (state/props/setState). O cast para 'any' é só para dar a
// TypeScript uma base da qual herdar sem restrição; os campos abaixo continuam
// tipados normalmente.
const ComponentBase = Component as any;
import { BUILD_ID, buscarBuildPublicado, recarregar } from './version';
import { registrarErro, reportarProblema } from './errorLog';

// Rede de segurança: sem isto, qualquer erro de render derruba a árvore inteira
// e a pessoa fica olhando uma tela branca, sem saber o que fazer nem o que
// aconteceu — foi o que motivou o pedido de "não quebrar na hora das perguntas".
//
// Além de mostrar uma saída, checa se o erro veio de versão velha em memória:
// se já existe build novo publicado, recarrega sozinho, porque nesse caso o
// erro provavelmente já está corrigido.
type Props = { children: ReactNode };
type State = { erro: Error | null; recarregando: boolean; detalhe: string; relato: string; enviandoRelato: boolean; relatoEnviado: boolean };

export class ErrorBoundary extends ComponentBase {
  props!: Props;
  state: State;

  constructor(props: Props) {
    super(props);
    this.state = { erro: null, recarregando: false, detalhe: '', relato: '', enviandoRelato: false, relatoEnviado: false };
  }

  static getDerivedStateFromError(erro: Error): Partial<State> {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Erro não tratado:', erro, info.componentStack);
    // O console de um celular é inalcançável para quem está usando o app: dois
    // alunos relataram esta tela e não havia como saber O QUE quebrou. Agora a
    // mensagem fica visível na própria tela, para caber num print — é a
    // diferença entre depurar por palpite e depurar com o erro na mão.
    const linhaComponente = (info.componentStack || '').trim().split('\n')[0] || '';
    const detalhe = `${erro?.name || 'Erro'}: ${erro?.message || erro}\n${linhaComponente}`.trim();
    this.setState({ detalhe });
    // Log automático: se ninguém mandar print, ainda existe registro do que quebrou.
    registrarErro('boundary', erro?.message || String(erro), `${detalhe}\n${info.componentStack || ''}`.trim());
    // Versão nova no ar? Então a tela quebrada é código velho: atualiza.
    buscarBuildPublicado().then(publicado => {
      if (publicado && publicado !== BUILD_ID) {
        this.setState({ recarregando: true });
        setTimeout(recarregar, 1200);
      }
    });
  }

  enviarRelato = async () => {
    this.setState({ enviandoRelato: true });
    const ok = await reportarProblema(this.state.relato, this.state.detalhe);
    this.setState({ enviandoRelato: false, relatoEnviado: ok });
    if (!ok) alert('Não foi possível enviar agora. Tente de novo em instantes.');
  };

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
        {!this.state.recarregando && this.state.detalhe && (
          <div style={{marginTop:24, maxWidth:340, width:'100%'}}>
            <div style={{fontSize:11, color:'var(--mut)', marginBottom:6}}>
              Se continuar acontecendo, mande um print desta parte:
            </div>
            <pre style={{
              fontSize:10, lineHeight:1.5, textAlign:'left', color:'var(--txt2)',
              background:'var(--g3)', border:'1px solid var(--b3)', borderRadius:10,
              padding:'10px 12px', whiteSpace:'pre-wrap', wordBreak:'break-word',
              maxHeight:160, overflow:'auto', fontFamily:'ui-monospace,Menlo,monospace',
            }}>{this.state.detalhe}</pre>
          </div>
        )}
        {!this.state.recarregando && (
          <div style={{marginTop:20, maxWidth:340, width:'100%'}}>
            {this.state.relatoEnviado ? (
              <div style={{fontSize:13, color:'var(--txt2)'}}>✅ Relato enviado. Obrigado — isso já chegou para a equipe.</div>
            ) : (
              <>
                <textarea
                  value={this.state.relato}
                  onChange={(e: any) => this.setState({ relato: e.target.value })}
                  placeholder="O que você estava fazendo quando isso aconteceu? (opcional)"
                  rows={3}
                  style={{width:'100%', padding:10, borderRadius:10, background:'var(--input-bg,rgba(0,0,0,.2))', color:'var(--txt)', border:'1px solid var(--input-border,var(--b3))', fontSize:13, resize:'vertical', marginBottom:10, fontFamily:'inherit'}}
                />
                <button
                  className="btn btn-ghost"
                  disabled={this.state.enviandoRelato}
                  onClick={this.enviarRelato}
                  style={{width:'100%'}}
                >
                  {this.state.enviandoRelato ? 'Enviando...' : '📨 Relatar este erro para a equipe'}
                </button>
              </>
            )}
          </div>
        )}
        <div style={{fontSize:10, color:'var(--mut)', marginTop:28, opacity:.7}}>versão {BUILD_ID}</div>
      </div>
    );
  }
}
