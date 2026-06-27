import React, { useState, useEffect } from 'react';
import { LICOES } from './data';
import { gs, ss, calcPos, rankDemo, PROG0, playSound, getRecencyMult, scheduleStudyReminder } from './utils';
import { listenToUserNotifications, getWeeklyRanking, waitForAuthInit, getProgress, getUser, saveUser, saveProgress, logout, getSeasonRanking } from './firebase';
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
  const [inAppNotif, setInAppNotif] = useState<{title: string, body: string, id: number} | null>(null);

  const semKey = (l: any) => 'prog_' + (l?.semana || 'w');

  useEffect(() => {
    if (!jogador?.id) return;

    let lastNotifTime = parseInt(localStorage.getItem('lastNotifTime_' + jogador.id) || '0', 10);

    const unsub = listenToUserNotifications(jogador.id, (notification) => {
       if (notification && notification.timestamp > lastNotifTime) {
          setInAppNotif({ title: notification.title, body: notification.body, id: Date.now() });
          if ('Notification' in window && Notification.permission === 'granted') {
             navigator.serviceWorker.ready.then(reg => {
                reg.showNotification(notification.title || 'Nova Notificação', {
                   body: notification.body || '',
                   icon: '/icon-192.png',
                   badge: '/icon-192.png'
                });
             }).catch(e => console.log('SW Notification failed:', e));
          }
          lastNotifTime = notification.timestamp;
          localStorage.setItem('lastNotifTime_' + jogador.id, lastNotifTime.toString());
       }
    });

    return () => unsub();
  }, [jogador?.id]);

  useEffect(() => {
    if (inAppNotif) {
      const timer = setTimeout(() => setInAppNotif(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [inAppNotif]);

  useEffect(() => {
    let unmounted = false;
    const initApp = async () => {
      const j = gs('jogador');
      const l = gs('licao_atual', LICOES[LICOES.length - 1]);
      setLicao(l);

      let r = gs('ranking') || rankDemo();
      try {
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
          const user = await waitForAuthInit();
          if (user) {
            if (user.uid !== j.id) {
               localStorage.removeItem('jogador');
               window.location.reload();
               return;
            }
            const dbUser = await getUser(j.id);
            if (dbUser) {
               const updatedJ = { ...j, ...dbUser };
               setJogador(updatedJ);
               ss('jogador', updatedJ);
            }
            const dbProg = await getProgress(j.id, l.semana);
            if (dbProg) {
              p = { xp: dbProg.xp, streak: dbProg.streak, done: dbProg.done || [], history: dbProg.history || {} };
              ss(semKey(l), p);
            }
          } else {
             localStorage.removeItem('jogador');
             window.location.reload();
             return;
          }
        } catch(e) {
          console.error("Error loading progress:", e);
        }

        if (unmounted) return;
        setProg({ ...p, pos: calcPos(r, j.id, p.xp || 0) });
      }

      if (!unmounted) setTela(j ? 'home' : 'login');
    };

    initApp();
    return () => { unmounted = true; };
  }, []);

  const handleLogin = async (j: any) => {
    setJogador(j);
    const l = gs('licao_atual', LICOES[LICOES.length - 1]);
    setLicao(l);

    let p = gs(semKey(l), PROG0);
    let r = gs('ranking') || rankDemo();

    try {
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
    const l = licao || LICOES[LICOES.length - 1];

    let dbLicaoData = null;
    try {
      const selectedLicaoData = LICOES.find((x:any) => x.semana === l.semana);
      if (selectedLicaoData) {
        dbLicaoData = selectedLicaoData.dias.find((d: any) => d.id === diaAtual.id)?.data;
      }
    } catch(e) {}

    let readingXP = 0;
    const isRepeat = prog.done.includes(diaAtual.id);
    if (!isRepeat) {
      readingXP = Math.round(100 * (dbLicaoData || diaAtual.data ? getRecencyMult(dbLicaoData || diaAtual.data) : 1.0));
      res.xpTotal += readingXP;
    }

    const novaDone = isRepeat ? prog.done : [...prog.done, diaAtual.id];
    const novoXP = isRepeat ? prog.xp : prog.xp + res.xpTotal;
    const novoStreak = isRepeat ? prog.streak : prog.streak + 1;

    const np = {
      ...prog,
      xp: novoXP,
      streak: novoStreak,
      done: novaDone,
      history: { ...prog.history, [diaAtual.id]: {
         ...prog.history[diaAtual.id],
         xp: isRepeat ? (prog.history[diaAtual.id]?.xp || 0) : res.xpTotal,
         acertos: isRepeat ? (prog.history[diaAtual.id]?.acertos || 0) : res.acertos
      } }
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
       const user = await waitForAuthInit();
       if (user) {
          await saveProgress(np, l.semana, jogador.id, jogador.nome, jogador.avatar, l.trimestre);
       }
    } catch(e) {
       console.error("Error updating online progress:", e);
    }

    try {
      await scheduleStudyReminder(jogador.nome, l.titulo || 'Estudo Diário');
    } catch(e) {
      console.error(e);
    }

    setTela('resultado');
  };

  const handleLogout = async () => {
    localStorage.removeItem('jogador');
    try {
      await logout();
    } catch(e) {
      console.error("Logout error", e);
    }
    setJogador(null);
    setTela('login');
  };

  const [rankingType, setRankingType] = useState('week');

  const loadLatestRanking = async (type: string = 'week') => {
    setRankingType(type);
    const l = licao || LICOES[LICOES.length - 1];
    try {
      const user = await waitForAuthInit();
      if (user) {
        let dbRanking;
        if (type === 'week') {
          dbRanking = await getWeeklyRanking(l.semana);
        } else {
          dbRanking = await getSeasonRanking(l.trimestre);
        }
        if (dbRanking && dbRanking.length > 0) {
          setRanking(dbRanking);
          if (type === 'week') {
             ss('ranking', dbRanking);
             setProg((prev: any) => ({ ...prev, pos: calcPos(dbRanking, jogador?.id, prev.xp || 0) }));
          }
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

  const handleChangeLicao = async (newLicao: any) => {
    ss('licao_atual', newLicao);
    setLicao(newLicao);

    let p = gs(semKey(newLicao), PROG0);
    let r = rankDemo();

    setRanking(r);
    setProg({ ...p, pos: calcPos(r, jogador.id, p.xp || 0) });

    try {
      const user = await waitForAuthInit();
      if (user) {
        const dbRanking = await getWeeklyRanking(newLicao.semana);
        if (dbRanking.length > 0) {
          r = dbRanking;
          setRanking(r);
        }

        const dbProg = await getProgress(jogador.id, newLicao.semana);
        if (dbProg) {
          p = { xp: dbProg.xp, streak: dbProg.streak, done: dbProg.done || [], history: dbProg.history || {} };
          ss(semKey(newLicao), p);
        }

        setProg({ ...p, pos: calcPos(r, jogador.id, p.xp || 0) });
      }
    } catch(e) {
      console.error(e);
    }
  };

  const handleClear = () => {
    if (window.confirm('Limpar todo o progresso desta semana?')) {
      const k = semKey(licao || LICOES[LICOES.length - 1]);
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
    const l = licao || LICOES[LICOES.length - 1];
    const diaHist = prog.history[diaAtual.id] || {};
    const np = {
      ...prog,
      history: { ...prog.history, [diaAtual.id]: { ...diaHist, nota, hl } }
    };
    ss(semKey(l), np);
    setProg(np);
    try {
      const user = await waitForAuthInit();
      if (user) {
        await saveProgress(np, l.semana, jogador.id, jogador.nome, jogador.avatar, l.trimestre);
      }
    } catch(e) { console.error(e) }
  };

  const handleUpdateConfig = async (novoJ: any) => {
    setJogador(novoJ);
    ss('jogador', novoJ);
    try {
      const user = await waitForAuthInit();
      if (user) {
        await saveUser(novoJ);
        const l = licao || LICOES[LICOES.length - 1];
        await saveProgress(prog, l.semana, novoJ.id, novoJ.nome, novoJ.avatar, l.trimestre);
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
      {tela === 'home' && <Home jogador={jogador} licao={licao} prog={prog} onEstudo={(d: any) => { setDiaAtual(d); setTela('estudo'); }} onRanking={() => loadLatestRanking('week')} onConfig={() => setTela('config')} onAdmin={() => setTela('admin')} onChangeLicao={handleChangeLicao} />}
      {tela === 'estudo' && diaAtual && <Estudo dia={diaAtual} prog={prog} jogador={jogador} onSaveStudy={handleSaveStudy} onQuiz={() => setTela('quiz')} onBack={() => setTela('home')} />}
      {tela === 'quiz' && diaAtual && <Quiz dia={diaAtual} onDone={handleDoneQuiz} onBack={() => setTela('estudo')} />}
      {tela === 'resultado' && resultado && <Resultado res={resultado} dia={diaAtual} prog={prog} onRanking={() => loadLatestRanking('week')} onHome={() => setTela('home')} />}
      {tela === 'ranking' && <Ranking jogador={jogador} ranking={ranking} prog={prog} type={rankingType} onChangeType={loadLatestRanking} onBack={() => setTela('home')} licao={licao} />}
      {tela === 'admin' && <Admin licao={licao} onImport={handleImport} onClear={handleClear} onBack={() => setTela('home')} />}
      {tela === 'config' && <Config jogador={jogador} onSave={handleUpdateConfig} onBack={() => setTela('home')} onLogout={handleLogout} />}
      {tela === 'home' && <div onClick={handleLogoTap} style={{position:'fixed',top:0,left:0,width:55,height:55,zIndex:500,opacity:0,cursor:'default'}} />}

      {inAppNotif && (
        <div style={{
           position: 'fixed',
           top: 20,
           left: '50%',
           transform: 'translateX(-50%)',
           background: 'rgba(25,18,48,0.95)',
           border: '1px solid rgba(245,200,66,0.3)',
           padding: '16px 20px',
           borderRadius: 16,
           zIndex: 9999,
           boxShadow: '0 8px 30px rgba(0,0,0,0.5), 0 0 15px rgba(245,200,66,0.2)',
           display: 'flex',
           flexDirection: 'column',
           minWidth: 300,
           maxWidth: '90%',
           animation: 'fadeInDown 0.4s ease-out forwards'
        }}>
           <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
              <div>
                 <div style={{fontSize: 14, fontWeight: 800, color: '#F5C842', marginBottom: 4}}>{inAppNotif.title}</div>
                 <div style={{fontSize: 13, color: '#E2D9F3', lineHeight: 1.4}}>{inAppNotif.body}</div>
              </div>
              <button
                onClick={() => setInAppNotif(null)}
                style={{background:'none', border:'none', color:'#B9ACE6', fontSize: 18, cursor:'pointer', padding: '0 0 0 12px'}}
              >
                ✕
              </button>
           </div>
        </div>
      )}
    </>
  );
}
