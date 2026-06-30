import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DEMO, LICOES } from './data';
import { gs, ss, uid, AVTS, xpSpeed, getDiaId, getMsgRes, calcPos, PROG0, shareApp, playSound, formatDiaSemana } from './utils';

/* ===== CONFETTI ===== */
const CONFETTI_CORES = ['#F7C600','#E5006D','#1E9E86','#4A90D9','#FFE566','#C50060','#1B3A63'];

export const Confetti = ({ show }: { show: boolean }) => {
  const ps = useMemo(() => Array.from({ length: 60 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: CONFETTI_CORES[i % CONFETTI_CORES.length],
    dur: 2 + Math.random() * 2,
    delay: Math.random() * .8,
    size: 7 + Math.random() * 9,
    br: Math.random() > .5 ? '50%' : '3px'
  })), []);
  if (!show) return null;
  return (
    <div className="conf-wrap">
      {ps.map(p => (
        <div 
          key={p.id} 
          className="conf-p" 
          style={{
            left: p.left + '%',
            background: p.color,
            width: p.size,
            height: p.size,
            borderRadius: p.br,
            animationDuration: p.dur + 's',
            animationDelay: p.delay + 's'
          }} 
        />
      ))}
    </div>
  );
};

/* ===== SPLASH ===== */
export const Splash = () => {
  const stars = useMemo(() => Array.from({ length: 35 }, (_, i) => ({
    id: i,
    top: Math.random() * 100,
    left: Math.random() * 100,
    sz: Math.random() * 3 + 1,
    op: Math.random() * .6 + .2
  })), []);
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100dvh',background:'linear-gradient(160deg,#0D1E35 0%,#1B3A63 50%,#234580 100%)',position:'relative'}}>
      <div style={{position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none'}}>
        {stars.map(s => <div key={s.id} className="star-dot" style={{top:s.top+'%',left:s.left+'%',width:s.sz,height:s.sz,opacity:s.op}}/>)}
      </div>
      <div style={{textAlign:'center',animation:'popIn .7s ease .3s both',position:'relative',zIndex:1}}>
        <div style={{fontSize:88,marginBottom:16,display:'block',animation:'pulse 1.8s infinite'}}>📖</div>
        <div style={{fontSize:40,fontWeight:900,marginBottom:6}}>
          <span style={{color:'var(--gold)'}}>Sabatina</span><span style={{color:'var(--teal)'}}>Quest</span>
        </div>
        <div style={{color:'rgba(125,164,200,.8)',fontSize:12,letterSpacing:3,textTransform:'uppercase',marginBottom:40,fontFamily:'Poppins,sans-serif'}}>Escola Sabatina Teen</div>
        <div style={{display:'flex',alignItems:'center',gap:8,justifyContent:'center',color:'rgba(125,164,200,.7)',fontSize:14}}>
          <div style={{width:16,height:16,border:'3px solid rgba(247,198,0,.4)',borderTopColor:'#F7C600',borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
          Carregando...
        </div>
      </div>
    </div>
  );
};

/* ===== LOGIN ===== */
import { signInWithGoogle, getUser, getAllUsers, toggleAdmin, sendManualNotification, saveDayOverride, getBlockedIds, toggleRankingBlock, deleteUserAccount } from './firebase';

export const Login = ({ onLogin }: { onLogin: (j: any) => void }) => {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const goGoogle = async () => {
    setLoading(true);
    setErr('');
    try {
      const result = await signInWithGoogle();
      const user = result.user;
      let j: any;
      const dbUser = await getUser(user.uid);
      if (dbUser) {
        j = { ...dbUser };
      } else {
        j = { id: user.uid, nome: user.displayName || 'Visitante', turma: 'Visitante', avatar: '🦁', email: user.email, criadoEm: new Date().toISOString(), isNew: true };
      }
      ss('jogador', j);
      onLogin(j);
    } catch (e: any) {
      console.error(e);
      if (e.code === 'auth/unauthorized-domain') {
        setErr('Hospedagem não autorizada no Firebase. Acesse o console do Firebase > Authentication > Settings > Authorized domains e adicione este site na lista.');
      } else {
        setErr(e.message || 'Erro ao realizar login');
      }
      setLoading(false);
    }
  };

  return (
    <div style={{padding:'0 20px 100px',animation:'fadeIn .4s ease',minHeight:'100dvh',display:'flex',flexDirection:'column',justifyContent:'center'}}>
      <div style={{textAlign:'center',padding:'32px 0 20px',borderBottom:'1px solid rgba(247,198,0,.15)',marginBottom:24}}>
        <div style={{fontSize:52,marginBottom:10,animation:'bounce 3s ease-in-out infinite'}}>📖</div>
        <div style={{fontSize:30,fontWeight:900,marginBottom:4}}>
          <span style={{color:'var(--gold)'}}>Sabatina</span><span style={{color:'var(--teal)'}}>Quest</span>
        </div>
        <div style={{display:'inline-block',background:'rgba(247,198,0,.14)',border:'1.5px solid rgba(247,198,0,.32)',borderRadius:20,padding:'4px 14px',fontSize:13,fontWeight:800,color:'var(--gold)',letterSpacing:.5,marginTop:6,fontFamily:'Poppins,sans-serif'}}>
          ✨ Acesso com Google
        </div>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:16,alignItems:'center'}}>
        <button className={`btn btn-gold${loading ? ' btn-dis' : ''}`} onClick={goGoogle} style={{fontSize:19,marginBottom:4}}>
          {loading ? 'Carregando...' : '🚀 ENTRAR COM GOOGLE'}
        </button>
        {err && <div style={{color:'#E31C3D',fontSize:14,fontWeight:800,textAlign:'center'}}>{err}</div>}
      </div>

      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,color:'rgba(185,172,230,.55)',fontSize:13,marginTop:40}}>
        <span>🔐</span>
        <span>Login seguro via Firebase Authentication</span>
      </div>
    </div>
  );
};

/* ===== HOME ===== */
export const Home = ({ jogador, licao, prog, onEstudo, onRanking, onConfig, onAdmin, onChangeLicao }: any) => {
  const diaId = getDiaId(licao.dias);
  const diaAtual = licao.dias.find((d: any) => d.id === diaId);
  
  const getSt = (dia: any) => {
    if (prog.done.includes(dia.id)) return 'done';
    if (dia.id === diaId) return 'today';
    if (jogador.isAdmin) return 'missed'; // Admins can access all days as if they missed them, so it's not locked.
    if (dia.id < diaId) return 'missed';
    return 'locked';
  };
  const concHoje = prog.done.includes(diaId);

  return (
    <div className="scr" style={{paddingBottom:100}}>
      <div className="hdr">
        <div>
          <div className="logo"><span className="s1">Sabatina</span><span className="s2">Quest</span></div>
          <div className="logo-sub">Escola Sabatina Teen</div>
        </div>
        <div style={{display: 'flex', gap: '8px'}}>
          {jogador.isAdmin && <button className="btn btn-ghost btn-sm" onClick={onAdmin} style={{width:'auto',padding:'8px',fontSize:14}}>🛡️</button>}
          <button className="btn btn-ghost btn-sm" onClick={shareApp} style={{width:'auto',padding:'8px',fontSize:14}}>🔗</button>
          <button className="btn btn-ghost btn-sm" onClick={onConfig} style={{width:'auto',padding:'8px',fontSize:14}}>⚙️</button>
        </div>
      </div>

      <div className="sec" style={{marginTop:20,position:'relative'}}>
        <div style={{textAlign:'center',marginBottom:-16,position:'relative',zIndex:1,height:36}}>
          <span style={{fontSize:34,filter:'drop-shadow(0 4px 10px rgba(245,200,66,.6))',animation:'starFloat 2s ease-in-out infinite',display:'inline-block'}}>⭐</span>
          <span style={{position:'absolute',top:'50%',transform:'translateY(-50%)',left:'calc(50% - 52px)',fontSize:24,opacity:.6,animation:'starFloat 2.5s ease-in-out infinite .3s',display:'inline-block'}}>🌿</span>
          <span style={{position:'absolute',top:'50%',transform:'translateY(-50%)',left:'calc(50% + 28px)',fontSize:24,opacity:.6,animation:'starFloat 2.5s ease-in-out infinite .6s',display:'inline-block'}}>🌿</span>
        </div>
        {[{t:-18,l:8,s:14,c:'#2ECC71',d:'.2s'},{t:-8,r:12,s:12,c:'#E31C3D',d:'.5s'},{t:10,r:2,s:16,c:'#B9ACE6',d:'.8s'},{t:5,l:18,s:10,c:'#F5C842',d:'.1s'}].map((s: any, i) => (
          <div key={i} style={{position:'absolute',top:s.t,left:s.l,right:s.r,fontSize:s.s,color:s.c,animation:`starFloat 2.5s ease-in-out infinite ${s.d}`,pointerEvents:'none',zIndex:2}}>✦</div>
        ))}
        <div className="profile-card">
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{width: 60, height: 60, background:'rgba(255,255,255,.1)', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize: 36, overflow:'hidden', border:'2px solid rgba(245,200,66,.3)', flexShrink: 0}}>
                {jogador.avatar?.length > 10 ? <img src={jogador.avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="avatar"/> : <span>{jogador.avatar}</span>}
              </div>
              <div>
                <div style={{fontWeight:900,fontSize:22,marginBottom:3}}>{jogador.nome}</div>
                {jogador.turma && <div style={{fontSize:12,color:'var(--mut)',fontWeight:700,marginBottom:5}}>👥 {jogador.turma}</div>}
                <div className="xp-badge">⭐ {prog.xp} XP esta semana</div>
              </div>
            </div>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:30,fontWeight:900,color:'var(--gold)',lineHeight:1}}>#{prog.pos||'?'}</div>
              <div style={{fontSize:9,color:'var(--mut)',textTransform:'uppercase',letterSpacing:1,marginTop:2}}>ranking</div>
            </div>
          </div>
          <div style={{borderTop:'1px solid rgba(245,200,66,.2)',paddingTop:12,display:'flex',gap:10,flexWrap:'wrap'}}>
            <div className="streak-badge">🔥 {prog.streak} dia{prog.streak!==1?'s':''} seguido{prog.streak!==1?'s':''}</div>
            <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'var(--g3)',border:'1.5px solid var(--b3)',borderRadius:30,padding:'5px 12px',fontSize:14,fontWeight:800,color:'var(--txt)'}}>
              🎗️ {prog.done.length}/{licao.dias.length} concluídos
            </div>
          </div>
        </div>
      </div>

      <div className="sec">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div className="sec-title" style={{marginBottom:0}}>Cronograma de Estudos da Semana</div>
        </div>
        
        <div style={{marginBottom:16}}>
          <select 
            value={licao.semana}
            onChange={e => {
              const selected = LICOES.find((l: any) => l.semana === e.target.value);
              if (selected && onChangeLicao) onChangeLicao(selected);
            }}
            className="licao-select"
          >
            {LICOES.filter((l: any) => !l.isAdminOnly || jogador?.isAdmin).map((l: any, i: number) => (
              <option key={l.semana} value={l.semana} style={{background:'#1E1248'}}>{l.titulo}</option>
            ))}
          </select>
        </div>

        <div className="days-grid">
          {licao.dias.map((dia: any) => {
            const st = getSt(dia);
            return (
              <div key={dia.id} className={`day-btn ${st}`} onClick={() => st !== 'locked' && onEstudo(dia)}>
                <span>{formatDiaSemana(dia.diaSemana)}</span>
                <span className="di">{st === 'done' ? '✅' : st === 'today' ? '📖' : st === 'missed' ? '📖' : '🔒'}</span>
              </div>
            );
          })}
        </div>
      </div>

      {diaAtual && (
        <div className="sec">
          <div className="gold-card" style={{textAlign:'center'}}>
            <div style={{position:'relative',marginBottom:10}}>
              <span style={{fontSize:52,display:'inline-block',animation:'bounce 3s ease-in-out infinite'}}>📖</span>
              <span style={{position:'absolute',top:'50%',transform:'translateY(-50%)',left:'calc(50% - 48px)',fontSize:20,opacity:.5}}>🌿</span>
              <span style={{position:'absolute',top:'50%',transform:'translateY(-50%)',left:'calc(50% + 28px)',fontSize:20,opacity:.5}}>🌿</span>
            </div>
            <div style={{fontWeight:900,fontSize:20,color:concHoje?'#3E6B3E':'#5A3E16',lineHeight:1.2,marginBottom:6,textTransform:'uppercase'}}>{licao.titulo}</div>
            <div style={{fontSize:14,color:'rgba(90,62,22,.8)',marginBottom:16,lineHeight:1.5}}>
              {formatDiaSemana(diaAtual.diaSemana)} — <strong style={{color:'#5A3E16'}}>{diaAtual.titulo}</strong> • Complete a lição para garantir seus XP!
            </div>
            {concHoje
              ? <div className="btn btn-grn" style={{pointerEvents:'none',fontSize:16}}>✅ Concluído hoje! Parabéns!</div>
              : <button className="btn" onClick={() => onEstudo(diaAtual)} style={{background:'linear-gradient(135deg,#D9A12E,#A87600)',color:'#fff',fontWeight:900,fontSize:19,boxShadow:'0 5px 0 #7A5500,0 8px 20px rgba(217,161,46,.3)'}}>
                  📖 ESTUDAR AGORA!
                </button>
            }
          </div>
        </div>
      )}

      <div className="bot-nav">
        <button className="btn btn-purple" onClick={onRanking} style={{fontSize:16}}>🏆 VER RANKING</button>
      </div>
    </div>
  );
};

/* ===== ESTUDO ===== */
export const Estudo = ({ dia, prog, jogador, semana, onSaveStudy, onDayUpdated, onQuiz, onBack }: any) => {
  const initHistory = prog.history?.[dia.id] || {};
  const [notes, setNotes] = useState(initHistory.nota || '');
  const [hl, setHl] = useState<any>(initHistory.hl || {});
  const [pct, setPct] = useState(0);
  const [sel, setSel] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const p = Math.min(100, Math.round(el.scrollTop / (el.scrollHeight - el.clientHeight) * 100));
    setPct(p);
  };
  
  const paras = dia.conteudo.split('\n\n').filter(Boolean);

  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return setSel(null);
    const text = selection.toString().trim();
    if (text.length > 2) {
      const anchorEl = selection.anchorNode?.nodeType === 3 ? selection.anchorNode.parentElement : selection.anchorNode as HTMLElement;
      const focusEl  = selection.focusNode?.nodeType  === 3 ? selection.focusNode.parentElement  : selection.focusNode  as HTMLElement;
      const anchorP = anchorEl?.closest('[data-pidx]');
      const focusP  = focusEl?.closest('[data-pidx]');
      if (!anchorP || !focusP || anchorP !== focusP) return setSel(null);
      const pIdx = parseInt(anchorP.getAttribute('data-pidx') as string, 10);
      if (pIdx !== -1) setSel({ pIndex: pIdx, text });
      else setSel(null);
    } else {
      setSel(null);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  const addHl = (color: string) => {
    if (!sel) return;
    setHl((prev: any) => {
      const list = prev[sel.pIndex] || [];
      return { ...prev, [sel.pIndex]: [...list, { text: sel.text, color }] };
    });
    setSel(null);
    window.getSelection()?.removeAllRanges();
  };

  const renderP = (p: string, pIdx: number) => {
    let res = [p];
    const myHls = hl[pIdx] || [];
    
    myHls.forEach((h: any) => {
      const newRes: any[] = [];
      res.forEach((chunk: any) => {
        if (typeof chunk !== 'string') { newRes.push(chunk); return; }
        const parts = chunk.split(h.text);
        parts.forEach((pt, i) => {
          newRes.push(pt);
          if (i < parts.length - 1) {
            newRes.push(<span key={i} style={{background: h.color, color: h.color === '#F7C600' || h.color === '#1E9E86' ? (h.color === '#F7C600' ? '#1A0A00' : '#fff') : '#fff', padding: '0 3px', borderRadius: 3, fontWeight: h.color === '#F7C600' ? 700 : 400}}>{h.text}</span>);
          }
        });
      });
      res = newRes;
    });

    return (
      <div key={pIdx} data-pidx={pIdx} className="para-block" style={{animation:`fadeIn .4s ease ${pIdx*.07}s both`}}>
        {res}
      </div>
    );
  };

  const wrapLeave = (fn: any) => {
    onSaveStudy(notes, hl);
    fn();
  };

  return (
    <div className="scr-full">
      {sel && (
        <div style={{position:'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background:'var(--notif-bg)', padding: '10px 16px', borderRadius: 30, display:'flex', gap: 14, boxShadow:'0 10px 30px rgba(0,0,0,.4)', zIndex: 1000, border:'1px solid var(--notif-border)', animation:'fadeUp .2s ease'}}>
           {['#F7C600', '#1E9E86', '#E5006D', '#4A90D9'].map(c => (
              <div key={c} onMouseDown={(e) => { e.preventDefault(); addHl(c); }} style={{width: 32, height: 32, borderRadius: '50%', background: c, border:'2px solid rgba(255,255,255,.7)', cursor:'pointer', boxShadow:'0 2px 5px rgba(0,0,0,.4)'}} title="Destacar" />
           ))}
           <div onMouseDown={(e) => { e.preventDefault(); setSel(null); window.getSelection()?.removeAllRanges(); }} style={{width: 32, height: 32, borderRadius: '50%', background: '#333', border:'2px solid rgba(255,255,255,.2)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize: 13}}>❌</div>
        </div>
      )}
      <div className="hdr">
        <button className="btn btn-ghost btn-sm" onClick={() => wrapLeave(onBack)} style={{width:'auto'}}>← Voltar</button>
        <div style={{fontWeight:800,fontSize:14}}>Dia {dia.id} — {formatDiaSemana(dia.diaSemana)}</div>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          {jogador?.isAdmin && (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditOpen(true)} style={{width:'auto', padding:'4px 8px', margin:0, minHeight:0}} title="Editar conteúdo">✏️</button>
          )}
          <div className="xp-badge" style={{fontSize:12}}>~3 min</div>
        </div>
      </div>
      {editOpen && (
        <EditDayModal
          dia={dia}
          semana={semana}
          onClose={() => setEditOpen(false)}
          onSaved={(updated: any) => { onDayUpdated?.(updated); setEditOpen(false); }}
        />
      )}
      <div style={{padding:'10px 20px',background:'var(--hdr-bg)'}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
          <span style={{fontSize:12,color:'var(--mut)',fontWeight:700,fontFamily:'Poppins,sans-serif'}}>Progresso de leitura</span>
          <span style={{fontSize:12,color:'var(--gold)',fontWeight:800,fontFamily:'Poppins,sans-serif'}}>{pct}%</span>
        </div>
        <div className="prog-wrap"><div className="prog-bar" style={{width:pct+'%'}}/></div>
      </div>
      <div ref={ref} onScroll={onScroll} style={{flex:1,overflowY:'auto',padding:'20px 16px 120px'}}>
        <div style={{fontWeight:900,fontSize:22,marginBottom:20,lineHeight:1.2,color:'var(--txt2)'}}>{dia.titulo}</div>
        {paras.map((p: string, i: number) => renderP(p, i))}
        <div className="verse-card" style={{marginTop:16,marginBottom:24}}>
          <div style={{fontSize:11,fontWeight:800,color:'var(--gold)',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>💡 Versículo-chave</div>
          <div style={{fontSize:15,fontStyle:'italic',lineHeight:1.65,color:'var(--txt2)',marginBottom:8,paddingLeft:8}}>"{dia.versiculoChave.texto}"</div>
          <div style={{fontWeight:800,color:'var(--gold)',fontSize:13}}>— {dia.versiculoChave.referencia}</div>
        </div>
        
        <div style={{marginBottom: 24, background:'var(--panel-bg)', padding: '16px', borderRadius: 16, border:'1px solid var(--panel-border)'}}>
          <div style={{fontSize:13,fontWeight:800,color:'var(--mut)',textTransform:'uppercase',letterSpacing:1,marginBottom:12,fontFamily:'Poppins,sans-serif'}}>📝 Minhas Anotações</div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Escreva aqui ideias, lições ou cole trechos da lição..."
            style={{width:'100%', minHeight: 120, background:'var(--input-bg)', border:'1px solid var(--input-border)', color:'var(--txt2)', fontSize: 15, lineHeight: 1.6, padding: '14px', borderRadius: 12, resize:'vertical', outline:'none', fontFamily:'Lora,Georgia,serif', transition:'background .3s,color .3s'}}
          />
        </div>

        {prog.done.includes(dia.id) && !jogador?.isAdmin ? (
          <button className="btn btn-gold" style={{fontSize:19, background:'#2ECC71', filter:'brightness(0.8)', cursor:'not-allowed'}} onClick={(e) => e.preventDefault()}>✅ QUIZ CONCLUÍDO</button>
        ) : (
          <button className="btn btn-gold" onClick={() => {
            if (jogador?.isAdmin || window.confirm("Atenção! O quiz só pode ser feito UMA VEZ para somar pontos no ranking.\n\nVocê já revisou todo o estudo e está pronto para começar?")) {
              wrapLeave(onQuiz);
            }
          }} style={{fontSize:19}}>
             {prog.done.includes(dia.id) && jogador?.isAdmin ? '🎯 REFAZER QUIZ (ADM)' : '🎯 FAZER O QUIZ'}
          </button>
        )}
        <p style={{textAlign:'center',color:'rgba(185,172,230,.5)',fontSize:13,marginTop:12}}>Leitura: {pct}% completa</p>
      </div>
    </div>
  );
};

/* ===== EDIT DAY MODAL (ADMIN) ===== */
const EditDayModal = ({ dia, semana, onClose, onSaved }: any) => {
  const [titulo, setTitulo] = useState(dia.titulo || '');
  const [conteudo, setConteudo] = useState(dia.conteudo || '');
  const [vTexto, setVTexto] = useState(dia.versiculoChave?.texto || '');
  const [vRef, setVRef] = useState(dia.versiculoChave?.referencia || '');
  const [pergs, setPergs] = useState<any[]>(() => (dia.perguntas || []).map((p: any) => ({ ...p, opcoes: [...(p.opcoes || ['', '', '', ''])] })));
  const [saving, setSaving] = useState(false);

  const updatePerg = (i: number, field: string, value: any) => {
    setPergs((prev: any[]) => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  };
  const updateOpcao = (i: number, oi: number, value: string) => {
    setPergs((prev: any[]) => prev.map((p, idx) => idx === i ? { ...p, opcoes: p.opcoes.map((o: string, oidx: number) => oidx === oi ? value : o) } : p));
  };

  const handleSave = async () => {
    setSaving(true);
    const data = { titulo, conteudo, versiculoChave: { texto: vTexto, referencia: vRef }, perguntas: pergs };
    try {
      await saveDayOverride(semana, dia.id, data);
      onSaved({ ...dia, ...data });
    } catch (e) {
      alert('Erro ao salvar edição. Verifique sua conexão e tente novamente.');
    }
    setSaving(false);
  };

  return (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,.78)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16}}>
      <div style={{background:'var(--card)', border:'1px solid var(--panel-border)', borderRadius:16, padding:20, maxWidth:520, width:'100%', maxHeight:'85vh', overflowY:'auto', boxShadow:'0 10px 40px rgba(0,0,0,.6)'}}>
        <div style={{fontWeight:900, fontSize:17, marginBottom:16, color:'var(--txt2)', fontFamily:'Poppins,sans-serif'}}>✏️ Editar Conteúdo do Dia</div>

        <div style={{fontSize:13, color:'var(--mut)', fontWeight:800, marginBottom:8}}>Título:</div>
        <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} style={{width:'100%', padding:'10px', borderRadius:8, background:'var(--input-bg)', border:'1px solid var(--input-border)', color:'var(--txt2)', fontSize:14, marginBottom:12}} />

        <div style={{fontSize:13, color:'var(--mut)', fontWeight:800, marginBottom:8}}>Conteúdo (parágrafos separados por linha em branco):</div>
        <textarea value={conteudo} onChange={e => setConteudo(e.target.value)} style={{width:'100%', minHeight:160, padding:'10px', borderRadius:8, background:'var(--input-bg)', border:'1px solid var(--input-border)', color:'var(--txt2)', fontSize:14, lineHeight:1.5, marginBottom:12, resize:'vertical', fontFamily:'Lora,Georgia,serif'}} />

        <div style={{fontSize:13, color:'var(--mut)', fontWeight:800, marginBottom:8}}>Versículo-chave (texto):</div>
        <textarea value={vTexto} onChange={e => setVTexto(e.target.value)} style={{width:'100%', minHeight:60, padding:'10px', borderRadius:8, background:'var(--input-bg)', border:'1px solid var(--input-border)', color:'var(--txt2)', fontSize:14, marginBottom:8, resize:'vertical'}} />
        <div style={{fontSize:13, color:'var(--mut)', fontWeight:800, marginBottom:8}}>Versículo-chave (referência):</div>
        <input type="text" value={vRef} onChange={e => setVRef(e.target.value)} style={{width:'100%', padding:'10px', borderRadius:8, background:'var(--input-bg)', border:'1px solid var(--input-border)', color:'var(--txt2)', fontSize:14, marginBottom:16}} />

        <div className="sec-title" style={{marginBottom:8}}>Perguntas do Quiz</div>
        {pergs.map((p: any, i: number) => (
          <div key={p.id || i} style={{background:'rgba(0,0,0,.2)', borderRadius:10, padding:12, marginBottom:12}}>
            <div style={{fontSize:12, color:'var(--mut)', fontWeight:800, marginBottom:6}}>Pergunta {i + 1}:</div>
            <input type="text" value={p.pergunta} onChange={e => updatePerg(i, 'pergunta', e.target.value)} style={{width:'100%', padding:'8px', borderRadius:6, background:'var(--input-bg)', border:'1px solid var(--input-border)', color:'var(--txt2)', fontSize:13, marginBottom:8}} />
            {p.opcoes.map((o: string, oi: number) => (
              <div key={oi} style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
                <input type="radio" name={`correta-${i}`} checked={p.correta === oi} onChange={() => updatePerg(i, 'correta', oi)} style={{accentColor:'var(--gold)'}} />
                <input type="text" value={o} onChange={e => updateOpcao(i, oi, e.target.value)} style={{flex:1, padding:'6px 8px', borderRadius:6, background:'var(--input-bg)', border:'1px solid var(--input-border)', color:'var(--txt2)', fontSize:13}} />
              </div>
            ))}
            <div style={{fontSize:12, color:'var(--mut)', fontWeight:800, marginTop:4, marginBottom:6}}>Explicação:</div>
            <input type="text" value={p.explicacao || ''} onChange={e => updatePerg(i, 'explicacao', e.target.value)} style={{width:'100%', padding:'8px', borderRadius:6, background:'var(--input-bg)', border:'1px solid var(--input-border)', color:'var(--txt2)', fontSize:13}} />
          </div>
        ))}

        <div style={{display:'flex', gap:10, marginTop:8}}>
          <button onClick={handleSave} disabled={saving} className={`btn btn-gold ${saving ? 'btn-dis' : ''}`} style={{flex:1, padding:'10px', fontSize:14}}>{saving ? 'Salvando...' : 'Salvar'}</button>
          <button onClick={onClose} className="btn btn-ghost" style={{flex:1, padding:'10px', fontSize:14}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
};

/* ===== QUIZ ===== */
export const Quiz = ({ dia, onDone, onBack }: any) => {
  const [qi, setQi] = useState(0);
  const [ans, setAns] = useState<number | null>(null);
  const [resps, setResps] = useState<any[]>([]);
  const [tempo, setTempo] = useState(40);
  const [elapsed, setElapsed] = useState(0);
  const [xpMsg, setXpMsg] = useState<string | null>(null);
  const timerRef = useRef<any>(null);
  const startRef = useRef<number>(0);
  
  const [shuffledPergs] = useState(() =>
    (dia.perguntas || []).map((q: any) => {
      const correctText = q.opcoes[q.correta];
      const shuffled = [...q.opcoes].sort(() => Math.random() - 0.5);
      return { ...q, opcoes: shuffled, correta: shuffled.indexOf(correctText) };
    })
  );
  const pergs = shuffledPergs;
  const q = pergs[qi];
  const BTNS = [{cls:'qA',sym:'🔺'},{cls:'qB',sym:'🔷'},{cls:'qC',sym:'🔶'},{cls:'qD',sym:'🟢'}];

  const startTimer = useCallback(() => {
    clearInterval(timerRef.current);
    setTempo(40);
    setElapsed(0);
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const e = (Date.now() - startRef.current) / 1000;
      const r = Math.max(0, 40 - e);
      setTempo(r);
      setElapsed(e);
      if (r <= 0) {
        clearInterval(timerRef.current);
        respond(-1, e);
      }
    }, 80);
  }, [qi]);

  useEffect(() => {
    startTimer();
    return () => clearInterval(timerRef.current);
  }, [qi, startTimer]);

  const respond = (idx: number, elT?: number) => {
    if (ans !== null) return;
    clearInterval(timerRef.current);
    const t = elT !== undefined ? elT : elapsed;
    const ok = idx === q.correta;
    const xp = xpSpeed(t, ok, dia.data);
    setAns(idx);
    
    if (ok) {
      playSound('correct');
    } else {
      playSound('wrong');
    }
    
    if (xp > 0) {
      setXpMsg(`+${xp} XP ⭐`);
      setTimeout(() => setXpMsg(null), 1200);
    }
    
    const nr = [...resps, { qId: q.id, ans: idx, correta: q.correta, xp, t }];
    setResps(nr);
    
    setTimeout(() => {
      if (qi + 1 < pergs.length) {
        setQi(qi + 1);
        setAns(null);
      } else {
        const ac = nr.filter(r => r.ans === r.correta).length;
        const xpT = nr.reduce((s, r) => s + r.xp, 0);
        const tM = nr.reduce((s, r) => s + r.t, 0) / nr.length;
        onDone({ acertos: ac, total: pergs.length, xpTotal: xpT, tempoMedio: tM });
      }
    }, 2500);
  };

  const tPct = tempo / 40 * 100;
  const tColor = tPct > 50 ? '#2ECC71' : tPct > 25 ? '#F5C842' : '#E31C3D';
  const xpSoFar = resps.reduce((s, r) => s + r.xp, 0);

  return (
    <div className="scr-full">
      {xpMsg && <div className="xp-float">{xpMsg}</div>}
      <div style={{padding:'14px 20px',background:'var(--hdr-bg)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span>⏱️</span>
            <span style={{fontWeight:900,fontSize:22,color:tColor}}>{Math.ceil(tempo)}s</span>
          </div>
          <div style={{fontWeight:800,color:'var(--mut)',fontSize:15}}>{qi + 1}/{pergs.length}</div>
          <div className="xp-badge">⭐ {xpSoFar} XP</div>
        </div>
        <div className="timer-wrap"><div className="timer-bar" style={{width:tPct+'%',background:tColor}}/></div>
      </div>
      <div style={{padding:'18px 16px 0',flex:'none'}}>
        <div style={{background:'var(--g5)',borderRadius:18,padding:'20px 18px',textAlign:'center',fontWeight:800,fontSize:17,lineHeight:1.4,border:'1.5px solid rgba(247,198,0,.2)',minHeight:100,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--txt)',fontFamily:'Poppins,sans-serif'}}>{q.pergunta}</div>
      </div>
      <div style={{padding:'14px 16px',flex:1}}>
        <div className="quiz-grid">
          {q.opcoes.map((op: string, i: number) => {
            let ex = '';
            if (ans !== null) {
              if (i === q.correta) ex = ' correct';
              else if (i === ans && i !== q.correta) ex = ' wrong';
              else ex = ' locked';
            }
            return (
              <button key={i} className={`qbtn ${BTNS[i].cls}${ex}`} onClick={() => respond(i, undefined)} disabled={ans !== null}>
                <span className="sym">{BTNS[i].sym}</span>
                <span style={{fontSize:13,lineHeight:1.3}}>{op}</span>
              </button>
            );
          })}
        </div>
        {ans !== null && (
          <div style={{marginTop:14,padding:'12px 16px',borderRadius:14,background:ans === q.correta?'rgba(79,184,92,.15)':'rgba(227,28,61,.15)',border:`1.5px solid ${ans === q.correta?'#4FB85C':'#E31C3D'}`,animation:'popIn .3s ease'}}>
            <div style={{fontWeight:800,fontSize:14,marginBottom:4,color:ans === q.correta?'#4FB85C':'#E31C3D'}}>{ans === q.correta ? '✅ Correto!' : '❌ Incorreto!'}</div>
            <div style={{fontSize:13,color:'var(--txt2)',lineHeight:1.5}}>{q.explicacao}</div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ===== RESULTADO ===== */
export const Resultado = ({ res, dia, prog, onRanking, onHome }: any) => {
  const { acertos, total, xpTotal, tempoMedio } = res;
  const { ic, mg } = getMsgRes(acertos, total);
  
  const badges = [];
  if (acertos === total) badges.push({ e: '🎯', l: 'Certeiro' });
  if (tempoMedio < 10) badges.push({ e: '⚡', l: 'Relâmpago' });
  if (prog.streak >= 2) badges.push({ e: '🔥', l: 'Em Chamas' });

  return (
    <div style={{minHeight:'100dvh',padding:'20px 16px 100px',textAlign:'center'}}>
      <Confetti show={true}/>
      <div style={{animation:'popIn .5s ease .2s both',fontSize:80,marginTop:20,display:'block',marginBottom:10}}>{ic}</div>
      <div style={{animation:'popIn .5s ease .4s both',fontWeight:900,fontSize:24,marginBottom:4}}>{mg}</div>
      <div style={{animation:'fadeIn .5s ease .6s both',color:'var(--mut)',fontSize:14,marginBottom:26}}>{formatDiaSemana(dia.diaSemana)} — {dia.titulo}</div>
      <div style={{animation:'fadeUp .5s ease .7s both',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:22}}>
        {[{e:'✅',l:'Acertos',v:`${acertos}/${total}`},{e:'⭐',l:'XP Ganho',v:`+${xpTotal}`},{e:'⏱️',l:'Tempo médio',v:`${Math.round(tempoMedio)}s`}].map(s => (
          <div key={s.l} className="purple-card" style={{padding:'12px 6px',textAlign:'center'}}>
            <div style={{fontSize:22,marginBottom:4}}>{s.e}</div>
            <div style={{fontWeight:900,fontSize:18,color:'var(--gold)'}}>{s.v}</div>
            <div style={{fontSize:9,color:'var(--mut)',fontWeight:700,textTransform:'uppercase',letterSpacing:.5,marginTop:3}}>{s.l}</div>
          </div>
        ))}
      </div>
      {prog.streak > 0 && <div style={{animation:'fadeIn .5s ease .9s both',marginBottom:14}}><div className="streak-badge" style={{fontSize:16,padding:'8px 20px'}}>🔥 Sequência: {prog.streak} dias!</div></div>}
      {badges.length > 0 && (
        <div style={{animation:'fadeIn .5s ease 1s both',marginBottom:22}}>
          <div style={{fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:2,color:'var(--mut)',marginBottom:10}}>Conquistas do dia</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center'}}>
            {badges.map(b => <div key={b.l} style={{display:'inline-flex',alignItems:'center',gap:6,background:'rgba(255,255,255,.08)',border:'1.5px solid rgba(255,255,255,.12)',borderRadius:30,padding:'7px 16px',fontSize:14,fontWeight:800}}>{b.e} {b.l}</div>)}
          </div>
        </div>
      )}
      <div style={{animation:'fadeIn .5s ease 1.1s both',display:'flex',flexDirection:'column',gap:12}}>
        <button className="btn btn-gold" onClick={onRanking} style={{fontSize:17}}>🏆 VER RANKING</button>
        <button className="btn btn-ghost" onClick={onHome}>← VOLTAR AO INÍCIO</button>
      </div>
    </div>
  );
};

/* ===== RANKING ===== */
export const Ranking = ({ jogador, ranking, prog, type, onChangeType, onBack, licao }: any) => {
  const { regular, admins } = useMemo(() => {
    const all = [...ranking].map((r: any) => {
      const isMe = r.id === jogador.id;
      const nome = isMe ? jogador.nome : r.nome;
      const avatar = isMe ? jogador.avatar : r.avatar;
      const dias = isMe && type === 'week' ? (prog.done?.length || 0) : (r.dias ?? (r.done?.length || 0));
      const xp = isMe && type === 'week' ? (prog.xp || 0) : (r.xp || 0);
      const isAdmin = r.isAdmin || (isMe && !!jogador.isAdmin);
      return { ...r, nome, avatar, dias, xp, isAdmin };
    });
    const byXp = (a: any, b: any) => b.xp - a.xp;
    return {
      regular: all.filter((r: any) => !r.isAdmin).sort(byXp).slice(0, 10),
      admins: all.filter((r: any) => r.isAdmin).sort(byXp),
    };
  }, [ranking, jogador, type, prog]);

  const myIsAdmin = !!jogador.isAdmin;
  const myIdx = myIsAdmin
    ? admins.findIndex((r: any) => r.id === jogador.id)
    : regular.findIndex((r: any) => r.id === jogador.id);
  const meds = ['🥇','🥈','🥉'];

  return (
    <div className="scr">
      <div className="hdr">
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{width:'auto'}}>← Voltar</button>
        <div style={{fontWeight:900,fontSize:17}}>🏆 Ranking</div>
        <button className="btn btn-ghost btn-sm" onClick={shareApp} style={{width:'auto',padding:'8px',fontSize:14}}>🔗</button>
      </div>
      
      <div style={{padding:'4px 16px 12px'}}>
        <div style={{display:'flex',background:'var(--g3)',borderRadius:12,padding:4}}>
          <div onClick={() => onChangeType('week')} style={{flex:1,textAlign:'center',padding:'8px',borderRadius:8,fontWeight:800,fontSize:14,cursor:'pointer',transition:'background .2s',background:type==='week'?'rgba(247,198,0,.15)':'transparent',color:type==='week'?'var(--gold)':'var(--mut)',fontFamily:'Poppins,sans-serif'}}>Da Semana</div>
          <div onClick={() => onChangeType('season')} style={{flex:1,textAlign:'center',padding:'8px',borderRadius:8,fontWeight:800,fontSize:14,cursor:'pointer',transition:'background .2s',background:type==='season'?'rgba(247,198,0,.15)':'transparent',color:type==='season'?'var(--gold)':'var(--mut)',fontFamily:'Poppins,sans-serif'}}>Da Temporada</div>
        </div>
      </div>
      
      {regular.length >= 3 && (
        <div style={{padding:'8px 16px 0'}}>
          <div className="podium">
            <div className="pod-col">
              <div style={{width: 44, height: 44, borderRadius: '50%', background:'rgba(255,255,255,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize: 24, overflow:'hidden', margin:'0 auto 4px', flexShrink:0}}>
                {regular[1].avatar?.length > 10 ? <img src={regular[1].avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="avatar"/> : <span>{regular[1].avatar}</span>}
              </div>
              <div style={{fontWeight:800,fontSize:12,maxWidth:66,textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{regular[1].nome}</div>
              <div className="pod-base p2">🥈</div>
              <div style={{fontWeight:900,color:'var(--gold)',fontSize:12,lineHeight:1.1}}>{regular[1].xp} XP</div>
              <div style={{fontSize:10,color:'var(--mut)',marginTop:1}}>📅 {regular[1].dias || 0} d</div>
            </div>
            <div className="pod-col">
              <div style={{fontSize:18,animation:'bounce 2s ease-in-out infinite'}}>👑</div>
              <div style={{width: 56, height: 56, borderRadius: '50%', background:'rgba(255,255,255,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize: 32, overflow:'hidden', margin:'0 auto 4px', flexShrink:0, border:'2px solid #F5C842'}}>
                {regular[0].avatar?.length > 10 ? <img src={regular[0].avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="avatar"/> : <span>{regular[0].avatar}</span>}
              </div>
              <div style={{fontWeight:900,fontSize:14,maxWidth:78,textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{regular[0].nome}</div>
              <div className="pod-base p1">🥇</div>
              <div style={{fontWeight:900,color:'var(--gold)',fontSize:14,lineHeight:1.1}}>{regular[0].xp} XP</div>
              <div style={{fontSize:11,color:'var(--gold)',fontWeight:800,marginTop:1}}>📅 {regular[0].dias || 0} d</div>
            </div>
            <div className="pod-col">
              <div style={{width: 44, height: 44, borderRadius: '50%', background:'rgba(255,255,255,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize: 24, overflow:'hidden', margin:'0 auto 4px', flexShrink:0}}>
                {regular[2].avatar?.length > 10 ? <img src={regular[2].avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="avatar"/> : <span>{regular[2].avatar}</span>}
              </div>
              <div style={{fontWeight:800,fontSize:11,maxWidth:58,textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{regular[2].nome}</div>
              <div className="pod-base p3">🥉</div>
              <div style={{fontWeight:900,color:'var(--gold)',fontSize:12,lineHeight:1.1}}>{regular[2].xp} XP</div>
              <div style={{fontSize:10,color:'var(--mut)',marginTop:1}}>📅 {regular[2].dias || 0} d</div>
            </div>
          </div>
        </div>
      )}
      <div className="sec" style={{marginTop:4}}>
        <div className="sec-title" style={{textTransform:'none', letterSpacing:'normal'}}>
          {type === 'week'
            ? `📖 Lição: ${licao?.titulo || 'Carregando...'}`
            : `🏆 Geral: ${licao?.trimestre || 'Carregando...'}`}
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {regular.map((r: any, i: number) => {
            const eu = r.id === jogador.id;
            return (
              <div key={r.id} style={{background:eu?'linear-gradient(135deg,rgba(247,198,0,.1),rgba(247,198,0,.04))':'var(--g2)',border:`2px solid ${eu?'rgba(247,198,0,.4)':'var(--b2)'}`,borderRadius:14,padding:'12px 16px',display:'flex',alignItems:'center',gap:12,animation:`popIn .3s ease ${i*.05}s both`,color:'var(--txt)'}}>
                <div style={{fontWeight:900,fontSize:16,width:26,textAlign:'center',color:i<3?'#F5C842':'var(--mut)'}}>{i < 3 ? meds[i] : `${i + 1}º`}</div>
                <div style={{width: 40, height: 40, borderRadius: '50%', background:'rgba(255,255,255,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize: 22, overflow:'hidden', flexShrink:0}}>
                  {r.avatar?.length > 10 ? <img src={r.avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="avatar"/> : <span>{r.avatar}</span>}
                </div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontWeight:800,fontSize:15,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'var(--txt)'}}>{r.nome}{eu ? ' 👈' : ''}</div>
                  <div style={{fontSize:12,color:'var(--mut)',marginTop:2}}>📅 {r.dias || 0} dia{r.dias!==1?'s':''} estudado{r.dias!==1?'s':''}</div>
                </div>
                <div style={{fontWeight:900,color:'var(--gold)',fontSize:15,flexShrink:0}}>{r.xp || 0} XP</div>
              </div>
            );
          })}
          {regular.length === 0 && <div style={{textAlign:'center',padding:'20px',color:'var(--mut)'}}>Ninguém pontuou ainda. Seja o primeiro!</div>}

          {admins.length > 0 && (
            <>
              <div style={{display:'flex',alignItems:'center',gap:8,margin:'4px 0'}}>
                <div style={{flex:1,height:1,background:'rgba(229,0,109,.25)'}}/>
                <div style={{fontSize:11,color:'var(--magenta)',fontWeight:800,letterSpacing:1,fontFamily:'Poppins,sans-serif'}}>🛡️ ADMINISTRADORES</div>
                <div style={{flex:1,height:1,background:'rgba(229,0,109,.25)'}}/>
              </div>
              {admins.map((r: any, i: number) => {
                const eu = r.id === jogador.id;
                return (
                  <div key={r.id} style={{background:eu?'linear-gradient(135deg,rgba(229,0,109,.12),rgba(229,0,109,.05))':'rgba(229,0,109,.06)',border:`2px solid ${eu?'rgba(229,0,109,.5)':'rgba(229,0,109,.2)'}`,borderRadius:14,padding:'12px 16px',display:'flex',alignItems:'center',gap:12,animation:`popIn .3s ease ${i*.05}s both`,color:'var(--txt)'}}>
                    <div style={{fontWeight:900,fontSize:14,width:26,textAlign:'center',color:'var(--magenta)'}}>🛡️</div>
                    <div style={{width: 40, height: 40, borderRadius: '50%', background:'rgba(229,0,109,.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize: 22, overflow:'hidden', flexShrink:0, border:'1.5px solid rgba(229,0,109,.3)'}}>
                      {r.avatar?.length > 10 ? <img src={r.avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="avatar"/> : <span>{r.avatar}</span>}
                    </div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontWeight:800,fontSize:15,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'var(--magenta)'}}>{r.nome}{eu ? ' 👈' : ''}</div>
                      <div style={{fontSize:12,color:'var(--mut)',marginTop:2}}>📅 {r.dias || 0} dia{r.dias!==1?'s':''} estudado{r.dias!==1?'s':''}</div>
                    </div>
                    <div style={{fontWeight:900,color:'var(--magenta)',fontSize:15,flexShrink:0,opacity:.75}}>{r.xp || 0} XP</div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
      <div className="sec">
        <div className="purple-card" style={{textAlign:'center'}}>
          <div style={{fontSize:13,color:'var(--mut)',marginBottom:4}}>Sua posição</div>
          {myIsAdmin
            ? <div style={{fontWeight:900,fontSize:22,color:'var(--magenta)'}}>🛡️ Admin</div>
            : <div style={{fontWeight:900,fontSize:32,color:'var(--gold)'}}>#{myIdx >= 0 ? myIdx + 1 : '?'}</div>
          }
          {myIdx !== -1 && (
            <div style={{fontSize:13,color:'var(--mut)'}}>
              📅 {(myIsAdmin ? admins : regular)[myIdx]?.dias} dia{(myIsAdmin ? admins : regular)[myIdx]?.dias!==1?'s':''} • ⭐ {(myIsAdmin ? admins : regular)[myIdx]?.xp} XP {type === 'week' ? 'esta semana' : 'nesta temporada'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ===== ADMIN ===== */
const SUPER_ADMIN_EMAIL = 'robsonbraz67@gmail.com';

export const Admin = ({ licao, jogador, onBack }: any) => {
  const isSuperAdmin = jogador?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  
  // Notification States
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [notifTitle, setNotifTitle] = useState('Você tem uma nova mensagem! 📬');
  const [notifBody, setNotifBody] = useState('Continue seu estudo diário e ganhe mais XP!');
  const [sendingNotif, setSendingNotif] = useState(false);

  useEffect(() => {
    let unmounted = false;
    const loadUsers = async () => {
      try {
        const [usrs, blockedIds] = await Promise.all([getAllUsers(), getBlockedIds()]);
        if (!unmounted) {
           setUsers(usrs.map(u => ({ ...u, rankingBlocked: blockedIds.has(u.id) })));
           setLoadingUsers(false);
        }
      } catch (e) {
        if (!unmounted) setLoadingUsers(false);
      }
    };
    loadUsers();
    return () => { unmounted = true; };
  }, []);

  const handleToggleAdmin = async (userId: string, currentStatus: boolean) => {
     try {
        await toggleAdmin(userId, !currentStatus);
        setUsers(users.map(u => u.id === userId ? { ...u, isAdmin: !currentStatus } : u));
     } catch(e) {
        alert('Erro ao atualizar usuário');
     }
  };

  const handleToggleBlock = async (userId: string, currentStatus: boolean) => {
     try {
        await toggleRankingBlock(userId, !currentStatus);
        setUsers(users.map(u => u.id === userId ? { ...u, rankingBlocked: !currentStatus } : u));
     } catch(e) {
        alert('Erro ao atualizar usuário');
     }
  };

  const handleDeleteUser = async (userId: string, nome: string) => {
     if (!window.confirm(`Excluir permanentemente "${nome}"? Essa ação remove a conta e todo o progresso e não pode ser desfeita.`)) return;
     try {
        await deleteUserAccount(userId);
        setUsers(users.filter(u => u.id !== userId));
     } catch(e) {
        alert('Erro ao excluir usuário');
     }
  };

  const handleSendNotif = async () => {
    if (selectedUsers.length === 0) return alert('Selecione pelo menos um usuário.');
    if (!notifTitle || !notifBody) return alert('Preencha o título e o corpo da notificação.');
    setSendingNotif(true);
    try {
      await sendManualNotification(selectedUsers, notifTitle, notifBody);
      alert('Notificação enviada com sucesso!');
      setSelectedUsers([]);
    } catch(e) {
      alert('Erro ao enviar notificação.');
    }
    setSendingNotif(false);
  };
  
  const toggleSelectUser = (id: string) => {
     setSelectedUsers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  
  const toggleSelectAll = () => {
     if (selectedUsers.length === users.length) {
         setSelectedUsers([]);
     } else {
         setSelectedUsers(users.map(u => u.id));
     }
  };
  
  return (
    <div className="scr">
      <div className="hdr">
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{width:'auto'}}>← Voltar</button>
        <div style={{fontWeight:900,fontSize:17}}>⚙️ Painel Admin</div>
        <div/>
      </div>
      <div style={{padding:'20px 16px'}}>
        <div className="sec-title" style={{marginBottom:8}}>Gerenciar Usuários (Admins)</div>
        <div style={{background:'var(--panel-bg)', padding: 12, borderRadius: 12, marginBottom: 24}}>
           {loadingUsers ? <div style={{color:'var(--mut)', fontSize:14}}>Carregando...</div> : (
              <div style={{display:'flex', flexDirection:'column', gap: 10, maxHeight: 250, overflowY:'auto'}}>
                {[...users].sort((a,b) => (b.isAdmin?1:0) - (a.isAdmin?1:0)).map((u: any) => (
                  <div key={u.id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px', background:'rgba(0,0,0,.2)', borderRadius:8}}>
                     <div style={{display:'flex', alignItems:'center', gap: 10}}>
                        <div style={{fontSize:20}}>{u.avatar}</div>
                        <div>
                           <div style={{fontSize:14, fontWeight:800, color:'var(--txt2)'}}>{u.nome} {u.isAdmin && <span style={{color:'var(--gold)', fontSize:12}}>🛡️ Adm</span>} {u.rankingBlocked && <span style={{color:'#FF6B6B', fontSize:12}}>🚫 Bloqueado</span>}</div>
                           <div style={{fontSize:11, color:'var(--mut)'}}>{u.email}</div>
                        </div>
                     </div>
                     {isSuperAdmin && u.email?.toLowerCase() !== SUPER_ADMIN_EMAIL && (
                       <div style={{display:'flex', flexWrap:'wrap', gap: 6, justifyContent:'flex-end'}}>
                         <button onClick={() => handleToggleAdmin(u.id, !!u.isAdmin)} style={{background: u.isAdmin ? 'rgba(227,28,61,.2)' : 'rgba(79,184,92,.2)', color: u.isAdmin ? '#FF6B6B' : '#4FB85C', border:'none', borderRadius:6, padding:'6px 10px', fontSize:11, fontWeight:800, cursor:'pointer'}}>
                            {u.isAdmin ? 'Remover Adm' : 'Tornar Adm'}
                         </button>
                         <button onClick={() => handleToggleBlock(u.id, !!u.rankingBlocked)} style={{background: u.rankingBlocked ? 'rgba(79,184,92,.2)' : 'rgba(255,165,0,.2)', color: u.rankingBlocked ? '#4FB85C' : '#FFA500', border:'none', borderRadius:6, padding:'6px 10px', fontSize:11, fontWeight:800, cursor:'pointer'}}>
                            {u.rankingBlocked ? 'Desbloquear' : 'Bloquear Ranking'}
                         </button>
                         <button onClick={() => handleDeleteUser(u.id, u.nome)} style={{background: 'rgba(227,28,61,.2)', color: '#FF6B6B', border:'none', borderRadius:6, padding:'6px 10px', fontSize:11, fontWeight:800, cursor:'pointer'}}>
                            🗑️ Excluir
                         </button>
                       </div>
                     )}
                  </div>
                ))}
              </div>
           )}
        </div>

        <div className="sec-title" style={{marginBottom:8}}>Notificações Manuais</div>
        <div style={{background:'var(--panel-bg)', padding: 12, borderRadius: 12, marginBottom: 24}}>
           {loadingUsers ? <div style={{color:'var(--mut)', fontSize:14}}>Carregando...</div> : (
             <>
               <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
                  <div style={{fontSize:13, color:'var(--mut)', fontWeight:800}}>Selecione os Destinatários:</div>
                  <button onClick={toggleSelectAll} className="btn btn-ghost btn-sm" style={{width:'auto', padding:'4px 8px', fontSize:12, margin:0, minHeight:0}}>{selectedUsers.length === users.length && users.length > 0 ? 'Desmarcar Todos' : 'Selecionar Todos'}</button>
               </div>
               <div style={{display:'flex', flexDirection:'column', gap: 6, maxHeight: 150, overflowY:'auto', marginBottom:16, border:'1px solid rgba(255,255,255,.05)', borderRadius:8, padding:4}}>
                 {users.map((u: any) => (
                   <label key={u.id} style={{display:'flex', alignItems:'center', gap:10, padding:'6px 8px', background:'rgba(0,0,0,.2)', borderRadius:6, cursor:'pointer'}}>
                     <input type="checkbox" checked={selectedUsers.includes(u.id)} onChange={() => toggleSelectUser(u.id)} style={{accentColor:'var(--gold)', width:16, height:16}} />
                     <div style={{fontSize:16}}>{u.avatar}</div>
                     <div style={{fontSize:14, color:'var(--txt2)', fontWeight:600}}>{u.nome}</div>
                   </label>
                 ))}
               </div>
               
               <div style={{fontSize:13, color:'var(--mut)', fontWeight:800, marginBottom:8}}>Título da Notificação:</div>
               <input type="text" value={notifTitle} onChange={e => setNotifTitle(e.target.value)} style={{width:'100%', padding:'10px', borderRadius:8, background:'var(--input-bg)', border:'1px solid var(--input-border)', color:'var(--txt2)', fontSize:14, marginBottom:12, transition:'background .3s'}} placeholder="Ex: Hora do estudo!" />
               
               <div style={{fontSize:13, color:'var(--mut)', fontWeight:800, marginBottom:8}}>Mensagem:</div>
               <textarea value={notifBody} onChange={e => setNotifBody(e.target.value)} style={{width:'100%', padding:'10px', borderRadius:8, background:'var(--input-bg)', border:'1px solid var(--input-border)', color:'var(--txt2)', fontSize:14, marginBottom:16, minHeight:60, resize:'vertical', transition:'background .3s'}} placeholder="Ex: Venha completar sua lição..." />
               
               <button onClick={handleSendNotif} disabled={sendingNotif} className={`btn btn-gold ${sendingNotif ? 'btn-dis' : ''}`} style={{fontSize:15, padding:'10px'}}>
                  {sendingNotif ? 'Enviando...' : `🚀 Enviar para ${selectedUsers.length} usuário(s)`}
               </button>
             </>
           )}
        </div>

        <div style={{marginTop:8,padding:16,background:'rgba(255,255,255,.03)',borderRadius:12}}>
          <div style={{fontWeight:800,color:'var(--mut)',fontSize:11,marginBottom:8,textTransform:'uppercase',letterSpacing:1}}>Lição Atual</div>
          <div style={{fontSize:14,color:'var(--txt2)'}}>📖 {licao.titulo}</div>
          <div style={{fontSize:13,color:'var(--mut)'}}>📅 {licao.dias.length} dias | {licao.trimestre}</div>
        </div>
      </div>
    </div>
  );
};

/* ===== CONFIG ===== */
export const Config = ({ jogador, onSave, onBack, onLogout, theme, onThemeChange }: any) => {
  const [nome, setNome] = useState(jogador.nome || '');
  const [avatar, setAvatar] = useState(jogador.avatar || '🦁');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const img = new Image();
    const r = new FileReader();
    r.onload = ev => {
      img.onload = () => {
        const cvs = document.createElement('canvas');
        const MAX = 96;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) return;
        if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
        else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
        cvs.width = w; cvs.height = h;
        const ctx = cvs.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = cvs.toDataURL('image/jpeg', 0.65);
        if (dataUrl && dataUrl.length > 100) setAvatar(dataUrl);
      };
      img.onerror = () => alert('Não foi possível ler a imagem. Tente outro arquivo.');
      img.src = ev.target?.result as string;
    };
    r.onerror = () => alert('Erro ao carregar a foto. Tente novamente.');
    r.readAsDataURL(f);
  };

  return (
    <div className="scr">
      <div className="hdr">
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{width:'auto'}}>← Voltar</button>
        <div style={{fontWeight:900,fontSize:17}}>⚙️ Configurações</div>
        <div/>
      </div>
      <div style={{padding:'20px 16px', display:'flex', flexDirection:'column', gap:20, flex: 1}}>
        
        <div style={{background:'var(--panel-bg)', padding: '20px 16px', borderRadius: 16, border:'1px solid var(--panel-border)'}}>
          <div style={{fontWeight:800, marginBottom:20, color:'var(--txt2)'}}>Seu Perfil</div>
          
          <div style={{display:'flex', alignItems:'center', gap:16, marginBottom: 24}}>
            <div style={{width: 72, height: 72, borderRadius: 16, background:'rgba(255,255,255,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize: 36, overflow:'hidden', flexShrink: 0, boxShadow:'0 4px 10px rgba(0,0,0,.2)'}}>
              {avatar.length > 10 ? <img src={avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="avatar"/> : <span>{avatar}</span>}
            </div>
            <div style={{flex: 1}}>
              <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} style={{width:'100%', background:'rgba(245,200,66,.1)', color:'var(--gold)', padding:'8px', marginBottom: 8}}>📸 Enviar Imagem</button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{display:'none'}}/>
              <div style={{fontSize: 11, color: '#B9ACE6', textAlign:'center', marginBottom: 4}}>OU DIGITE UM EMOJI</div>
              <input type="text" value={avatar.length < 10 ? avatar : ''} onChange={e => setAvatar(e.target.value)} placeholder="Ex: 👾" style={{width: '100%', padding: '8px', borderRadius: 8, background:'var(--input-bg)', color:'var(--txt)', border:'1px solid var(--input-border)', textAlign:'center', outline:'none', transition:'background .3s'}} maxLength={2}/>
            </div>
          </div>

          <div style={{marginBottom: 20}}>
            <div style={{fontSize: 12, fontWeight: 700, color:'var(--mut)', marginBottom: 8, textTransform:'uppercase', letterSpacing:1}}>Sugestões de Emojis</div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap: 8, background:'rgba(0,0,0,.2)', padding: 12, borderRadius: 12, border: '1px solid rgba(255,255,255,.05)', maxHeight: 180, overflowY: 'auto'}}>
              {['🦁', '🐯', '🦊', '🐺', '🐨', '🐼', '🦅', '🦉', '🐬', '🐙', '🦖', '👾', '🤖', '👑', '🌟', '⚡', '🔥', '🎯', '🚀', '🎮', '⚽', '🏆', '🎨', '🎸', '🎒', '📚', '🍕', '🍿', '🐶', '🐱', '🐭', '🐹', '🐰', '🐻', '🐻‍❄️', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦇', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🐢', '🐍', '🦕', '🦂', '🐠', '🐟', '🍔', '🍟', '🍩', '🍪', '🍫', '🍬'].map(emo => (
                <button
                  key={emo}
                  type="button"
                  onClick={() => setAvatar(emo)}
                  style={{
                    fontSize: 24,
                    height: 40,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: avatar === emo ? 'rgba(245,200,66,.2)' : 'transparent',
                    border: avatar === emo ? '2px solid #F5C842' : '1px solid transparent',
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {emo}
                </button>
              ))}
            </div>
          </div>

          <div>
             <div style={{fontSize: 12, fontWeight: 700, color:'var(--mut)', marginBottom: 8, textTransform:'uppercase', letterSpacing:1}}>Nome de Exibição</div>
             <input type="text" value={nome} onChange={e => setNome(e.target.value)} style={{width:'100%', padding:'14px 16px', borderRadius: 12, background:'var(--input-bg)', color:'var(--txt)', border:'1px solid var(--input-border)', fontSize: 16, outline:'none', transition:'background .3s,color .3s', fontFamily:'Poppins,sans-serif'}} />
          </div>

          <div style={{marginTop: 24}}>
             <div style={{fontSize: 12, fontWeight: 700, color:'var(--mut)', marginBottom: 8, textTransform:'uppercase', letterSpacing:1}}>Notificações do Sistema</div>
             <button 
               onClick={async () => {
                 if (!('Notification' in window) || !('serviceWorker' in navigator)) {
                   alert("Notificações Push não são suportadas diretamente no Safari antigo.\n\nNo iPhone/iPad (iOS 16.4+):\n1. Toque em 'Compartilhar' no menu do Safari.\n2. Escolha 'Adicionar à Tela de Início'.\n3. Abra o app pela Tela de Início e ative as notificações!");
                   return;
                 }
                 const perm = await Notification.requestPermission();
                 if (perm === 'granted') {
                   alert("Notificações ativadas com sucesso! Você receberá lembretes e mensagens do professor no celular/PC.");
                 } else {
                   alert("As notificações foram bloqueadas/negadas. Você pode precisar ir nas configurações do navegador/site para permitir o recebimento.");
                 }
               }} 
               className="btn btn-ghost" 
               style={{width:'100%', borderColor:'rgba(255,255,255,.1)', color:'var(--gold)', padding:'12px'}}
             >
               🔔 HABILITAR NOTIFICAÇÕES
             </button>
             <div style={{fontSize: 11, color: '#B9ACE6', marginTop: 8, textAlign:'center'}}>
                Para iOS/iPhone: É necessário "Adicionar à Tela de Início" primeiro. Quando o app estiver fechado, os avisos chegarão pelo sistema do seu celular! Mas não se preocupe: novos avisos também aparecerão na tela quando você abrir o app.
             </div>
          </div>
        </div>

        <div style={{background:'var(--panel-bg)', padding: '14px 16px', borderRadius: 14, border:'1px solid var(--panel-border)'}}>
          <div style={{fontSize: 11, fontWeight: 700, color:'var(--mut)', marginBottom: 10, textTransform:'uppercase', letterSpacing:1, fontFamily:'Poppins,sans-serif'}}>Aparência</div>
          <div className="theme-toggle">
            <button className={`theme-btn${theme === 'light' ? ' active' : ''}`} onClick={() => onThemeChange('light')}>☀️ Claro</button>
            <button className={`theme-btn${theme === 'auto' ? ' active' : ''}`} onClick={() => onThemeChange('auto')}>🌓 Auto</button>
            <button className={`theme-btn${theme === 'dark' ? ' active' : ''}`} onClick={() => onThemeChange('dark')}>🌙 Escuro</button>
          </div>
        </div>

        <button className="btn btn-gold" onClick={() => onSave({ ...jogador, nome, avatar })} style={{fontSize: 18, marginTop: 10}}>✅ SALVAR ALTERAÇÕES</button>
        
        <div style={{marginTop: 'auto', paddingTop: 40}}>
           <button className="btn btn-ghost" onClick={onLogout} style={{color:'#FF6B6B', borderColor:'rgba(227,28,61,.3)', width:'100%'}}>🚪 Sair da conta (Logout)</button>
        </div>
      </div>
    </div>
  );
};

