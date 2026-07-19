import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DEMO, LICOES, getTrackLessons } from './data';
import { gs, ss, uid, AVTS, xpSpeed, getDiaId, getMsgRes, calcPos, PROG0, shareApp, playSound, formatDiaSemana, getAudioCtx, computeRealStreak } from './utils';

export type Track = 'teen' | 'youngAdult' | 'adult';
export const TRACK_LABELS: Record<Track, string> = { teen: '🧑 Adolescente', youngAdult: '🧑‍🎓 Jovem', adult: '👨‍👩‍👧 Adulto' };

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
import { signInWithGoogle, getUser, getAllUsers, toggleAdmin, toggleGuest, toggleProfessor, blockUser, deleteUser, sendManualNotification, saveDayOverride, getWeeklyRanking, getUserAllDone, getAllUsersStreaks, getStudyLocations, createStudyLocation, adminSetUserLocation, assignTeacherLocation, removeTeacherAssignment, getAllTeacherAssignments } from './firebase';

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
export const Home = ({ jogador, licao, prog, onEstudo, onRanking, onRankingSemana, onConfig, onChangeLicao }: any) => {
  const temConteudo = !licao.isComingSoon && licao.dias?.length > 0;
  const diaId = temConteudo ? getDiaId(licao.dias) : null;
  const diaAtual = temConteudo ? licao.dias.find((d: any) => d.id === diaId) : null;

  const getSt = (dia: any) => {
    if (prog.done.includes(dia.id)) return 'done';
    if (dia.id === diaId) return 'today';
    if (jogador.isAdmin || jogador.isProfessor) return 'missed'; // Admin/Professor podem acessar todos os dias como se tivessem perdido, então não fica bloqueado.
    if (dia.id < diaId) return 'missed';
    return 'locked';
  };
  const concHoje = prog.done.includes(diaId);

  const trackLessons = useMemo(() => getTrackLessons(jogador?.track), [jogador?.track]);
  const visiveis = useMemo(() => trackLessons.filter((l: any) => !l.isAdminOnly || jogador?.isAdmin || jogador?.isProfessor), [trackLessons, jogador?.isAdmin, jogador?.isProfessor]);

  // Dias concluídos de todas as semanas (para marcar semanas anteriores na trilha)
  const [allDone, setAllDone] = useState<Record<string, number[]>>({});
  useEffect(() => {
    if (!jogador?.id) return;
    getUserAllDone(jogador.id).then(setAllDone).catch(() => {});
  }, [jogador?.id]);

  // Remove o prefixo "Lição N -/—" e a data entre parênteses do título bruto
  const tituloCurto = (titulo: string) => (titulo || '')
    .replace(/^Lição\s*\d+\s*[-—]\s*/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();

  // Ofensiva real da temporada (🔥) — derivada do Firestore (allDone + trackLessons),
  // não do localStorage do aparelho (troca de celular não zera mais)
  const seasonStreak = useMemo(() => computeRealStreak(allDone, trackLessons), [allDone, trackLessons]);

  // Banner suspenso acompanha a semana visível na rolagem (e a selecionada)
  const [bannerL, setBannerL] = useState<any>(licao);
  const [showTop, setShowTop] = useState(false);
  useEffect(() => { setBannerL(licao); }, [licao.semana]);
  const secRefs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        setShowTop(window.scrollY > 400);
        let cur: any = null;
        for (const l of visiveis) {
          const el = secRefs.current[l.semana];
          if (el && el.getBoundingClientRect().top <= 175) cur = l;
        }
        if (cur) setBannerL((prev: any) => (prev?.semana === cur.semana ? prev : cur));
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [visiveis]);

  return (
    <div className="scr" style={{paddingBottom:100}}>
      {/* Header fixo: avatar+nome · XP (destaque central) · ofensiva */}
      <div className="hdr stats-hdr">
        <button className="stat-user" onClick={onConfig} aria-label="Perfil">
          <span className="stat-avatar">
            {jogador.avatar?.length > 10 ? <img src={jogador.avatar} alt="avatar"/> : <span>{jogador.avatar}</span>}
          </span>
          <span className="stat-name">{jogador.nome?.split(' ')[0]}</span>
        </button>
        <div className="stat-xp" aria-label={`${prog.xp} pontos de experiência`}>⭐ <b>{prog.xp}</b><span className="stat-xp-lbl">XP</span></div>
        <div className="stat-fire" aria-label={`Ofensiva de ${seasonStreak} dias`}>🔥<b>{seasonStreak}</b></div>
      </div>

      <div className="sec" style={{paddingTop:10}}>
        {visiveis.length === 0 ? (
          <div style={{textAlign:'center', padding:'60px 24px', color:'var(--mut)'}}>
            <div style={{fontSize:52, marginBottom:16}}>🚧</div>
            <div style={{fontSize:18, fontWeight:900, color:'var(--txt2)', marginBottom:8}}>Em breve</div>
            <div style={{fontSize:14, lineHeight:1.5}}>
              A lição da sua trilha ({TRACK_LABELS[(jogador.track as Track) || 'teen']}) ainda está sendo preparada.<br/>
              Assim que estiver pronta, ela aparece aqui automaticamente.
            </div>
          </div>
        ) : (() => {
          const h = new Date();
          const hojeISO = new Date(h.getTime() - h.getTimezoneOffset() * 60000).toISOString().split('T')[0];
          const totalSemanas = visiveis.filter((l: any) => !l.isAdminOnly).length;
          const numBanner = visiveis.findIndex((l: any) => l.semana === bannerL?.semana) + 1;
          const pathOff = (gi: number) => Math.round(Math.sin((gi * Math.PI) / 3.5) * 70);
          return (
            <>
              {/* Card da unidade (amarelo, estilo Duolingo): fixo e acompanha a semana visível */}
              <div className="unit-card trail-sticky">
                <div style={{flex:1,minWidth:0,padding:'11px 16px'}}>
                  <div className="unit-eyebrow">
                    {bannerL?.isAdminOnly ? '🧪 Lição de teste' : `Semana ${numBanner} de ${totalSemanas}`}
                    {!bannerL?.isAdminOnly && bannerL?.trimestre && <span className="unit-campanha"> · {bannerL.trimestre}</span>}
                  </div>
                  <div className="unit-title">{tituloCurto(bannerL?.titulo)}</div>
                </div>
                <button
                  className="unit-ic-btn"
                  title="Ranking desta semana"
                  aria-label="Ranking desta semana"
                  onClick={() => (onRankingSemana || onRanking)(bannerL)}
                >📖</button>
              </div>
              <div className="trail">
              {visiveis.map((l: any, wi: number) => {
                const sel = l.semana === licao.semana;
                const liberada = !!l.dias[0]?.data && l.dias[0].data <= hojeISO;
                const acessivel = liberada || !!jogador?.isAdmin || !!jogador?.isProfessor;
                const emCurso = liberada && !!l.dias[l.dias.length - 1]?.data && hojeISO <= l.dias[l.dias.length - 1].data;
                return (
                  <div key={l.semana} ref={(el: any) => { secRefs.current[l.semana] = el; if (sel && el && !el.dataset.scrolled) { el.dataset.scrolled = '1'; setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150); } }} style={{scrollMarginTop:160}}>
                    <div
                      className={`week-divider ${sel ? 'sel' : ''} ${!acessivel ? 'locked' : ''}`}
                      onClick={() => acessivel && !sel && onChangeLicao && onChangeLicao(l)}
                    >
                      <div className="wl"/>
                      <span>
                        {l.isAdminOnly ? '🧪 Teste' : `Semana ${wi + 1}`}{emCurso ? ' ⭐' : ''}{!acessivel ? ' 🔒' : ''} — {tituloCurto(l.titulo)}
                      </span>
                      <div className="wl"/>
                    </div>
                    <div className="path-wrap">
                      {l.dias.map((dia: any, i: number) => {
                        const off = pathOff(wi * 7 + i);
                        const feitoOutraSemana = !sel && (allDone[l.semana] || []).includes(dia.id);
                        const st = sel ? getSt(dia) : feitoOutraSemana ? 'done' : acessivel ? 'missed' : 'locked';
                        const isToday = sel && st === 'today';
                        return (
                          <div key={dia.id} className="path-step" style={{transform:`translateX(${off}px)`}}>
                            {isToday && !concHoje && <div className="path-tip">COMEÇAR</div>}
                            {isToday && (
                              <div className="path-mascote" style={off >= 0 ? {left:-84,top:4} : {right:-84,top:4}}>
                                {jogador.avatar?.length > 10 ? <img src={jogador.avatar} alt="avatar"/> : <span>{jogador.avatar}</span>}
                              </div>
                            )}
                            <button
                              className={`path-node ${st}`}
                              onClick={() => {
                                if (st === 'locked') return;
                                if (sel) onEstudo(dia);
                                else if (onChangeLicao) onChangeLicao(l);
                              }}
                            >
                              {isToday && <div className="path-ring"/>}
                              {st === 'done' ? '⭐' : st === 'locked' ? '🔒' : '📖'}
                            </button>
                            <div className={`path-label ${isToday ? 'hoje' : ''}`}>{formatDiaSemana(dia.diaSemana)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              </div>
            </>
          );
        })()}
      </div>

      {/* Botão flutuante: voltar ao topo da trilha */}
      <button
        className={`fab-top ${showTop ? 'show' : ''}`}
        aria-label="Voltar ao topo"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >↑</button>
    </div>
  );
};

/* ===== NAVBAR FIXA (global, renderizada pelo App em todas as telas exceto Quiz) ===== */
export const BottomNav = ({ active, jogador, diaAtual, onHome, onRanking, onEstudo, onConfig, onAdmin, onSorteador, onMais }: any) => {
  const canManage = !!jogador?.isAdmin || !!jogador?.isProfessor;
  return (
    <div className="bot-nav" style={{padding:'6px 8px 14px'}}>
      <div className="nav-row">
        <button className={`nav-it ${active === 'home' ? 'active' : ''}`} onClick={onHome} aria-label="Início"><span className="nav-ic">🏠</span>Início</button>
        <button className={`nav-it ${active === 'ranking' ? 'active' : ''}`} onClick={onRanking} aria-label="Ranking"><span className="nav-ic">🏆</span>Ranking</button>
        {diaAtual && <button className={`nav-it ${active === 'estudo' ? 'active' : ''}`} onClick={() => onEstudo(diaAtual)} aria-label="Praticar"><span className="nav-ic">📖</span>Praticar</button>}
        {canManage && <button className={`nav-it ${active === 'sorteador' ? 'active' : ''}`} onClick={onSorteador} aria-label="Sorteio"><span className="nav-ic">🎰</span>Sorteio</button>}
        <button className={`nav-it ${active === 'config' ? 'active' : ''}`} onClick={onConfig} aria-label="Perfil"><span className="nav-ic">⚙️</span>Perfil</button>
        {canManage
          ? <button className={`nav-it ${active === 'admin' ? 'active' : ''}`} onClick={onAdmin} aria-label="Admin"><span className="nav-ic">🛡️</span>Admin</button>
          : <button className="nav-it" onClick={onMais} aria-label="Mais"><span className="nav-ic">🔗</span>Mais</button>}
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
      const list = [...(prev[sel.pIndex] || [])];
      if (sel.hlIdx !== undefined) {
        list[sel.hlIdx] = { ...list[sel.hlIdx], color };
      } else {
        list.push({ text: sel.text, color });
      }
      return { ...prev, [sel.pIndex]: list };
    });
    setSel(null);
    window.getSelection()?.removeAllRanges();
  };

  const removeHl = (pIdx: number, hlIdx: number) => {
    setHl((prev: any) => {
      const list = [...(prev[pIdx] || [])];
      list.splice(hlIdx, 1);
      return { ...prev, [pIdx]: list };
    });
    setSel(null);
  };

  const renderP = (p: string, pIdx: number) => {
    let res: any[] = [p];
    const myHls = hl[pIdx] || [];

    myHls.forEach((h: any, hlIdx: number) => {
      const newRes: any[] = [];
      res.forEach((chunk: any) => {
        if (typeof chunk !== 'string') { newRes.push(chunk); return; }
        const parts = chunk.split(h.text);
        parts.forEach((pt, i) => {
          newRes.push(pt);
          if (i < parts.length - 1) {
            const txtColor = h.color === '#F7C600' ? '#1A0A00' : '#fff';
            newRes.push(
              <span
                key={`${hlIdx}-${i}`}
                style={{background: h.color, color: txtColor, padding:'0 3px', borderRadius:3, fontWeight: h.color === '#F7C600' ? 700 : 400, cursor:'pointer', outline: sel?.hlIdx === hlIdx && sel?.pIndex === pIdx ? '2px solid white' : 'none'}}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setSel({ pIndex: pIdx, text: h.text, hlIdx }); }}
              >
                {h.text}
              </span>
            );
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
        <div style={{position:'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background:'var(--notif-bg)', padding: '8px 14px', borderRadius: 30, display:'flex', flexDirection:'column', alignItems:'center', gap: 6, boxShadow:'0 10px 30px rgba(0,0,0,.4)', zIndex: 1000, border:'1px solid var(--notif-border)', animation:'fadeUp .2s ease'}}>
           <div style={{fontSize:10, color:'var(--mut)', fontWeight:700, textTransform:'uppercase', letterSpacing:1}}>
             {sel.hlIdx !== undefined ? '✏️ Trocar cor ou remover' : '🎨 Destacar'}
           </div>
           <div style={{display:'flex', gap:10, alignItems:'center'}}>
             {['#F7C600', '#1E9E86', '#E5006D', '#4A90D9'].map(c => (
               <div key={c} onMouseDown={(e) => { e.preventDefault(); addHl(c); }} style={{width: 30, height: 30, borderRadius: '50%', background: c, border: sel.hlIdx !== undefined && (hl[sel.pIndex]?.[sel.hlIdx]?.color === c) ? '3px solid white' : '2px solid rgba(255,255,255,.5)', cursor:'pointer', boxShadow:'0 2px 5px rgba(0,0,0,.4)', transition:'transform .1s'}} />
             ))}
             <div
               onMouseDown={(e) => {
                 e.preventDefault();
                 if (sel.hlIdx !== undefined) removeHl(sel.pIndex, sel.hlIdx);
                 else { setSel(null); window.getSelection()?.removeAllRanges(); }
               }}
               style={{width: 30, height: 30, borderRadius: '50%', background: sel.hlIdx !== undefined ? 'rgba(227,28,61,.3)' : '#333', border:'2px solid rgba(255,255,255,.2)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize: 13}}
             >
               {sel.hlIdx !== undefined ? '🗑️' : '❌'}
             </div>
           </div>
        </div>
      )}
      <div className="hdr">
        <button className="btn btn-ghost btn-sm" onClick={() => wrapLeave(onBack)} style={{width:'auto'}}>← Voltar</button>
        <div style={{fontWeight:800,fontSize:14}}>Dia {dia.id} — {formatDiaSemana(dia.diaSemana)}</div>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          {(jogador?.isAdmin || jogador?.isProfessor) && (
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

        {prog.done.includes(dia.id) && !jogador?.isAdmin && !jogador?.isProfessor ? (
          <button className="btn btn-gold" style={{fontSize:19, background:'#2ECC71', filter:'brightness(0.8)', cursor:'not-allowed'}} onClick={(e) => e.preventDefault()}>✅ QUIZ CONCLUÍDO</button>
        ) : (
          <button className="btn btn-gold" onClick={() => {
            if (jogador?.isAdmin || jogador?.isProfessor || window.confirm("Atenção! O quiz só pode ser feito UMA VEZ para somar pontos no ranking.\n\nVocê já revisou todo o estudo e está pronto para começar?")) {
              wrapLeave(onQuiz);
            }
          }} style={{fontSize:19}}>
             {prog.done.includes(dia.id) && (jogador?.isAdmin || jogador?.isProfessor) ? '🎯 REFAZER QUIZ (ADM)' : '🎯 FAZER O QUIZ'}
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

/* ===== EXPORTAR RANKING (imagem para WhatsApp) ===== */
const loadAvatarImg = (src: string): Promise<HTMLImageElement | null> => new Promise(res => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = () => res(null);
  img.src = src;
});

const rrect = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
};

const truncName = (n: string, max: number) => (n || '').length > max ? (n || '').slice(0, max - 1) + '…' : (n || '');

const drawAvatar = async (c: CanvasRenderingContext2D, avatar: string, cx: number, cy: number, r: number) => {
  c.save();
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,255,255,.12)';
  c.fill();
  c.clip();
  if (avatar?.startsWith('data:')) {
    const img = await loadAvatarImg(avatar);
    if (img) {
      const s = Math.max((r * 2) / img.width, (r * 2) / img.height);
      c.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
    }
  } else {
    c.font = `${Math.round(r * 1.15)}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(avatar || '⭐', cx, cy + r * 0.06);
  }
  c.restore();
};

const gerarImagemRanking = async (opts: {
  emDia: any[]; atrasados: any[]; regular: any[];
  type: string; licao: any; metaDias: number; zoneOn: boolean;
}): Promise<Blob | null> => {
  const { emDia, atrasados, regular, type, licao, metaDias, zoneOn } = opts;
  const W = 1080;
  const podio = regular.slice(0, 3);
  const listaRows = [...emDia, ...atrasados].slice(0, 12);
  const nDividers = zoneOn && emDia.length > 0 && atrasados.length > 0 ? 1 : 0;
  const H = 330 + (podio.length >= 3 ? 470 : 120) + listaRows.length * 96 + nDividers * 70 + 300 + 190;

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  if (!c) return null;
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';

  // Fundo com gradiente do app + estrelas
  const bg = c.createLinearGradient(0, 0, W * .4, H);
  bg.addColorStop(0, '#0D1E35');
  bg.addColorStop(1, '#1B3A63');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    c.fillStyle = `rgba(247,198,0,${.08 + Math.random() * .25})`;
    c.beginPath();
    c.arc(Math.random() * W, Math.random() * H, 1 + Math.random() * 2.5, 0, Math.PI * 2);
    c.fill();
  }

  // Cabeçalho
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.font = '900 74px sans-serif';
  c.fillStyle = '#F7C600';
  const wSab = c.measureText('SABATINA').width;
  c.font = '900 74px sans-serif';
  const wQst = c.measureText('QUEST').width;
  const x0 = W / 2 - (wSab + wQst) / 2;
  c.textAlign = 'left';
  c.fillText('SABATINA', x0, 108);
  c.fillStyle = '#1E9E86';
  c.fillText('QUEST', x0 + wSab, 108);
  c.textAlign = 'center';
  c.font = '700 24px sans-serif';
  c.fillStyle = '#7DA4C8';
  c.fillText('E S C O L A   S A B A T I N A   T E E N', W / 2, 150);

  c.font = '900 52px sans-serif';
  c.fillStyle = '#FFFFFF';
  c.fillText(type === 'week' ? '🏆 RANKING DA SEMANA' : '🏆 RANKING DA TEMPORADA', W / 2, 235);
  c.font = '700 32px sans-serif';
  c.fillStyle = '#C8D8F0';
  c.fillText(type === 'week' ? truncName(licao?.titulo || '', 42) : `Temporada ${licao?.trimestre || ''} · 13 semanas`, W / 2, 285);

  let y = 330;

  // Pódio
  if (podio.length >= 3) {
    const podX = [W / 2, W / 2 - 330, W / 2 + 330];
    const podR = [105, 78, 78];
    const podY = [y + 165, y + 205, y + 205];
    const medY = [y + 330, y + 330, y + 330];
    const medalha = ['🥇', '🥈', '🥉'];
    for (const [ord, pi] of [[1, 1], [2, 2], [0, 0]] as any) {
      const u = podio[pi];
      const cx = podX[pi], r = podR[pi], cy = podY[pi];
      if (pi === 0) {
        c.font = '64px sans-serif';
        c.fillText('👑', cx, cy - r - 24);
        c.strokeStyle = '#F7C600';
        c.lineWidth = 8;
        c.beginPath();
        c.arc(cx, cy, r + 8, 0, Math.PI * 2);
        c.stroke();
        c.shadowColor = 'rgba(247,198,0,.8)';
        c.shadowBlur = 40;
        c.beginPath();
        c.arc(cx, cy, r + 8, 0, Math.PI * 2);
        c.stroke();
        c.shadowBlur = 0;
      }
      await drawAvatar(c, u.avatar, cx, cy, r);
      c.font = `900 ${pi === 0 ? 40 : 30}px sans-serif`;
      c.fillStyle = pi === 0 ? '#F7C600' : '#FFFFFF';
      c.textAlign = 'center';
      c.fillText(truncName(u.nome, 14), cx, medY[pi]);
      c.font = '52px sans-serif';
      c.fillText(medalha[pi], cx, medY[pi] + 62);
      c.font = '900 32px sans-serif';
      c.fillStyle = '#F7C600';
      c.fillText(`${u.xp || 0} XP`, cx, medY[pi] + 112);
    }
    y += 470;
  } else {
    y += 40;
  }

  // Lista com zonas
  const mx = 60, rw = W - mx * 2;
  const drawDivider = (label: string, cor: string) => {
    c.strokeStyle = cor;
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(mx, y + 32); c.lineTo(W / 2 - 290, y + 32); c.stroke();
    c.beginPath(); c.moveTo(W / 2 + 290, y + 32); c.lineTo(W - mx, y + 32); c.stroke();
    c.font = '900 26px sans-serif';
    c.fillStyle = cor;
    c.textAlign = 'center';
    c.fillText(label, W / 2, y + 42);
    y += 70;
  };

  for (let gi = 0; gi < listaRows.length; gi++) {
    const u = listaRows[gi];
    const promo = zoneOn && gi < emDia.length;
    if (nDividers && gi === emDia.length) {
      drawDivider('⬆ ZONA DE PROMOÇÃO — SORTEIO 🎰 ⬆', '#1E9E86');
    }
    const pos = regular.indexOf(u);
    rrect(c, mx, y, rw, 82, 20);
    c.fillStyle = promo ? 'rgba(30,158,134,.14)' : 'rgba(229,0,109,.09)';
    if (!zoneOn) c.fillStyle = 'rgba(255,255,255,.06)';
    c.fill();
    c.strokeStyle = promo ? 'rgba(30,158,134,.55)' : 'rgba(229,0,109,.4)';
    if (!zoneOn) c.strokeStyle = 'rgba(255,255,255,.12)';
    c.lineWidth = 3;
    c.stroke();
    c.textAlign = 'left';
    c.font = '900 34px sans-serif';
    c.fillStyle = pos < 3 ? '#F5C842' : promo ? '#1E9E86' : '#E5006D';
    c.fillText(pos < 3 ? ['🥇', '🥈', '🥉'][pos] : `${pos + 1}º`, mx + 26, y + 54);
    await drawAvatar(c, u.avatar, mx + 150, y + 41, 30);
    c.font = '800 32px sans-serif';
    c.fillStyle = '#FFFFFF';
    c.fillText(truncName(u.nome, 20), mx + 200, y + 43);
    c.font = '700 22px sans-serif';
    c.fillStyle = promo ? '#2BBBA0' : '#7DA4C8';
    c.fillText(promo ? `📅 ${u.dias || 0} dias · em dia 🎰` : `📅 ${u.dias || 0} dia${u.dias !== 1 ? 's' : ''}`, mx + 200, y + 71);
    c.textAlign = 'right';
    c.font = '900 34px sans-serif';
    c.fillStyle = '#F7C600';
    c.fillText(`${u.xp || 0} XP`, mx + rw - 26, y + 54);
    y += 96;
  }

  // Cartão CTA
  y += 24;
  const ctaH = 200;
  rrect(c, mx, y, rw, ctaH, 26);
  const gld = c.createLinearGradient(mx, y, mx + rw, y + ctaH);
  gld.addColorStop(0, '#F7C600');
  gld.addColorStop(1, '#C99F00');
  c.fillStyle = gld;
  c.fill();
  c.textAlign = 'center';
  c.fillStyle = '#3A2800';
  if (type === 'week') {
    c.font = '900 36px sans-serif';
    c.fillText('🎰 SORTEIO DA SEMANA!', W / 2, y + 70);
    c.font = '700 28px sans-serif';
    c.fillText('Estude todos os dias, fique na zona de', W / 2, y + 120);
    c.fillText('promoção e concorra ao sorteio!', W / 2, y + 158);
  } else {
    c.font = '900 36px sans-serif';
    c.fillText('👑 GRANDE SORTEIO DA TEMPORADA!', W / 2, y + 66);
    c.font = '700 27px sans-serif';
    c.fillText('Revise as lições e fique em dia para participar.', W / 2, y + 114);
    c.fillText('Quem sabe você é o campeão da temporada?', W / 2, y + 154);
  }
  y += ctaH + 46;

  // Rodapé com o link do app
  c.font = '700 26px sans-serif';
  c.fillStyle = '#C8D8F0';
  c.fillText('📲 Venha estudar com a gente:', W / 2, y + 16);
  c.font = '900 34px sans-serif';
  c.fillStyle = '#F7C600';
  c.fillText(window.location.origin.replace(/^https?:\/\//, ''), W / 2, y + 64);

  return new Promise(res => cv.toBlob(b => res(b), 'image/png'));
};

/* ===== RANKING ===== */
export const Ranking = ({ jogador, ranking, prog, type, onChangeType, onBack, licao }: any) => {
  const { regular, staff } = useMemo(() => {
    const all = [...ranking].map((r: any) => {
      const isMe = r.id === jogador.id;
      const nome = isMe ? jogador.nome : r.nome;
      const avatar = isMe ? jogador.avatar : r.avatar;
      const dias = isMe && type === 'week' ? (prog.done?.length || 0) : (r.dias ?? (r.done?.length || 0));
      const xp = isMe && type === 'week' ? (prog.xp || 0) : (r.xp || 0);
      const isAdmin = r.isAdmin || (isMe && !!jogador.isAdmin);
      const isProfessor = !isAdmin && (r.isProfessor || (isMe && !!jogador.isProfessor));
      return { ...r, nome, avatar, dias, xp, isAdmin, isProfessor };
    });
    const byXp = (a: any, b: any) => b.xp - a.xp;
    return {
      regular: all.filter((r: any) => !r.isAdmin && !r.isProfessor).sort(byXp).slice(0, 10),
      staff: all.filter((r: any) => r.isAdmin || r.isProfessor).sort(byXp),
    };
  }, [ranking, jogador, type, prog]);

  const myIsStaff = !!jogador.isAdmin || !!jogador.isProfessor;
  const myIdx = myIsStaff
    ? staff.findIndex((r: any) => r.id === jogador.id)
    : regular.findIndex((r: any) => r.id === jogador.id);
  const meds = ['🥇','🥈','🥉'];

  // Zonas estilo divisão: em dia com os dias liberados → zona do sorteio;
  // 1+ dia liberado sem fazer → zona de rebaixamento
  const { zoneOn, metaDias, emDia, atrasados } = useMemo(() => {
    const h = new Date();
    const hojeISO = new Date(h.getTime() - h.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    let meta = 0;
    if (type === 'week') {
      meta = (licao?.dias || []).filter((d: any) => d.data && d.data <= hojeISO).length;
    } else {
      meta = LICOES
        .filter((l: any) => !l.isAdminOnly && l.trimestre === licao?.trimestre)
        .reduce((acc: number, l: any) => acc + l.dias.filter((d: any) => d.data && d.data <= hojeISO).length, 0);
    }
    const on = meta > 0;
    return {
      zoneOn: on,
      metaDias: meta,
      emDia: on ? regular.filter((r: any) => (r.dias || 0) >= meta) : regular,
      atrasados: on ? regular.filter((r: any) => (r.dias || 0) < meta) : [],
    };
  }, [regular, type, licao]);

  const [sharing, setSharing] = useState(false);
  const handleExport = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const blob = await gerarImagemRanking({ emDia, atrasados, regular, type, licao, metaDias, zoneOn });
      if (!blob) throw new Error('Falha ao gerar imagem');
      const url = window.location.origin;
      const texto = type === 'week'
        ? `🏆 Ranking da semana — ${licao?.titulo || ''}\n🎰 Estude todos os dias e concorra ao sorteio!\n📲 Venha estudar com a gente: ${url}`
        : `🏆 Ranking da temporada ${licao?.trimestre || ''}\n👑 Revise as lições, fique em dia e participe do GRANDE SORTEIO da temporada! Quem sabe você é o campeão!\n📲 Venha estudar com a gente: ${url}`;
      const file = new File([blob], 'ranking-sabatinaquest.png', { type: 'image/png' });
      if ((navigator as any).canShare?.({ files: [file] })) {
        await (navigator as any).share({ files: [file], text: texto });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ranking-sabatinaquest.png';
        a.click();
        URL.revokeObjectURL(a.href);
        try { await navigator.clipboard.writeText(texto); } catch {}
        alert('Imagem baixada! O texto com o link foi copiado — cole no WhatsApp junto com a imagem. 📲');
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.error('Erro ao exportar ranking:', e);
    }
    setSharing(false);
  };

  const renderRow = (r: any, zone: 'promo' | 'down' | '') => {
    const eu = r.id === jogador.id;
    const i = regular.indexOf(r);
    const atraso = metaDias - (r.dias || 0);
    const bg = eu ? 'linear-gradient(135deg,rgba(247,198,0,.1),rgba(247,198,0,.04))'
      : zone === 'promo' ? 'linear-gradient(135deg,rgba(30,158,134,.1),rgba(30,158,134,.03))'
      : zone === 'down' ? 'linear-gradient(135deg,rgba(229,0,109,.08),rgba(229,0,109,.02))'
      : 'var(--g2)';
    const bd = eu ? 'rgba(247,198,0,.4)' : zone === 'promo' ? 'rgba(30,158,134,.4)' : zone === 'down' ? 'rgba(229,0,109,.3)' : 'var(--b2)';
    return (
      <div key={r.id} style={{background:bg,border:`2px solid ${bd}`,borderRadius:14,padding:'12px 16px',display:'flex',alignItems:'center',gap:12,animation:`popIn .3s ease ${i*.05}s both`,color:'var(--txt)'}}>
        <div style={{fontWeight:900,fontSize:16,width:26,textAlign:'center',color:i<3?'#F5C842':zone==='promo'?'var(--teal)':zone==='down'?'var(--magenta)':'var(--mut)'}}>{i < 3 ? meds[i] : `${i + 1}º`}</div>
        <div style={{width: 40, height: 40, borderRadius: '50%', background:'rgba(255,255,255,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize: 22, overflow:'hidden', flexShrink:0}}>
          {r.avatar?.length > 10 ? <img src={r.avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="avatar"/> : <span>{r.avatar}</span>}
        </div>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontWeight:800,fontSize:15,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'var(--txt)'}}>{r.nome}{eu ? ' 👈' : ''}</div>
          <div style={{fontSize:12,color:zone==='promo'?'var(--teal)':zone==='down'?'var(--magenta)':'var(--mut)',marginTop:2,fontWeight:zone?700:400}}>
            {zone === 'promo'
              ? <>📅 {r.dias || 0} dia{r.dias!==1?'s':''} · {type === 'week' ? '🎰 no sorteio' : '✅ em dia'}</>
              : zone === 'down'
                ? <>📅 {r.dias || 0} dia{r.dias!==1?'s':''} · ⚠️ {atraso} dia{atraso!==1?'s':''} atrasado{atraso!==1?'s':''}</>
                : <>📅 {r.dias || 0} dia{r.dias!==1?'s':''} estudado{r.dias!==1?'s':''}</>}
          </div>
        </div>
        <div style={{fontWeight:900,color:'var(--gold)',fontSize:15,flexShrink:0}}>{r.xp || 0} XP</div>
      </div>
    );
  };

  return (
    <div className="scr" style={{paddingBottom:100}}>
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

      {regular.length > 0 && (
        <div style={{padding:'0 16px 4px'}}>
          <button className="btn btn-gold" onClick={handleExport} disabled={sharing} style={{fontSize:14,padding:'12px 20px',opacity:sharing?.7:1}}>
            {sharing ? '⏳ GERANDO IMAGEM...' : '📤 COMPARTILHAR NO WHATSAPP'}
          </button>
        </div>
      )}
      
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
              <div style={{fontSize:20,animation:'bounce 2s ease-in-out infinite'}}>👑</div>
              <div style={{width: 62, height: 62, borderRadius: '50%', background:'rgba(255,255,255,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize: 34, overflow:'hidden', margin:'0 auto 4px', flexShrink:0, border:'2.5px solid #F5C842', animation:'goldGlow 2.2s infinite'}}>
                {regular[0].avatar?.length > 10 ? <img src={regular[0].avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="avatar"/> : <span>{regular[0].avatar}</span>}
              </div>
              <div style={{fontWeight:900,fontSize:14,maxWidth:78,textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--gold)'}}>{regular[0].nome}</div>
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
        {zoneOn && (
          <div className="zone-hint">
            🎰 Fique em dia com os {metaDias} dia{metaDias!==1?'s':''} já liberado{metaDias!==1?'s':''} para participar do sorteio
          </div>
        )}
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {emDia.map((r: any) => renderRow(r, zoneOn ? 'promo' : ''))}
          {zoneOn && emDia.length > 0 && (
            <div className="zone-divider promo">
              <div className="zl"/>
              <div className="zt">⬆ ZONA DE PROMOÇÃO — {type === 'week' ? 'SORTEIO 🎰' : 'EM DIA 📖'} ⬆</div>
              <div className="zl"/>
            </div>
          )}
          {zoneOn && atrasados.length > 0 && (
            <div className="zone-divider down">
              <div className="zl"/>
              <div className="zt">⬇ ZONA DE REBAIXAMENTO ⬇</div>
              <div className="zl"/>
            </div>
          )}
          {atrasados.map((r: any) => renderRow(r, 'down'))}
          {regular.length === 0 && <div style={{textAlign:'center',padding:'20px',color:'var(--mut)'}}>Ninguém pontuou ainda. Seja o primeiro!</div>}

          {staff.length > 0 && (
            <>
              <div style={{display:'flex',alignItems:'center',gap:8,margin:'4px 0'}}>
                <div style={{flex:1,height:1,background:'rgba(155,109,255,.3)'}}/>
                <div style={{fontSize:11,color:'var(--admin)',fontWeight:800,letterSpacing:1,fontFamily:'Poppins,sans-serif'}}>🛡️🎓 EQUIPE</div>
                <div style={{flex:1,height:1,background:'rgba(155,109,255,.3)'}}/>
              </div>
              {staff.map((r: any, i: number) => {
                const eu = r.id === jogador.id;
                const cor = r.isAdmin ? 'var(--admin)' : 'var(--blu)';
                const rgb = r.isAdmin ? '155,109,255' : '74,144,217';
                const ic = r.isAdmin ? '🛡️' : '🎓';
                return (
                  <div key={r.id} style={{background:eu?`linear-gradient(135deg,rgba(${rgb},.16),rgba(${rgb},.06))`:`rgba(${rgb},.08)`,border:`2px solid ${eu?`rgba(${rgb},.55)`:`rgba(${rgb},.25)`}`,borderRadius:14,padding:'12px 16px',display:'flex',alignItems:'center',gap:12,animation:`popIn .3s ease ${i*.05}s both`,color:'var(--txt)'}}>
                    <div style={{fontWeight:900,fontSize:14,width:26,textAlign:'center',color:cor}}>{ic}</div>
                    <div style={{width: 40, height: 40, borderRadius: '50%', background:`rgba(${rgb},.18)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize: 22, overflow:'hidden', flexShrink:0, border:`1.5px solid rgba(${rgb},.35)`}}>
                      {r.avatar?.length > 10 ? <img src={r.avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="avatar"/> : <span>{r.avatar}</span>}
                    </div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontWeight:800,fontSize:15,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:cor}}>{r.nome}{eu ? ' 👈' : ''}</div>
                      <div style={{fontSize:12,color:'var(--mut)',marginTop:2}}>📅 {r.dias || 0} dia{r.dias!==1?'s':''} estudado{r.dias!==1?'s':''}</div>
                    </div>
                    <div style={{fontWeight:900,color:cor,fontSize:15,flexShrink:0,opacity:.85}}>{r.xp || 0} XP</div>
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
          {myIsStaff
            ? <div style={{fontWeight:900,fontSize:22,color:jogador.isAdmin?'var(--admin)':'var(--blu)'}}>{jogador.isAdmin ? '🛡️ Admin' : '🎓 Professor'}</div>
            : <div style={{fontWeight:900,fontSize:32,color:'var(--gold)'}}>#{myIdx >= 0 ? myIdx + 1 : '?'}</div>
          }
          {myIdx !== -1 && (
            <div style={{fontSize:13,color:'var(--mut)'}}>
              📅 {(myIsStaff ? staff : regular)[myIdx]?.dias} dia{(myIsStaff ? staff : regular)[myIdx]?.dias!==1?'s':''} • ⭐ {(myIsStaff ? staff : regular)[myIdx]?.xp} XP {type === 'week' ? 'esta semana' : 'nesta temporada'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ===== ADMIN ===== */
const SUPER_ADMIN_EMAIL = 'robsonbraz67@gmail.com';

const avt = (avatar: string) => avatar?.startsWith('data:') ? '📸' : (avatar || '👤');

const gerarNarrativa = (ranking: any[], semana: string): string => {
  const r = ranking.filter(u => !u.isAdmin && !u.isProfessor);
  if (r.length === 0) return 'Nenhum participante registrado nesta semana ainda.';
  const top = r.slice(0, Math.min(5, r.length));
  const lider = top[0];
  const segundo = top[1];
  let t = `🏆 CORRIDA DA SEMANA — ${semana}\n\n`;
  if (lider) {
    t += `${avt(lider.avatar)} ${lider.nome} chegou à frente com ${lider.xp} XP`;
    if (lider.streak >= 5) t += ` e uma sequência incrível de ${lider.streak} dias seguidos`;
    t += `!\n\n`;
  }
  if (segundo) {
    const diff = lider.xp - segundo.xp;
    if (diff < 100) t += `Foi de tirar o fôlego: ${avt(segundo.avatar)} ${segundo.nome} ficou a apenas ${diff} XP do topo!\n\n`;
    else t += `Logo atrás, ${avt(segundo.avatar)} ${segundo.nome} com ${segundo.xp} XP deu trabalho!\n\n`;
  }
  if (top.length >= 3) {
    t += `Completando o pódio:\n`;
    top.slice(2).forEach((u, i) => { t += `${i + 3}º ${avt(u.avatar)} ${u.nome} — ${u.xp} XP\n`; });
    t += '\n';
  }
  const mvpStreak = [...r].sort((a, b) => b.streak - a.streak)[0];
  if (mvpStreak?.streak >= 5) t += `🔥 Dedicação da semana: ${avt(mvpStreak.avatar)} ${mvpStreak.nome} com ${mvpStreak.streak} dias seguidos!\n\n`;
  const perfeitos = r.filter(u => u.dias === 7);
  if (perfeitos.length > 0) t += `⭐ Completaram os 7 dias: ${perfeitos.map(u => u.nome).join(', ')}!\n\n`;
  t += `Total: ${r.length} participante${r.length !== 1 ? 's' : ''} nesta semana 💪\n`;
  t += `#SabatinaQuest #EscolaSabatinaTeen`;
  return t;
};

const gerarPromptVideo = (ranking: any[], semana: string): string => {
  const r = ranking.filter(u => !u.isAdmin && !u.isProfessor).slice(0, 5);
  if (r.length === 0) return 'Nenhum participante para gerar o prompt.';
  const temFotos = r.some(u => u.avatar?.startsWith('data:'));
  let p = `Crie um vídeo curto de 30 segundos estilo premiação esportiva para uma turma de jovens cristãos.\n\n`;
  p += `ESTILO VISUAL: Placar animado com estrelas e confetes, cores azul escuro e dourado, tipografia bold.\n`;
  p += `MÚSICA: Trilha épica e motivacional, acelerando na revelação do 1º lugar.\n`;
  p += `FORMATO: Vertical 9:16 (Stories/Reels).\n\n`;
  if (temFotos) {
    p += `FOTOS: Cada participante com foto tem a imagem disponível para download no relatório do app.\n`;
    p += `Use a foto real de cada participante em um quadro circular com bordas douradas.\n\n`;
  }
  p += `SEQUÊNCIA (revelar do último ao 1º com suspense):\n`;
  [...r].reverse().forEach((u, i) => {
    const pos = r.length - i;
    const fotoInfo = u.avatar?.startsWith('data:') ? '📸 foto disponível' : `emoji ${u.avatar}`;
    p += `— ${pos}º lugar: "${u.nome}"  |  ${fotoInfo}  |  ${u.xp} XP  |  ${u.dias} dia${u.dias !== 1 ? 's' : ''} concluído${u.dias !== 1 ? 's' : ''}\n`;
  });
  p += `\nTEXTO DE ABERTURA: "Semana ${semana} — Quem foi o campeão? 🏆"\n`;
  p += `TEXTO DE FECHAMENTO: "Parabéns a todos! Nos vemos na próxima semana! 💪✨"\n`;
  p += `CALL TO ACTION: "Baixe o SabatinaQuest e entre para o ranking!"`;
  return p;
};

// Hook compartilhado do Sorteador — usado pela tela Sorteador (menu) e, antes,
// duplicado dentro do Admin/TVMode. Fila sem repetição: sorteia todos os
// elegíveis antes de repetir alguém.
const useSorteador = (licao: any) => {
  const [users, setUsers] = useState<any[]>([]);
  const [ganhador, setGanhador] = useState<any | null>(null);
  const [idx, setIdx] = useState(0);
  const [animando, setAnimando] = useState(false);
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const carregar = async () => {
    setLoading(true); setGanhador(null); setQueue([]);
    try {
      const rank = await getWeeklyRanking(licao.semana);
      setUsers(rank.filter((u: any) => !u.isAdmin && !u.isProfessor && u.dias === 7));
    } catch { /* silent */ }
    setLoading(false);
  };

  const playTick = (fast: boolean) => {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.value = fast ? 880 : 550;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.04);
    } catch {}
  };

  const playWin = () => {
    try {
      const ctx = getAudioCtx();
      [523, 659, 784, 1047, 1319].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.11;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.2, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.start(t); osc.stop(t + 0.5);
      });
    } catch {}
  };

  const iniciar = () => {
    if (users.length === 0) return;
    let fila = queue.length > 0 ? queue : [...Array(users.length).keys()].sort(() => Math.random() - 0.5);
    const winner = fila[0];
    setQueue(fila.slice(1));
    setGanhador(null); setAnimando(true);
    let step = 0;
    let cur = Math.floor(Math.random() * users.length); // posição inicial aleatória
    const TOTAL = 30;
    const tick = () => {
      cur = (cur + 1) % users.length;
      setIdx(cur); step++;
      const fast = step < TOTAL * .5;
      const delay = fast ? 55 : step < TOTAL * .8 ? 110 : 200;
      playTick(fast);
      if (step >= TOTAL) {
        setIdx(winner); setGanhador(users[winner]); setAnimando(false);
        setTimeout(playWin, 150);
        return;
      }
      timer.current = setTimeout(tick, delay);
    };
    timer.current = setTimeout(tick, 55);
  };

  return { users, ganhador, idx, animando, loading, carregar, iniciar };
};

/* ===== SORTEADOR (tela própria, acessível pelo menu) ===== */
export const Sorteador = ({ licao, jogador, onBack }: any) => {
  const { users, ganhador, idx, animando, loading, carregar, iniciar } = useSorteador(licao);
  return (
    <div className="scr" style={{paddingBottom:100}}>
      <div className="hdr">
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{width:'auto'}}>← Voltar</button>
        <div style={{fontWeight:900,fontSize:17}}>🎰 Sorteador</div>
        <div/>
      </div>
      <div className="sorteador-wrap">
        <div style={{fontSize:13, color:'var(--mut)', marginBottom:12, textAlign:'center'}}>
          Sorteia entre os que completaram os <strong style={{color:'var(--txt2)'}}>7 dias</strong> da semana <strong style={{color:'var(--gold)'}}>{licao.semana}</strong>.
        </div>
        <div style={{textAlign:'center'}}>
          <button onClick={carregar} disabled={loading} className={`btn btn-ghost ${loading ? 'btn-dis' : ''}`} style={{fontSize:13, padding:'8px 16px', marginBottom:16, width:'auto', display:'inline-flex'}}>
            {loading ? 'Carregando...' : '🔄 Carregar Participantes'}
          </button>
        </div>

        {users.length === 0 && !loading && (
          <div style={{fontSize:13, color:'var(--mut)', textAlign:'center'}}>Clique acima para ver os participantes elegíveis.</div>
        )}

        {users.length > 0 && (
          <>
            <div style={{fontSize:13, color:'var(--mut)', marginBottom:10, textAlign:'center'}}>
              {users.length} participante{users.length !== 1 ? 's' : ''} elegível{users.length !== 1 ? 'is' : ''}:
            </div>
            <div className="sorteador-chips">
              {users.map(u => (
                <div key={u.id} style={{display:'flex', alignItems:'center', gap:5, background:'rgba(255,255,255,.06)', borderRadius:8, padding:'5px 10px'}}>
                  {u.avatar?.startsWith('data:')
                    ? <img src={u.avatar} style={{width:22, height:22, borderRadius:'50%', objectFit:'cover'}} alt="" />
                    : <span style={{fontSize:18}}>{u.avatar || '👤'}</span>}
                  <span style={{fontSize:13, color:'var(--txt2)', fontWeight:700}}>{u.nome.split(' ')[0]}</span>
                </div>
              ))}
            </div>

            {(animando || ganhador) && (
              <div className="sorteador-slot">
                {animando && (
                  <div style={{animation:'pulse .3s infinite'}}>
                    {users[idx]?.avatar?.startsWith('data:')
                      ? <img src={users[idx].avatar} className="sorteador-avatar" alt="" />
                      : <div className="sorteador-emoji">{users[idx]?.avatar || '👤'}</div>}
                    <div className="sorteador-nome">{users[idx]?.nome}</div>
                  </div>
                )}
                {ganhador && !animando && (
                  <div className="sorteador-vencedor">
                    <div style={{fontSize:13, fontWeight:800, color:'var(--gold)', letterSpacing:1, textTransform:'uppercase', marginBottom:10}}>🏆 Vencedor!</div>
                    {ganhador.avatar?.startsWith('data:')
                      ? <img src={ganhador.avatar} className="sorteador-avatar-win" alt="" />
                      : <div className="sorteador-emoji-win">{ganhador.avatar || '👤'}</div>}
                    <div className="sorteador-nome-win">{ganhador.nome}</div>
                    <div style={{fontSize:15, color:'var(--gold)', fontWeight:700}}>{ganhador.xp} XP · {ganhador.dias} dias</div>
                  </div>
                )}
              </div>
            )}

            <div style={{textAlign:'center'}}>
              <button onClick={iniciar} disabled={animando} className={`btn btn-gold ${animando ? 'btn-dis' : ''}`} style={{fontSize:16, padding:'12px 28px', width:'auto', display:'inline-flex'}}>
                {animando ? '🎰 Sorteando...' : ganhador ? '🔁 Sortear Novamente' : '🎰 Sortear!'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export const Admin = ({ licao, jogador, onBack }: any) => {
  const isSuperAdmin = jogador?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Notification States
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [notifTitle, setNotifTitle] = useState('Você tem uma nova mensagem! 📬');
  const [notifBody, setNotifBody] = useState('Continue seu estudo diário e ganhe mais XP!');
  const [sendingNotif, setSendingNotif] = useState(false);

  // Relatório da semana
  const [relatorio, setRelatorio] = useState<{ narrativa: string; promptVideo: string; ranking: any[] } | null>(null);
  const [loadingRelatorio, setLoadingRelatorio] = useState(false);

  // Locais de estudo + atribuição de professor por local
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<Record<string, { locationId: string }>>({});

  useEffect(() => {
    let unmounted = false;
    const loadUsers = async () => {
      try {
        const usrs = await getAllUsers();
        if (!unmounted) {
           setUsers(usrs);
           setLoadingUsers(false);
        }
      } catch (e) {
        if (!unmounted) setLoadingUsers(false);
      }
    };
    loadUsers();
    getStudyLocations().then(l => { if (!unmounted) setLocations(l); }).catch(() => {});
    getAllTeacherAssignments().then(a => { if (!unmounted) setTeacherAssignments(a); }).catch(() => {});
    return () => { unmounted = true; };
  }, []);

  const handleSetUserLocation = async (userId: string, locationId: string) => {
    try {
      await adminSetUserLocation(userId, locationId);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, locationId } : u));
    } catch (e) {
      alert('Erro ao alterar local do usuário');
    }
  };

  const handleAssignTeacher = async (teacherId: string, locationId: string) => {
    if (!locationId) return;
    try {
      await assignTeacherLocation(teacherId, locationId, jogador.id);
      setTeacherAssignments(prev => ({ ...prev, [teacherId]: { locationId } }));
    } catch (e) {
      alert('Erro ao atribuir local ao professor');
    }
  };

  const handleRemoveTeacherAssignment = async (teacherId: string) => {
    try {
      await removeTeacherAssignment(teacherId);
      setTeacherAssignments(prev => { const n = { ...prev }; delete n[teacherId]; return n; });
    } catch (e) {
      alert('Erro ao remover atribuição do professor');
    }
  };

  const handleToggleAdmin = async (userId: string, currentStatus: boolean) => {
     try {
        await toggleAdmin(userId, !currentStatus);
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, isAdmin: !currentStatus } : u));
     } catch(e) {
        alert('Erro ao atualizar usuário');
     }
  };

  const handleToggleProfessor = async (userId: string, currentStatus: boolean) => {
     try {
        await toggleProfessor(userId, !currentStatus);
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, isProfessor: !currentStatus } : u));
     } catch(e) {
        alert('Erro ao atualizar usuário');
     }
  };

  // Ofensiva real de todos (Firestore, independente de aparelho)
  const [streaks, setStreaks] = useState<Record<string, { streak: number }>>({});
  useEffect(() => {
    if (!licao?.trimestre) return;
    getAllUsersStreaks(licao.trimestre).then(setStreaks).catch(() => {});
  }, [licao?.trimestre]);

  const handleToggleGuest = async (userId: string, currentStatus: boolean) => {
     try {
        await toggleGuest(userId, !currentStatus);
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, isGuest: !currentStatus } : u));
     } catch(e) {
        alert('Erro ao atualizar usuário');
     }
  };

  const handleBlockUser = async (userId: string, currentBlocked: boolean) => {
     try {
        await blockUser(userId, !currentBlocked);
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, bloqueado: !currentBlocked } : u));
     } catch(e) {
        alert('Erro ao bloquear/desbloquear usuário');
     }
  };

  const handleDeleteUser = async (userId: string, nome: string) => {
     if (!window.confirm(`Excluir "${nome}"? Esta ação não pode ser desfeita.`)) return;
     try {
        await deleteUser(userId);
        setUsers(prev => prev.filter(u => u.id !== userId));
     } catch(e) {
        alert('Erro ao excluir usuário');
     }
  };

  const handleGerarRelatorio = async () => {
    setLoadingRelatorio(true);
    try {
      const rank = await getWeeklyRanking(licao.semana);
      setRelatorio({
        narrativa: gerarNarrativa(rank, licao.semana),
        promptVideo: gerarPromptVideo(rank, licao.semana),
        ranking: rank.filter((u: any) => !u.isAdmin && !u.isProfessor).slice(0, 5),
      });
    } catch(e) {
      alert('Erro ao carregar ranking para o relatório.');
    }
    setLoadingRelatorio(false);
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
    <div className="scr" style={{paddingBottom:100}}>
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
                        <div style={{fontSize:20, width:28, height:28, borderRadius:'50%', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                           {u.avatar?.length > 10 ? <img src={u.avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="avatar"/> : <span>{u.avatar}</span>}
                        </div>
                        <div>
                           <div style={{fontSize:14, fontWeight:800, color:'var(--txt2)'}}>
                             {u.nome} {u.isAdmin && <span style={{color:'var(--gold)', fontSize:12}}>🛡️ Adm</span>} {u.isProfessor && <span style={{color:'var(--admin)', fontSize:12}}>🎓 Professor</span>} {u.isGuest && <span style={{color:'#888', fontSize:12}}>👁️ Convidado</span>}
                             {streaks[u.id]?.streak > 0 && <span style={{color:'#FF9600', fontSize:12, marginLeft:4}}>🔥 {streaks[u.id].streak}</span>}
                           </div>
                           <div style={{fontSize:11, color:'var(--mut)'}}>{u.email}</div>
                        </div>
                     </div>
                     {isSuperAdmin && u.email?.toLowerCase() !== SUPER_ADMIN_EMAIL && (
                       <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap: 6}}>
                       <div style={{display:'flex', alignItems:'center', gap:6}}>
                         <select
                           value={u.locationId || ''}
                           onChange={e => handleSetUserLocation(u.id, e.target.value)}
                           style={{fontSize:11, padding:'4px 6px', borderRadius:6, background:'var(--input-bg)', color:'var(--txt2)', border:'1px solid var(--input-border)', maxWidth:130}}
                         >
                           <option value="">Sem local</option>
                           {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                         </select>
                         {u.isProfessor && (
                           <select
                             value={teacherAssignments[u.id]?.locationId || ''}
                             onChange={e => e.target.value ? handleAssignTeacher(u.id, e.target.value) : handleRemoveTeacherAssignment(u.id)}
                             title="Local onde este professor pode gerar convite"
                             style={{fontSize:11, padding:'4px 6px', borderRadius:6, background:'rgba(124,79,224,.15)', color:'var(--admin)', border:'1px solid var(--input-border)', maxWidth:130}}
                           >
                             <option value="">🎓 sem atribuição</option>
                             {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                           </select>
                         )}
                       </div>
                       <div style={{display:'flex', flexWrap:'wrap', gap: 6, justifyContent:'flex-end'}}>
                         {u.isAdmin ? (
                           <button onClick={() => handleToggleAdmin(u.id, true)} style={{background:'rgba(227,28,61,.2)', color:'#FF6B6B', border:'none', borderRadius:6, padding:'6px 10px', fontSize:11, fontWeight:800, cursor:'pointer'}}>
                              Remover Adm
                           </button>
                         ) : (
                           <button onClick={() => handleToggleProfessor(u.id, !!u.isProfessor)} style={{background: u.isProfessor ? 'rgba(227,28,61,.2)' : 'rgba(124,79,224,.2)', color: u.isProfessor ? '#FF6B6B' : 'var(--admin)', border:'none', borderRadius:6, padding:'6px 10px', fontSize:11, fontWeight:800, cursor:'pointer'}}>
                              {u.isProfessor ? 'Remover Professor' : '🎓 Tornar Professor'}
                           </button>
                         )}
                         <button onClick={() => handleToggleGuest(u.id, !!u.isGuest)} style={{background: u.isGuest ? 'rgba(79,184,92,.2)' : 'rgba(136,136,136,.2)', color: u.isGuest ? '#4FB85C' : '#888', border:'none', borderRadius:6, padding:'6px 10px', fontSize:11, fontWeight:800, cursor:'pointer'}}>
                            {u.isGuest ? '✅ Remover Convidado' : '👁️ Convidado'}
                         </button>
                         <button onClick={() => handleBlockUser(u.id, !!u.bloqueado)} style={{background: u.bloqueado ? 'rgba(79,184,92,.2)' : 'rgba(247,198,0,.15)', color: u.bloqueado ? '#4FB85C' : '#F7C600', border:'none', borderRadius:6, padding:'6px 10px', fontSize:11, fontWeight:800, cursor:'pointer'}}>
                            {u.bloqueado ? '✅ Desbloquear' : '🚫 Bloquear'}
                         </button>
                         <button onClick={() => handleDeleteUser(u.id, u.nome)} style={{background:'rgba(227,28,61,.15)', color:'#FF6B6B', border:'none', borderRadius:6, padding:'6px 10px', fontSize:11, fontWeight:800, cursor:'pointer'}}>
                            🗑️ Excluir
                         </button>
                       </div>
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
                     <div style={{fontSize:16, width:22, height:22, borderRadius:'50%', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                        {u.avatar?.length > 10 ? <img src={u.avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="avatar"/> : <span>{u.avatar}</span>}
                     </div>
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

        <div className="sec-title" style={{marginBottom:8}}>Corrida da Semana 📊</div>
        <div style={{background:'var(--panel-bg)', padding:12, borderRadius:12, marginBottom:24}}>
          <div style={{fontSize:13, color:'var(--mut)', marginBottom:12}}>
            Gera uma narrativa e um prompt de vídeo com base no ranking atual de <strong style={{color:'var(--txt2)'}}>{licao.semana}</strong>.
          </div>
          <button onClick={handleGerarRelatorio} disabled={loadingRelatorio} className={`btn btn-gold ${loadingRelatorio ? 'btn-dis' : ''}`} style={{fontSize:14, padding:'10px', marginBottom: relatorio ? 16 : 0}}>
            {loadingRelatorio ? 'Gerando...' : '🎬 Gerar Relatório + Prompt de Vídeo'}
          </button>

          {relatorio && (
            <>
              {/* Visual ranking with photos */}
              <div style={{fontSize:12, fontWeight:800, color:'var(--txt2)', marginBottom:8, textTransform:'uppercase', letterSpacing:1}}>
                Pódio — Fotos para o vídeo
              </div>
              <div style={{display:'flex', flexWrap:'wrap', gap:10, marginBottom:20}}>
                {relatorio.ranking.map((u: any, i: number) => (
                  <div key={u.id} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:4, background:'rgba(0,0,0,.25)', borderRadius:10, padding:'10px 8px', minWidth:72}}>
                    <div style={{fontSize:11, fontWeight:900, color: i === 0 ? 'var(--gold)' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--mut)'}}>
                      {i + 1}º
                    </div>
                    <div style={{width:52, height:52, borderRadius:'50%', overflow:'hidden', border: i === 0 ? '2px solid var(--gold)' : '2px solid rgba(255,255,255,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, background:'rgba(0,0,0,.3)'}}>
                      {u.avatar?.startsWith('data:')
                        ? <img src={u.avatar} style={{width:'100%', height:'100%', objectFit:'cover'}} alt={u.nome} />
                        : <span>{u.avatar}</span>}
                    </div>
                    <div style={{fontSize:11, fontWeight:700, color:'var(--txt2)', textAlign:'center', maxWidth:68, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{u.nome.split(' ')[0]}</div>
                    <div style={{fontSize:10, color:'var(--gold)', fontWeight:800}}>{u.xp} XP</div>
                    {u.avatar?.startsWith('data:') && (
                      <a
                        href={u.avatar}
                        download={`${u.nome.replace(/\s+/g,'_')}.jpg`}
                        style={{fontSize:10, color:'var(--teal)', textDecoration:'none', fontWeight:700, marginTop:2}}
                      >
                        ⬇️ salvar
                      </a>
                    )}
                  </div>
                ))}
              </div>

              <div style={{fontSize:12, fontWeight:800, color:'var(--gold)', marginBottom:6, textTransform:'uppercase', letterSpacing:1}}>
                Narrativa da Semana
              </div>
              <div style={{position:'relative', marginBottom:16}}>
                <textarea
                  readOnly
                  value={relatorio.narrativa}
                  style={{width:'100%', minHeight:160, padding:'10px', borderRadius:8, background:'rgba(0,0,0,.3)', border:'1px solid rgba(255,255,255,.08)', color:'var(--txt2)', fontSize:13, fontFamily:'monospace', resize:'vertical'}}
                />
                <button
                  onClick={() => navigator.clipboard.writeText(relatorio.narrativa).then(() => alert('Copiado!'))}
                  style={{position:'absolute', top:6, right:6, background:'rgba(247,198,0,.2)', color:'var(--gold)', border:'none', borderRadius:6, padding:'4px 8px', fontSize:11, fontWeight:800, cursor:'pointer'}}
                >
                  Copiar
                </button>
              </div>

              <div style={{fontSize:12, fontWeight:800, color:'var(--teal)', marginBottom:6, textTransform:'uppercase', letterSpacing:1}}>
                Prompt para IA de Vídeo (Runway / CapCut / Pika)
              </div>
              <div style={{position:'relative'}}>
                <textarea
                  readOnly
                  value={relatorio.promptVideo}
                  style={{width:'100%', minHeight:200, padding:'10px', borderRadius:8, background:'rgba(0,0,0,.3)', border:'1px solid rgba(255,255,255,.08)', color:'var(--txt2)', fontSize:13, fontFamily:'monospace', resize:'vertical'}}
                />
                <button
                  onClick={() => navigator.clipboard.writeText(relatorio.promptVideo).then(() => alert('Copiado!'))}
                  style={{position:'absolute', top:6, right:6, background:'rgba(30,158,134,.25)', color:'var(--teal)', border:'none', borderRadius:6, padding:'4px 8px', fontSize:11, fontWeight:800, cursor:'pointer'}}
                >
                  Copiar
                </button>
              </div>
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

  // Local de estudo + trilha: obrigatórios no cadastro, só admin altera depois.
  // Só admin/professor cadastra local novo (regra do Firestore); aluno só escolhe.
  const canManageLocations = !!jogador.isAdmin || !!jogador.isProfessor;
  const locationLocked = !!jogador.locationId;
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(!locationLocked);
  useEffect(() => {
    getStudyLocations().then(setLocations).catch(() => {}).finally(() => setLoadingLocations(false));
  }, []);
  const [locationId, setLocationId] = useState(jogador.locationId || '');
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [track, setTrack] = useState<Track>(jogador.track || 'teen');
  const [savingSetup, setSavingSetup] = useState(false);
  const currentLocationName = locations.find(l => l.id === jogador.locationId)?.name;

  // Phone number helpers — store as E164 (5511999999999), display as (11) 99999-9999
  const e164ToDisplay = (v: string) => {
    const d = (v || '').replace(/\D/g, '').replace(/^55/, '');
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
  };
  const [telefone, setTelefone] = useState(e164ToDisplay(jogador.telefone || ''));
  const [whatsappOptIn, setWhatsappOptIn] = useState(!!jogador.whatsappOptIn);

  const formatPhone = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  };
  const phoneDigits = telefone.replace(/\D/g, '');
  const telefoneE164 = phoneDigits.length >= 10 ? '55' + phoneDigits : '';
  const businessNumber = (import.meta.env.VITE_WHATSAPP_BUSINESS_NUMBER as string) || '';

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const img = new Image();
    const r = new FileReader();
    r.onload = ev => {
      img.onload = () => {
        const cvs = document.createElement('canvas');
        const MAX = 192;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) return;
        if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
        else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
        cvs.width = w; cvs.height = h;
        const ctx = cvs.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = cvs.toDataURL('image/jpeg', 0.82);
        if (dataUrl && dataUrl.length > 100) setAvatar(dataUrl);
      };
      img.onerror = () => alert('Não foi possível ler a imagem. Tente outro arquivo.');
      img.src = ev.target?.result as string;
    };
    r.onerror = () => alert('Erro ao carregar a foto. Tente novamente.');
    r.readAsDataURL(f);
  };

  return (
    <div className="scr" style={{paddingBottom:100}}>
      <div className="hdr">
        {locationLocked ? <button className="btn btn-ghost btn-sm" onClick={onBack} style={{width:'auto'}}>← Voltar</button> : <div/>}
        <div style={{fontWeight:900,fontSize:17}}>⚙️ Configurações</div>
        <div/>
      </div>
      {!locationLocked && (
        <div style={{margin:'0 16px 8px', padding:'10px 14px', borderRadius:10, background:'rgba(247,198,0,.1)', border:'1px solid rgba(247,198,0,.3)', fontSize:12, color:'var(--gold)', fontWeight:700}}>
          Complete seu cadastro escolhendo trilha e local de estudo para continuar.
        </div>
      )}
      <div style={{padding:'20px 16px', display:'flex', flexDirection:'column', gap:20, flex: 1}}>

        <div style={{background:'var(--panel-bg)', padding: '20px 16px', borderRadius: 16, border:'1px solid var(--panel-border)'}}>
          <div style={{fontWeight:800, marginBottom:16, color:'var(--txt2)'}}>🏠 Local de Estudo e Trilha</div>
          {locationLocked ? (
            <div style={{fontSize:14, color:'var(--txt2)', lineHeight:1.6}}>
              Local: <strong>{currentLocationName || '...'}</strong><br/>
              Trilha: <strong>{TRACK_LABELS[(jogador.track as Track) || 'teen']}</strong>
              <div style={{fontSize:11, color:'var(--mut)', marginTop:8}}>Só um admin pode alterar seu local ou trilha depois do cadastro.</div>
            </div>
          ) : (
            <>
              <div style={{fontSize:12, fontWeight:700, color:'var(--mut)', marginBottom:8, textTransform:'uppercase', letterSpacing:1}}>Trilha *</div>
              <div style={{display:'flex', gap:8, marginBottom:16, flexWrap:'wrap'}}>
                {(['teen', 'youngAdult', 'adult'] as Track[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    disabled={t !== 'teen'}
                    onClick={() => setTrack(t)}
                    style={{
                      flex: '1 1 30%', padding: '10px 6px', borderRadius: 10, fontSize: 12, fontWeight: 800,
                      border: track === t ? '2px solid var(--gold)' : '1px solid var(--input-border)',
                      background: track === t ? 'rgba(247,198,0,.12)' : 'var(--input-bg)',
                      color: t !== 'teen' ? 'var(--mut)' : 'var(--txt)',
                      opacity: t !== 'teen' ? 0.6 : 1,
                      cursor: t !== 'teen' ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {TRACK_LABELS[t]}{t !== 'teen' ? <div style={{fontSize:10, marginTop:2}}>🔒 Em breve</div> : null}
                  </button>
                ))}
              </div>

              <div style={{fontSize:12, fontWeight:700, color:'var(--mut)', marginBottom:8, textTransform:'uppercase', letterSpacing:1}}>Local de Estudo *</div>
              {!showNewLocation ? (
                <>
                  <select
                    value={locationId}
                    onChange={e => setLocationId(e.target.value)}
                    disabled={loadingLocations}
                    style={{width:'100%', padding:'12px', borderRadius:10, background:'var(--input-bg)', color:'var(--txt)', border:'1px solid var(--input-border)', fontSize:14, marginBottom:8, outline:'none'}}
                  >
                    <option value="">{loadingLocations ? 'Carregando...' : 'Selecione seu local...'}</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  {canManageLocations ? (
                    <button type="button" onClick={() => setShowNewLocation(true)} className="btn btn-ghost btn-sm" style={{width:'100%', fontSize:12}}>+ Cadastrar novo local</button>
                  ) : (!loadingLocations && locations.length === 0) ? (
                    <div style={{fontSize:11, color:'var(--mut)', textAlign:'center', padding:'4px 0'}}>Nenhum local cadastrado ainda. Peça ao seu professor ou administrador para cadastrar o seu.</div>
                  ) : (
                    <div style={{fontSize:11, color:'var(--mut)', textAlign:'center', padding:'4px 0'}}>Não achou seu local? Peça ao seu professor ou administrador para cadastrá-lo.</div>
                  )}
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={newLocationName}
                    onChange={e => setNewLocationName(e.target.value)}
                    placeholder="Ex: Igreja Central"
                    maxLength={80}
                    style={{width:'100%', padding:'12px', borderRadius:10, background:'var(--input-bg)', color:'var(--txt)', border:'1px solid var(--input-border)', fontSize:14, marginBottom:8, outline:'none'}}
                  />
                  <button type="button" onClick={() => { setShowNewLocation(false); setNewLocationName(''); }} className="btn btn-ghost btn-sm" style={{width:'100%', fontSize:12}}>← Escolher da lista</button>
                </>
              )}
            </>
          )}
        </div>

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

          <div style={{marginTop: 20}}>
            <div style={{fontSize: 12, fontWeight: 700, color:'var(--mut)', marginBottom: 8, textTransform:'uppercase', letterSpacing:1}}>WhatsApp para Lembretes</div>
            <input
              type="tel"
              value={telefone}
              onChange={e => setTelefone(formatPhone(e.target.value))}
              placeholder="(61) 99999-9999"
              style={{width:'100%', padding:'14px 16px', borderRadius: 12, background:'var(--input-bg)', color:'var(--txt)', border:'1px solid var(--input-border)', fontSize: 16, outline:'none', transition:'background .3s,color .3s'}}
              maxLength={15}
            />
            {phoneDigits.length >= 10 && (
              whatsappOptIn ? (
                <div style={{marginTop:8, padding:'10px 14px', borderRadius:10, background:'rgba(79,184,92,.12)', border:'1px solid rgba(79,184,92,.3)', display:'flex', alignItems:'center', gap:8}}>
                  <span>✅</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12, fontWeight:700, color:'#4FB85C'}}>WhatsApp ativo</div>
                    <div style={{fontSize:11, color:'var(--mut)'}}>Você receberá lembretes diários de estudo às 8h.</div>
                  </div>
                  <button onMouseDown={e => { e.preventDefault(); setWhatsappOptIn(false); }} style={{background:'none', border:'none', color:'var(--mut)', fontSize:11, cursor:'pointer', padding:'4px 6px'}}>Desativar</button>
                </div>
              ) : businessNumber ? (
                <a
                  href={`https://wa.me/${businessNumber}?text=ESTUDO+ON`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setWhatsappOptIn(true)}
                  style={{display:'block', marginTop:8, padding:'12px', borderRadius:10, background:'rgba(79,184,92,.12)', border:'1px solid rgba(79,184,92,.25)', textAlign:'center', textDecoration:'none', color:'#4FB85C', fontSize:13, fontWeight:700}}
                >
                  📱 Ativar lembretes WhatsApp
                  <div style={{fontSize:11, color:'var(--mut)', fontWeight:400, marginTop:3}}>Toque para confirmar no WhatsApp</div>
                </a>
              ) : (
                <div style={{marginTop:8, padding:'10px 14px', borderRadius:10, background:'rgba(247,198,0,.08)', border:'1px solid rgba(247,198,0,.2)', fontSize:11, color:'var(--mut)'}}>
                  ⚙️ Configure <code>VITE_WHATSAPP_BUSINESS_NUMBER</code> no Netlify para ativar lembretes automáticos.
                </div>
              )
            )}
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

        <button
          className={`btn btn-gold${savingSetup ? ' btn-dis' : ''}`}
          disabled={savingSetup}
          onClick={async () => {
            let finalLocationId = jogador.locationId || '';
            if (!locationLocked) {
              if (showNewLocation) {
                if (!newLocationName.trim()) { alert('Digite o nome do seu local de estudo.'); return; }
                setSavingSetup(true);
                try {
                  finalLocationId = await createStudyLocation(newLocationName.trim(), jogador.id);
                } catch (e) {
                  alert('Erro ao criar local de estudo. Tente novamente.');
                  setSavingSetup(false);
                  return;
                }
              } else {
                if (!locationId) { alert('Selecione seu local de estudo.'); return; }
                finalLocationId = locationId;
              }
            }
            onSave({ ...jogador, nome, avatar, telefone: telefoneE164, whatsappOptIn, track: jogador.track || track, locationId: finalLocationId });
          }}
          style={{fontSize: 18, marginTop: 10}}
        >
          {savingSetup ? 'Salvando...' : '✅ SALVAR ALTERAÇÕES'}
        </button>
        
        <div style={{marginTop: 'auto', paddingTop: 40}}>
           <button className="btn btn-ghost" onClick={onLogout} style={{color:'#FF6B6B', borderColor:'rgba(227,28,61,.3)', width:'100%'}}>🚪 Sair da conta (Logout)</button>
        </div>
      </div>
    </div>
  );
};

