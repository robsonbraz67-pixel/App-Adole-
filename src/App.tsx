import React, { useState, useEffect } from 'react';
import { DEMO } from './data';
import { gs, ss, calcPos, rankDemo, PROG0, playSound } from './utils';
import { Splash, Login, Home, Estudo, Quiz, Resultado, Ranking, Admin, Config } from './components';

export default function App() {
  const [tela, setTela] = useState('splash');
  const [jogador, setJogador] = useState<any>(null);
  const [licao, setLicao] = useState<any>(null);
  const [prog, setProg] = useState<any>(PROG0);
  const [ranking, setRanking] = useState<any[]>([]);
  const [diaAtual, setDiaAtual] = useState<any>(null);
  const [resultado, setResultado] = useState<any>(null);
  const [logoTaps, setLogoTaps] = useState(0);
  
  const semKey = (l: any) => 'prog_' + (l?.semana || 'w');

  useEffect(() => {
    let unmounted = false;
    const initApp = async () => {
      const j = gs('jogador');
      const l = gs('licao_atual', DEMO);
      setLicao(l);

      let r = gs('ranking') || rankDemo();
      try {
        const { getWeeklyRanking, waitForAuthInit } = await import('./firebase');
        const user = await waitForAuthInit();
        if (user) {
          const dbRanking = await getWeeklyRanking(l.semana);
          if (dbRanking.length > 0) {
            r = dbRanking;
            ss('ranking', r);
          }
        }
      } catch(e) {
        console.error("Error loading ranking:", e);
      }
      if (unmounted) return;
      setRanking(r);

      if (j) {
        setJogador(j);
        
        let p = gs(semKey(l), PROG0);
        try {
          const { getProgress, getUser, waitForAuthInit } = await import('./firebase');
          const user = await waitForAuthInit();
          if (user) {
            const dbUser = await getUser(j.id);
            if (dbUser) {
               setJogador({ ...j, ...dbUser });
               let updatedJ = { ...j, ...dbUser };
               ss('jogador', updatedJ);
            }
            const dbProg = await getProgress(j.id, l.semana);
            if (dbProg) {
              p = { xp: dbProg.xp, streak: dbProg.streak, done: dbProg.done || [], history: dbProg.history || {} };
              ss(semKey(l), p);
            }
          }
        } catch(e) {
          console.error("Error loading progress:", e);
        }
        
        if (unmounted) return;
        setProg({ ...p, pos: calcPos(r, j.id, p.xp || 0) });
      }
      
      setTimeout(() => {
        if (!unmounted) setTela(j ? 'home' : 'login');
      }, 500);
    };

    initApp();
    return () => { unmounted = true; };
  }, []);

  const handleLogin = async (j: any) => {
    setJogador(j);
    const l = gs('licao_atual', DEMO);
    setLicao(l);
    
    let p = gs(semKey(l), PROG0);
    let r = gs('ranking') || rankDemo();

    try {
      const { saveUser, getProgress } = await import('./firebase');
      await saveUser(j);
      
      const dbProg = await getProgress(j.id, l.semana);
      if (dbProg) {
        p = { xp: dbProg.xp, streak: dbProg.streak, done: dbProg.done || [], history: dbProg.history || {} };
        ss(semKey(l), p);
      }
    } catch(e) {
      console.error("Error saving user profile or loading progress:", e);
    }
    
    setRanking(r);
    setProg({ ...p, pos: calcPos(r, j.id, p.xp || 0) });
    if (j.isNew) {
      delete j.isNew;
      ss('jogador', j);
      setTela('config');
    } else {
      setTela('home');
    }
  };

  const handleDoneQuiz = async (res: any) => {
    setResultado(res);
    const l = licao || DEMO;
    const novaDone = prog.done.includes(diaAtual.id) ? prog.done : [...prog.done, diaAtual.id];
    const novoXP = prog.xp + res.xpTotal;
    const novoStreak = prog.done.includes(diaAtual.id) ? prog.streak : prog.streak + 1;
    
    const np = {
      ...prog,
      xp: novoXP,
      streak: novoStreak,
      done: novaDone,
      history: { ...prog.history, [diaAtual.id]: { ...prog.history[diaAtual.id], xp: res.xpTotal, acertos: res.acertos } }
    };
    
    let r = [...ranking];
    const idx = r.findIndex((x: any) => x.id === jogador.id);
    if (idx !== -1) {
      r[idx].xp = novoXP;
      r[idx].dias = novaDone.length;
    } else {
      r.push({ id: jogador.id, nome: jogador.nome, avatar: jogador.avatar, xp: novoXP, dias: novaDone.length });
    }
    r.sort((a, b) => b.xp - a.xp);
    
    ss('ranking', r);
    ss(semKey(l), np);
    setRanking(r);
    setProg({ ...np, pos: calcPos(r, jogador.id, novoXP) });
    
    try {
       const { saveProgress, waitForAuthInit } = await import('./firebase');
       const user = await waitForAuthInit();
       if (user) {
          await saveProgress(np, l.semana, jogador.id, jogador.nome, jogador.avatar);
       }
    } catch(e) {
       console.error("Error updating online progress:", e);
    }
    
    setTela('resultado');
  };

  const handleLogout = async () => {
    localStorage.removeItem('jogador');
    try {
      const { logout } = await import('./firebase');
      await logout();
    } catch(e) {
      console.error("Logout error", e);
    }
    setJogador(null);
    setTela('login');
  };

  const loadLatestRanking = async () => {
    const l = licao || DEMO;
    try {
      const { getWeeklyRanking, waitForAuthInit } = await import('./firebase');
      const user = await waitForAuthInit();
      if (user) {
        const dbRanking = await getWeeklyRanking(l.semana);
        if (dbRanking.length > 0) {
          setRanking(dbRanking);
          ss('ranking', dbRanking);
          setProg((prev: any) => ({ ...prev, pos: calcPos(dbRanking, jogador?.id, prev.xp || 0) }));
        }
      }
    } catch(e) {
      console.error(e);
    }
    playSound('ranking');
    setTela('ranking');
  };

  const handleImport = (obj: any) => {
    ss('licao_atual', obj);
    setLicao(obj);
    alert('✅ Lição importada!');
    setTela('home');
  };

  const handleClear = () => {
    if (window.confirm('Limpar todo o progresso desta semana?')) {
      const k = semKey(licao || DEMO);
      localStorage.removeItem(k);
      setProg({ ...PROG0, pos: calcPos(ranking, jogador?.id, 0) });
      alert('🗑️ Progresso limpo localmente!');
    }
  };

  const handleLogoTap = () => {
    const n = logoTaps + 1;
    setLogoTaps(n);
    if (n >= 7) {
      setLogoTaps(0);
      setTela('admin');
    }
  };

  const handleSaveStudy = async (nota: string, hl: any) => {
    const l = licao || DEMO;
    const diaHist = prog.history[diaAtual.id] || {};
    const np = {
      ...prog,
      history: { ...prog.history, [diaAtual.id]: { ...diaHist, nota, hl } }
    };
    ss(semKey(l), np);
    setProg(np);
    try {
      const { saveProgress, waitForAuthInit } = await import('./firebase');
      const user = await waitForAuthInit();
      if (user) {
        await saveProgress(np, l.semana, jogador.id, jogador.nome, jogador.avatar);
      }
    } catch(e) { console.error(e) }
  };

  const handleUpdateConfig = async (novoJ: any) => {
    setJogador(novoJ);
    ss('jogador', novoJ);
    try {
      const { saveUser, saveProgress, waitForAuthInit } = await import('./firebase');
      const user = await waitForAuthInit();
      if (user) {
        await saveUser(novoJ);
        const l = licao || DEMO;
        await saveProgress(prog, l.semana, novoJ.id, novoJ.nome, novoJ.avatar);
      }
      
      let r = [...ranking];
      const idx = r.findIndex(x => x.id === novoJ.id);
      if (idx !== -1) {
        r[idx].nome = novoJ.nome;
        r[idx].avatar = novoJ.avatar;
        ss('ranking', r);
        setRanking(r);
      }
    } catch(e) { console.error(e) }
    setTela('home');
  };

  if (tela === 'splash') return <Splash />;
  if (tela === 'login') return <Login onLogin={handleLogin} />;
  if (!jogador || !licao) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100dvh',color:'#B9ACE6'}}>Carregando...</div>;

  return (
    <>
      {tela === 'home' && <Home jogador={jogador} licao={licao} prog={prog} onEstudo={(d: any) => { setDiaAtual(d); setTela('estudo'); }} onRanking={loadLatestRanking} onConfig={() => setTela('config')} />}
      {tela === 'estudo' && diaAtual && <Estudo dia={diaAtual} prog={prog} onSaveStudy={handleSaveStudy} onQuiz={() => setTela('quiz')} onBack={() => setTela('home')} />}
      {tela === 'quiz' && diaAtual && <Quiz dia={diaAtual} onDone={handleDoneQuiz} onBack={() => setTela('estudo')} />}
      {tela === 'resultado' && resultado && <Resultado res={resultado} dia={diaAtual} prog={prog} onRanking={loadLatestRanking} onHome={() => setTela('home')} />}
      {tela === 'ranking' && <Ranking jogador={jogador} ranking={ranking} prog={prog} onBack={() => setTela('home')} />}
      {tela === 'admin' && <Admin licao={licao} onImport={handleImport} onClear={handleClear} onBack={() => setTela('home')} />}
      {tela === 'config' && <Config jogador={jogador} onSave={handleUpdateConfig} onBack={() => setTela('home')} onLogout={handleLogout} />}
      {tela === 'home' && <div onClick={handleLogoTap} style={{position:'fixed',top:0,left:0,width:55,height:55,zIndex:500,opacity:0,cursor:'default'}} />}
    </>
  );
}
