import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DEMO } from './data';
import { gs, ss, uid, AVTS, xpSpeed, getDiaId, getMsgRes, rankDemo, calcPos, PROG0, shareApp } from './utils';

/* ===== CONFETTI ===== */
export const Confetti = ({ show }: { show: boolean }) => {
  if (!show) return null;
  const cores = ['#F5C842','#E31C3D','#1368CE','#2ECC71','#B9ACE6','#FF6B6B','#FCE08A'];
  const ps = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: cores[i % cores.length],
    dur: 2 + Math.random() * 2,
    delay: Math.random() * .8,
    size: 7 + Math.random() * 9,
    br: Math.random() > .5 ? '50%' : '3px'
  }));
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
  const stars = Array.from({ length: 35 }, (_, i) => ({
    id: i,
    top: Math.random() * 100,
    left: Math.random() * 100,
    sz: Math.random() * 3 + 1,
    op: Math.random() * .6 + .2
  }));
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100dvh',background:'linear-gradient(160deg,#1E1248 0%,#2E2160 50%,#3A2A6B 100%)',position:'relative'}}>
      <div style={{position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none'}}>
        {stars.map(s => <div key={s.id} className="star-dot" style={{top:s.top+'%',left:s.left+'%',width:s.sz,height:s.sz,opacity:s.op}}/>)}
      </div>
      <div style={{textAlign:'center',animation:'popIn .7s ease .3s both',position:'relative',zIndex:1}}>
        <div style={{fontSize:88,marginBottom:16,display:'block',animation:'pulse 1.8s infinite'}}>📖</div>
        <div style={{fontSize:40,fontWeight:900,marginBottom:6}}>
          <span style={{color:'#F5C842'}}>Sabatina</span><span style={{color:'#B9ACE6'}}>Quest</span>
        </div>
        <div style={{color:'#B9ACE6',fontSize:12,letterSpacing:3,textTransform:'uppercase',marginBottom:40}}>Escola Sabatina Teen</div>
        <div style={{display:'flex',alignItems:'center',gap:8,justifyContent:'center',color:'rgba(185,172,230,.6)',fontSize:14}}>
          <div style={{width:16,height:16,border:'3px solid rgba(245,200,66,.4)',borderTopColor:'#F5C842',borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
          Carregando...
        </div>
      </div>
    </div>
  );
};

/* ===== LOGIN ===== */
import { signInWithGoogle, getUser } from './firebase';

export const Login = ({ onLogin }: { onLogin: (j: any) => void }) => {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const goGoogle = async () => {
    setLoading(true);
    setErr('');
    try {
      const user = await signInWithGoogle();
      let j: any;
      const dbUser = await getUser(user.uid);
      if (dbUser) {
        j = { ...dbUser };
      } else {
        j = {
          id: user.uid,
          nome: user.displayName || 'Visitante',
          turma: 'Visitante',
          avatar: '🦁',
          email: user.email,
          criadoEm: new Date().toISOString()
        };
      }
      ss('jogador', j);
      let r = gs('ranking') || rankDemo();
      if (!r.find((x: any) => x.id === j.id)) {
        r.push({ id: j.id, nome: j.nome, avatar: j.avatar, xp: 0, dias: 0 });
        ss('ranking', r);
      }
      onLogin(j);
    } catch (e: any) {
      console.error(e);
      setErr(e.message || 'Erro ao realizar login');
      setLoading(false);
    }
  };

  return (
    <div style={{padding:'0 20px 100px',animation:'fadeIn .4s ease',minHeight:'100dvh',display:'flex',flexDirection:'column',justifyContent:'center'}}>
      <div style={{textAlign:'center',padding:'32px 0 20px',borderBottom:'1px solid rgba(245,200,66,.15)',marginBottom:24}}>
        <div style={{fontSize:52,marginBottom:10,animation:'bounce 3s ease-in-out infinite'}}>📖</div>
        <div style={{fontSize:30,fontWeight:900,marginBottom:4}}>
          <span style={{color:'#F5C842'}}>Sabatina</span><span style={{color:'#B9ACE6'}}>Quest</span>
        </div>
        <div style={{display:'inline-block',background:'rgba(245,200,66,.15)',border:'1.5px solid rgba(245,200,66,.35)',borderRadius:20,padding:'4px 14px',fontSize:13,fontWeight:800,color:'#F5C842',letterSpacing:.5,marginTop:6}}>
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
export const Home = ({ jogador, licao, prog, onEstudo, onRanking, onLogout }: any) => {
  const diaId = getDiaId(licao.dias);
  const diaAtual = licao.dias.find((d: any) => d.id === diaId);
  
  const getSt = (dia: any) => {
    if (prog.done.includes(dia.id)) return 'done';
    if (dia.id === diaId) return 'today';
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
          <button className="btn btn-ghost btn-sm" onClick={shareApp} style={{width:'auto',padding:'8px',fontSize:14}}>🔗</button>
          <button className="btn btn-ghost btn-sm" onClick={onLogout} style={{width:'auto',gap:4,fontSize:12}}>⚙️ Sair</button>
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
              <div style={{fontSize:40,background:'rgba(255,255,255,.1)',borderRadius:14,padding:'6px 10px',border:'2px solid rgba(245,200,66,.3)'}}>{jogador.avatar}</div>
              <div>
                <div style={{fontWeight:900,fontSize:22,marginBottom:3}}>{jogador.nome}</div>
                {jogador.turma && <div style={{fontSize:12,color:'#B9ACE6',fontWeight:700,marginBottom:5}}>👥 {jogador.turma}</div>}
                <div className="xp-badge">⭐ {prog.xp} XP esta semana</div>
              </div>
            </div>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:30,fontWeight:900,color:'#F5C842',lineHeight:1}}>#{prog.pos||'?'}</div>
              <div style={{fontSize:9,color:'#B9ACE6',textTransform:'uppercase',letterSpacing:1,marginTop:2}}>ranking</div>
            </div>
          </div>
          <div style={{borderTop:'1px solid rgba(245,200,66,.2)',paddingTop:12,display:'flex',gap:10,flexWrap:'wrap'}}>
            <div className="streak-badge">🔥 {prog.streak} dia{prog.streak!==1?'s':''} seguido{prog.streak!==1?'s':''}</div>
            <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'rgba(255,255,255,.07)',border:'1.5px solid rgba(255,255,255,.12)',borderRadius:30,padding:'5px 12px',fontSize:14,fontWeight:800}}>
              🎗️ {prog.done.length}/{licao.dias.length} concluídos
            </div>
          </div>
        </div>
      </div>

      <div className="sec">
        <div className="sec-title">Cronograma de Estudos da Semana</div>
        <div className="days-grid">
          {licao.dias.map((dia: any) => {
            const st = getSt(dia);
            return (
              <div key={dia.id} className={`day-btn ${st}`} onClick={() => st !== 'locked' && onEstudo(dia)}>
                <span>{dia.diaSemana}</span>
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
              {diaAtual.diaSemana} — <strong style={{color:'#5A3E16'}}>{diaAtual.titulo}</strong> • Complete a leitura diária e ganhe 100 XP!
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
        <button className="btn btn-purple" onClick={onRanking} style={{fontSize:16}}>🏆 VER RANKING SEMANAL</button>
      </div>
    </div>
  );
};

/* ===== ESTUDO ===== */
export const Estudo = ({ dia, onQuiz, onBack }: any) => {
  const [pct, setPct] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const p = Math.min(100, Math.round(el.scrollTop / (el.scrollHeight - el.clientHeight) * 100));
    setPct(p);
  };
  
  const paras = dia.conteudo.split('\n\n').filter(Boolean);

  return (
    <div className="scr-full">
      <div className="hdr">
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{width:'auto'}}>← Voltar</button>
        <div style={{fontWeight:800,fontSize:14}}>Dia {dia.id} — {dia.diaSemana}</div>
        <div className="xp-badge" style={{fontSize:12}}>~3 min</div>
      </div>
      <div style={{padding:'10px 20px',background:'rgba(46,33,96,.8)'}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
          <span style={{fontSize:12,color:'#B9ACE6',fontWeight:700}}>Progresso de leitura</span>
          <span style={{fontSize:12,color:'#F5C842',fontWeight:800}}>{pct}%</span>
        </div>
        <div className="prog-wrap"><div className="prog-bar" style={{width:pct+'%'}}/></div>
      </div>
      <div ref={ref} onScroll={onScroll} style={{flex:1,overflowY:'auto',padding:'20px 16px 120px'}}>
        <div style={{fontWeight:900,fontSize:22,marginBottom:20,lineHeight:1.2,color:'#E2D9F3'}}>{dia.titulo}</div>
        {paras.map((p: string, i: number) => (
          <div key={i} style={{background:'rgba(255,255,255,.04)',borderRadius:14,padding:16,marginBottom:12,borderLeft:'3px solid rgba(82,118,208,.55)',lineHeight:1.75,fontSize:15,color:'#E2D9F3',fontWeight:500,animation:`fadeIn .4s ease ${i*.07}s both`}}>{p}</div>
        ))}
        <div className="verse-card" style={{marginTop:8,marginBottom:24}}>
          <div style={{fontSize:11,fontWeight:800,color:'#F5C842',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>💡 Versículo-chave</div>
          <div style={{fontSize:15,fontStyle:'italic',lineHeight:1.65,color:'#E2D9F3',marginBottom:8,paddingLeft:8}}>"{dia.versiculoChave.texto}"</div>
          <div style={{fontWeight:800,color:'#F5C842',fontSize:13}}>— {dia.versiculoChave.referencia}</div>
        </div>
        <button className="btn btn-gold" onClick={onQuiz} style={{fontSize:19}}>🎯 FAZER O QUIZ</button>
        <p style={{textAlign:'center',color:'rgba(185,172,230,.5)',fontSize:13,marginTop:8}}>Leitura: {pct}% completa</p>
      </div>
    </div>
  );
};

/* ===== QUIZ ===== */
export const Quiz = ({ dia, onDone, onBack }: any) => {
  const [qi, setQi] = useState(0);
  const [ans, setAns] = useState<number | null>(null);
  const [resps, setResps] = useState<any[]>([]);
  const [tempo, setTempo] = useState(20);
  const [elapsed, setElapsed] = useState(0);
  const [xpMsg, setXpMsg] = useState<string | null>(null);
  const timerRef = useRef<any>(null);
  const startRef = useRef<number>(0);
  
  const pergs = dia.perguntas;
  const q = pergs[qi];
  const BTNS = [{cls:'qA',sym:'🔺'},{cls:'qB',sym:'🔷'},{cls:'qC',sym:'🔶'},{cls:'qD',sym:'🟢'}];

  const startTimer = useCallback(() => {
    clearInterval(timerRef.current);
    setTempo(20);
    setElapsed(0);
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const e = (Date.now() - startRef.current) / 1000;
      const r = Math.max(0, 20 - e);
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
    const xp = xpSpeed(t, ok);
    setAns(idx);
    
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

  const tPct = tempo / 20 * 100;
  const tColor = tPct > 50 ? '#2ECC71' : tPct > 25 ? '#F5C842' : '#E31C3D';
  const xpSoFar = resps.reduce((s, r) => s + r.xp, 0);

  return (
    <div className="scr-full">
      {xpMsg && <div className="xp-float">{xpMsg}</div>}
      <div style={{padding:'14px 20px',background:'rgba(46,33,96,.9)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span>⏱️</span>
            <span style={{fontWeight:900,fontSize:22,color:tColor}}>{Math.ceil(tempo)}s</span>
          </div>
          <div style={{fontWeight:800,color:'#B9ACE6',fontSize:15}}>{qi + 1}/{pergs.length}</div>
          <div className="xp-badge">⭐ {xpSoFar} XP</div>
        </div>
        <div className="timer-wrap"><div className="timer-bar" style={{width:tPct+'%',background:tColor}}/></div>
      </div>
      <div style={{padding:'18px 16px 0',flex:'none'}}>
        <div style={{background:'rgba(255,255,255,.06)',borderRadius:18,padding:'20px 18px',textAlign:'center',fontWeight:800,fontSize:17,lineHeight:1.4,border:'1.5px solid rgba(245,200,66,.2)',minHeight:100,display:'flex',alignItems:'center',justifyContent:'center'}}>{q.pergunta}</div>
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
            <div style={{fontSize:13,color:'#E2D9F3',lineHeight:1.5}}>{q.explicacao}</div>
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
      <div style={{animation:'fadeIn .5s ease .6s both',color:'#B9ACE6',fontSize:14,marginBottom:26}}>{dia.diaSemana} — {dia.titulo}</div>
      <div style={{animation:'fadeUp .5s ease .7s both',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:22}}>
        {[{e:'✅',l:'Acertos',v:`${acertos}/${total}`},{e:'⭐',l:'XP Ganho',v:`+${xpTotal}`},{e:'⏱️',l:'Tempo médio',v:`${Math.round(tempoMedio)}s`}].map(s => (
          <div key={s.l} className="purple-card" style={{padding:'12px 6px',textAlign:'center'}}>
            <div style={{fontSize:22,marginBottom:4}}>{s.e}</div>
            <div style={{fontWeight:900,fontSize:18,color:'#F5C842'}}>{s.v}</div>
            <div style={{fontSize:9,color:'#B9ACE6',fontWeight:700,textTransform:'uppercase',letterSpacing:.5,marginTop:3}}>{s.l}</div>
          </div>
        ))}
      </div>
      {prog.streak > 0 && <div style={{animation:'fadeIn .5s ease .9s both',marginBottom:14}}><div className="streak-badge" style={{fontSize:16,padding:'8px 20px'}}>🔥 Sequência: {prog.streak} dias!</div></div>}
      {badges.length > 0 && (
        <div style={{animation:'fadeIn .5s ease 1s both',marginBottom:22}}>
          <div style={{fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:2,color:'#B9ACE6',marginBottom:10}}>Conquistas do dia</div>
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
export const Ranking = ({ jogador, ranking, prog, onBack }: any) => {
  const sorted = [...ranking].sort((a, b) => b.xp - a.xp).slice(0, 10);
  const myIdx = sorted.findIndex(r => r.id === jogador.id);
  const meds = ['🥇','🥈','🥉'];

  return (
    <div className="scr">
      <div className="hdr">
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{width:'auto'}}>← Voltar</button>
        <div style={{fontWeight:900,fontSize:17}}>🏆 Ranking Semanal</div>
        <button className="btn btn-ghost btn-sm" onClick={shareApp} style={{width:'auto',padding:'8px',fontSize:14}}>🔗</button>
      </div>
      {sorted.length >= 3 && (
        <div style={{padding:'8px 16px 0'}}>
          <div className="podium">
            <div className="pod-col">
              <div style={{fontSize:30}}>{sorted[1].avatar}</div>
              <div style={{fontWeight:800,fontSize:12,maxWidth:66,textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sorted[1].nome}</div>
              <div className="pod-base p2">🥈</div>
              <div style={{fontWeight:900,color:'#F5C842',fontSize:12}}>{sorted[1].xp} XP</div>
            </div>
            <div className="pod-col">
              <div style={{fontSize:18,animation:'bounce 2s ease-in-out infinite'}}>👑</div>
              <div style={{fontSize:42}}>{sorted[0].avatar}</div>
              <div style={{fontWeight:900,fontSize:14,maxWidth:78,textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sorted[0].nome}</div>
              <div className="pod-base p1">🥇</div>
              <div style={{fontWeight:900,color:'#F5C842',fontSize:14}}>{sorted[0].xp} XP</div>
            </div>
            <div className="pod-col">
              <div style={{fontSize:24}}>{sorted[2].avatar}</div>
              <div style={{fontWeight:800,fontSize:11,maxWidth:58,textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sorted[2].nome}</div>
              <div className="pod-base p3">🥉</div>
              <div style={{fontWeight:900,color:'#F5C842',fontSize:12}}>{sorted[2].xp} XP</div>
            </div>
          </div>
        </div>
      )}
      <div className="sec" style={{marginTop:4}}>
        <div className="sec-title">Classificação completa</div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {sorted.map((r, i) => {
            const eu = r.id === jogador.id;
            return (
              <div key={r.id} style={{background:eu?'linear-gradient(135deg,rgba(245,200,66,.12),rgba(245,200,66,.04))':'rgba(255,255,255,.04)',border:`2px solid ${eu?'rgba(245,200,66,.42)':'rgba(255,255,255,.07)'}`,borderRadius:14,padding:'12px 16px',display:'flex',alignItems:'center',gap:12,animation:`popIn .3s ease ${i*.05}s both`}}>
                <div style={{fontWeight:900,fontSize:16,width:26,textAlign:'center',color:i<3?'#F5C842':'#B9ACE6'}}>{i < 3 ? meds[i] : `${i + 1}º`}</div>
                <div style={{fontSize:26}}>{r.avatar}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:14}}>{r.nome}{eu ? ' 👈' : ''}</div>
                  <div style={{fontSize:12,color:'#B9ACE6'}}>📅 {r.dias} dia{r.dias!==1?'s':''} estudado{r.dias!==1?'s':''}</div>
                </div>
                <div style={{fontWeight:900,color:'#F5C842',fontSize:15}}>{r.xp} XP</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="sec">
        <div className="purple-card" style={{textAlign:'center'}}>
          <div style={{fontSize:13,color:'#B9ACE6',marginBottom:4}}>Sua posição</div>
          <div style={{fontWeight:900,fontSize:32,color:'#F5C842'}}>#{myIdx >= 0 ? myIdx + 1 : '?'}</div>
          <div style={{fontSize:13,color:'#B9ACE6'}}>📅 {prog.done.length} dias • ⭐ {prog.xp} XP esta semana</div>
        </div>
      </div>
    </div>
  );
};

/* ===== ADMIN ===== */
export const Admin = ({ licao, onImport, onClear, onBack }: any) => {
  const [txt, setTxt] = useState('');
  const [prev, setPrev] = useState<any>(null);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  
  const validate = (s: string) => {
    setErr('');
    setPrev(null);
    try {
      const p = JSON.parse(s);
      if (!p.titulo || !Array.isArray(p.dias)) throw new Error('Estrutura inválida: requer titulo e dias[]');
      const nq = p.dias.reduce((a: number, d: any) => a + (d.perguntas?.length || 0), 0);
      setPrev({ titulo: p.titulo, dias: p.dias.length, perguntas: nq, obj: p });
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      const res = ev.target?.result as string;
      setTxt(res);
      validate(res);
    };
    r.readAsText(f);
  };

  return (
    <div className="scr">
      <div className="hdr">
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{width:'auto'}}>← Voltar</button>
        <div style={{fontWeight:900,fontSize:17}}>⚙️ Painel Admin</div>
        <div/>
      </div>
      <div style={{padding:'20px 16px'}}>
        <div className="sec-title" style={{marginBottom:8}}>Cole o JSON da lição:</div>
        <textarea className="adm-ta" value={txt} onChange={e => { setTxt(e.target.value); validate(e.target.value); }} placeholder={'{\n  "titulo": "Nome da Lição",\n  "semana": "2026-W24",\n  "trimestre": "3T2026",\n  "dias": [...]\n}'}/>
        <button className="btn btn-ghost" style={{marginTop:12,marginBottom:12}} onClick={() => fileRef.current?.click()}>📁 ESCOLHER ARQUIVO .JSON</button>
        <input ref={fileRef} type="file" accept=".json" onChange={handleFile} style={{display:'none'}}/>
        {err && <div style={{background:'rgba(227,28,61,.12)',border:'1.5px solid #E31C3D',borderRadius:12,padding:12,marginBottom:14}}><div style={{color:'#E31C3D',fontWeight:800,fontSize:14}}>❌ {err}</div></div>}
        {prev && <div style={{background:'rgba(79,184,92,.12)',border:'1.5px solid #4FB85C',borderRadius:12,padding:12,marginBottom:16}}><div style={{color:'#4FB85C',fontWeight:800,fontSize:14,marginBottom:4}}>✅ JSON válido!</div><div style={{fontSize:14,color:'#E2D9F3'}}>📖 {prev.titulo}</div><div style={{fontSize:13,color:'#B9ACE6'}}>📅 {prev.dias} dias | ❓ {prev.perguntas} perguntas</div></div>}
        <button className={`btn btn-grn${!prev ? ' btn-dis' : ''}`} style={{marginBottom:12}} onClick={() => prev && onImport(prev.obj)}>✅ IMPORTAR LIÇÃO</button>
        <button className="btn btn-ghost" style={{color:'#FF6B6B',borderColor:'rgba(227,28,61,.3)'}} onClick={onClear}>🗑️ LIMPAR PROGRESSO</button>
        <div style={{marginTop:24,padding:16,background:'rgba(255,255,255,.03)',borderRadius:12}}>
          <div style={{fontWeight:800,color:'#B9ACE6',fontSize:11,marginBottom:8,textTransform:'uppercase',letterSpacing:1}}>Lição Atual</div>
          <div style={{fontSize:14,color:'#E2D9F3'}}>📖 {licao.titulo}</div>
          <div style={{fontSize:13,color:'#B9ACE6'}}>📅 {licao.dias.length} dias | {licao.trimestre}</div>
        </div>
      </div>
    </div>
  );
};
