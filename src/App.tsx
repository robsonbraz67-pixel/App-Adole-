import React, { useState, useEffect, useRef } from 'react';
import { getTrackLessons } from './data';
import { gs, ss, calcPos, PROG0, playSound, getRecencyMult, scheduleStudyReminder, shareApp } from './utils';
import { listenToUserNotifications, getWeeklyRanking, waitForAuthInit, getProgress, getUser, saveUser, saveProgress, logout, getSeasonRanking, getDayOverride, getActivePair, getPairInvite, getMyGroups, getGroupInvite } from './firebase';
import { Splash, Login, Home, Estudo, Quiz, Resultado, Ranking, Admin, Config, BottomNav, Sorteador, Dupla, Grupo } from './components';

const CACHE_VERSION = '3T2026';

const clearStaleCache = () => {
  if (localStorage.getItem('cacheVersion') === CACHE_VERSION) return;
  Object.keys(localStorage)
    .filter(k => k.startsWith('prog_') || k.startsWith('ranking_'))
    .forEach(k => localStorage.removeItem(k));
  localStorage.removeItem('licao_atual');
  localStorage.setItem('cacheVersion', CACHE_VERSION);
};

// Trilhas sem conteúdo ainda (youngAdult/adult) caem nesse placeholder em vez
// de quebrar as telas que esperam sempre ter uma lição ativa com .dias/.semana.
const EM_BREVE_LICAO = { semana: '__em_breve__', trimestre: '', titulo: 'Em breve', dias: [], isComingSoon: true };

const getActiveLicao = (track?: string | null) => {
  const hoje = new Date();
  const offset = hoje.getTimezoneOffset() * 60000;
  const h = new Date(hoje.getTime() - offset).toISOString().split('T')[0];
  const visible = (getTrackLessons(track) as any[]).filter(l => !l.isAdminOnly);
  if (visible.length === 0) return EM_BREVE_LICAO;
  const active = visible.find(l => {
    const dates = l.dias.map((d: any) => d.data);
    return h >= dates[0] && h <= dates[dates.length - 1];
  });
  return active || visible[0];
};

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
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>(() => (localStorage.getItem('theme') as 'light' | 'dark' | 'auto') || 'auto');
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [activePair, setActivePair] = useState<any>(null);
  const [pendingInvite, setPendingInvite] = useState<any>(null);
  const [myGroups, setMyGroups] = useState<any[]>([]);
  const [pendingGroupInvite, setPendingGroupInvite] = useState<any>(null);

  // Deep links ?dupla=<inviteId> / ?grupo=<inviteId>: guarda e limpa da URL (sobrevive ao login)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pairParam = params.get('dupla');
    const groupParam = params.get('grupo');
    if (pairParam) localStorage.setItem('pendingPairInvite', pairParam);
    if (groupParam) localStorage.setItem('pendingGroupInvite', groupParam);
    if (pairParam || groupParam) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  // Carrega a dupla ativa e os grupos quando há usuário matriculado
  useEffect(() => {
    if (!jogador?.id || !jogador?.locationId) { setActivePair(null); setMyGroups([]); return; }
    getActivePair(jogador.id).then(setActivePair).catch(() => {});
    getMyGroups(jogador.id).then(setMyGroups).catch(() => {});
  }, [jogador?.id, jogador?.locationId]);

  // Resgata convite de dupla pendente (chegou por link) após login + matrícula
  useEffect(() => {
    const pid = localStorage.getItem('pendingPairInvite');
    if (!pid || !jogador?.id || !jogador?.locationId) return;
    getPairInvite(pid).then(inv => {
      if (inv && inv.status === 'pending') { setPendingInvite(inv); setTela('dupla'); }
      else localStorage.removeItem('pendingPairInvite');
    }).catch(() => {});
  }, [jogador?.id, jogador?.locationId]);

  // Resgata convite de grupo pendente (chegou por link) após login + matrícula
  useEffect(() => {
    const gid = localStorage.getItem('pendingGroupInvite');
    if (!gid || !jogador?.id || !jogador?.locationId) return;
    getGroupInvite(gid).then(inv => {
      if (inv && inv.active) { setPendingGroupInvite(inv); setTela('grupo'); }
      else localStorage.removeItem('pendingGroupInvite');
    }).catch(() => {});
  }, [jogador?.id, jogador?.locationId]);

  const clearPendingInvite = () => { localStorage.removeItem('pendingPairInvite'); setPendingInvite(null); };
  const clearPendingGroupInvite = () => { localStorage.removeItem('pendingGroupInvite'); setPendingGroupInvite(null); };

  // PWA fica dias em memória sem recarregar: quando uma nova semana começa,
  // avança a lição automaticamente para não salvar progresso na semana errada
  const activeSemanaRef = useRef<string>(getActiveLicao().semana);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      const active = getActiveLicao(jogador?.track);
      if (active.semana === activeSemanaRef.current) return; // semana não virou
      activeSemanaRef.current = active.semana;
      if (jogador && licao && licao.semana < active.semana) handleChangeLicao(active);
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    const iv = setInterval(check, 60 * 60 * 1000);
    return () => { document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); clearInterval(iv); };
  }, [licao, jogador]);

  const shouldAskNotif = () => {
    if (!('Notification' in window)) return false;
    if (Notification.permission !== 'default') return false;
    const last = parseInt(localStorage.getItem('notifAskedAt') || '0', 10);
    return Date.now() - last > 7 * 24 * 60 * 60 * 1000;
  };

  const handleNotifAccept = async () => {
    localStorage.setItem('notifAskedAt', Date.now().toString());
    setShowNotifPrompt(false);
    await Notification.requestPermission();
  };

  const handleNotifDismiss = () => {
    localStorage.setItem('notifAskedAt', Date.now().toString());
    setShowNotifPrompt(false);
  };

  useEffect(() => {
    if (theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem('theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    }
  }, [theme]);

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
      clearStaleCache();
      const j = gs('jogador');
      const activeLicao = getActiveLicao(j?.track);
      const savedLicao = gs('licao_atual', null);
      // Auto-switch to current week's lesson; keep saved only if it's the same week or a future week
      const l = (savedLicao && savedLicao.semana >= activeLicao.semana) ? savedLicao : activeLicao;
      ss('licao_atual', l);
      setLicao(l);

      let r = gs('ranking_' + l.semana, []);
      try {
        const user = await waitForAuthInit();
        if (user) {
          const dbRanking = await getWeeklyRanking(l.semana);
          r = dbRanking;
        }
      } catch(e) {
        console.error("Error loading ranking:", e);
      }
      ss('ranking_' + l.semana, r);
      if (unmounted) return;
      setRanking(r);

      let hasLocation = !!j?.locationId;

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
               if (dbUser.bloqueado) {
                 await logout();
                 localStorage.removeItem('jogador');
                 if (!unmounted) {
                   setTela('login');
                   setInAppNotif({ title: '🚫 Conta bloqueada', body: 'Sua conta foi bloqueada. Entre em contato com o administrador.', id: Date.now() });
                 }
                 return;
               }
               const updatedJ = { ...j, ...dbUser };
               if (j.avatar?.startsWith('data:') && !dbUser.avatar?.startsWith('data:')) {
                 updatedJ.avatar = j.avatar;
                 saveUser(updatedJ).catch(console.error);
               }
               setJogador(updatedJ);
               ss('jogador', updatedJ);
               hasLocation = !!updatedJ.locationId;
            }
            const dbProg = await getProgress(j.id, l.semana);
            if (dbProg) {
              p = { xp: dbProg.xp, streak: dbProg.streak, done: dbProg.done || [], history: dbProg.history || {} };
              ss(semKey(l), p);
            } else if ((p.xp > 0 || (p.done?.length ?? 0) > 0) && dbUser) {
              saveProgress(p, l.semana, j.id, dbUser.nome || j.nome, dbUser.avatar || j.avatar, l.trimestre, !!dbUser.isAdmin, !!dbUser.isGuest, !!dbUser.isProfessor).catch(console.error);
            }

            // Also sync previous lesson's local progress if it never reached Firestore
            if (dbUser) {
              const allVisible = (getTrackLessons(dbUser.track) as any[]).filter((x: any) => !x.isAdminOnly);
              const curIdx = allVisible.findIndex((x: any) => x.semana === l.semana);
              if (curIdx > 0) {
                const prevL = allVisible[curIdx - 1];
                const prevLocal = gs(`prog_${prevL.semana}`, null);
                if (prevLocal && (prevLocal.xp > 0 || (prevLocal.done?.length ?? 0) > 0)) {
                  getProgress(j.id, prevL.semana).then(prevDb => {
                    if (!prevDb) saveProgress(prevLocal, prevL.semana, j.id, dbUser.nome || j.nome, dbUser.avatar || j.avatar, prevL.trimestre, !!dbUser.isAdmin, !!dbUser.isGuest, !!dbUser.isProfessor).catch(console.error);
                  }).catch(console.error);
                }
              }
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

      if (!unmounted) {
        setTela(j ? (hasLocation ? 'home' : 'config') : 'login');
        if (j && shouldAskNotif()) setShowNotifPrompt(true);
      }
    };

    initApp();
    return () => { unmounted = true; };
  }, []);

  const handleLogin = async (j: any) => {
    const activeLicao = getActiveLicao(j?.track);
    const savedLicao = gs('licao_atual', null);
    const l = (savedLicao && savedLicao.semana >= activeLicao.semana) ? savedLicao : activeLicao;
    ss('licao_atual', l);
    setLicao(l);

    let p = gs(semKey(l), PROG0);
    let r = gs('ranking_' + l.semana, []);

    try {
      const dbUser = await getUser(j.id);
      if (dbUser?.bloqueado) {
        await logout();
        localStorage.removeItem('jogador');
        setTela('login');
        setInAppNotif({ title: '🚫 Conta bloqueada', body: 'Sua conta foi bloqueada. Entre em contato com o administrador.', id: Date.now() });
        return;
      }
      // Puxa papéis/config definidos no servidor (isProfessor, isAdmin, isGuest…)
      // que o perfil vindo do login do Google não conhece — senão o professor
      // fica sem poderes logo após logar (só voltavam ao recarregar a página).
      if (dbUser) {
        j = { ...j, ...dbUser };
        ss('jogador', j);
      }
      await saveUser(j);

      const dbProg = await getProgress(j.id, l.semana);
      if (dbProg) {
        p = { xp: dbProg.xp, streak: dbProg.streak, done: dbProg.done || [], history: dbProg.history || {} };
        ss(semKey(l), p);
      }
    } catch(e) {
      console.error("Error saving user profile or loading progress:", e);
    }
    setJogador(j);

    setRanking(r);
    setProg({ ...p, pos: calcPos(r, j.id, p.xp || 0) });
    if (j.isNew) delete j.isNew;
    ss('jogador', j);
    setTela(j.locationId ? 'home' : 'config');
    if (shouldAskNotif()) setShowNotifPrompt(true);
  };

  const handleDoneQuiz = async (res: any) => {
    setResultado(res);
    const l = licao || getActiveLicao(jogador?.track);

    let dbLicaoData = null;
    try {
      const selectedLicaoData = getTrackLessons(jogador?.track).find((x:any) => x.semana === l.semana);
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

    ss('ranking_' + l.semana, r);
    ss(semKey(l), np);
    setRanking(r);
    setProg({ ...np, pos: calcPos(r, jogador.id, novoXP) });

    // Mostra o resultado imediatamente; sync com a nuvem roda em segundo plano
    setTela('resultado');

    (async () => {
      try {
         const user = await waitForAuthInit();
         if (user) {
            await saveProgress(np, l.semana, jogador.id, jogador.nome, jogador.avatar, l.trimestre, !!jogador.isAdmin, !!jogador.isGuest, !!jogador.isProfessor);
         }
      } catch(e) {
         console.error("Error updating online progress:", e);
         setInAppNotif({ title: '⚠️ Progresso não sincronizado', body: 'Seu progresso foi salvo localmente, mas não chegou à nuvem. Verifique sua conexão.', id: Date.now() });
      }
      try {
        await scheduleStudyReminder(jogador.nome, l.titulo || 'Estudo Diário');
      } catch(e) {
        console.error(e);
      }
    })();
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

  const loadLatestRanking = async (type: string = 'week', licaoArg?: any) => {
    setRankingType(type);
    const l = licaoArg || licao || getActiveLicao(jogador?.track);
    // Abre a tela imediatamente com o cache local; atualiza quando o Firestore responder
    if (type === 'week') setRanking(gs('ranking_' + l.semana, []));
    playSound('ranking');
    setTela('ranking');
    try {
      const user = await waitForAuthInit();
      if (user) {
        let dbRanking: any[] = [];
        if (type === 'week') {
          dbRanking = await getWeeklyRanking(l.semana);
        } else {
          dbRanking = await getSeasonRanking(l.trimestre);
        }
        setRanking(dbRanking);
        if (type === 'week') {
           ss('ranking_' + l.semana, dbRanking);
           setProg((prev: any) => ({ ...prev, pos: calcPos(dbRanking, jogador?.id, prev.xp || 0) }));
        }
      }
    } catch(e) {
      console.error(e);
    }
  };

  const handleChangeLicao = async (newLicao: any) => {
    ss('licao_atual', newLicao);
    setLicao(newLicao);

    let p = gs(semKey(newLicao), PROG0);
    let r = gs('ranking_' + newLicao.semana, []);

    setRanking(r);
    setProg({ ...p, pos: calcPos(r, jogador.id, p.xp || 0) });

    try {
      const user = await waitForAuthInit();
      if (user) {
        const dbRanking = await getWeeklyRanking(newLicao.semana);
        r = dbRanking;
        setRanking(r);

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

  const handleLogoTap = () => {
    const n = logoTaps + 1;
    setLogoTaps(n);
    if (n >= 7) {
      setLogoTaps(0);
      setTela('admin');
    }
  };

  const handleSaveStudy = async (nota: string, hl: any) => {
    const l = licao || getActiveLicao(jogador?.track);
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
        await saveProgress(np, l.semana, jogador.id, jogador.nome, jogador.avatar, l.trimestre, !!jogador.isAdmin, !!jogador.isGuest, !!jogador.isProfessor);
      }
    } catch(e) {
      console.error(e);
      setInAppNotif({ title: '⚠️ Progresso não sincronizado', body: 'Seu progresso foi salvo localmente, mas não chegou à nuvem. Verifique sua conexão.', id: Date.now() });
    }
  };

  const handleUpdateConfig = async (novoJ: any) => {
    setJogador(novoJ);
    ss('jogador', novoJ);

    try {
      const user = await waitForAuthInit();
      if (user) await saveUser(novoJ);
    } catch(e) {
      console.error(e);
      alert('Erro ao salvar perfil. Verifique sua conexão e tente novamente.');
      return;
    }

    try {
      const user = await waitForAuthInit();
      if (user) {
        const l = licao || getActiveLicao(novoJ.track);
        await saveProgress(prog, l.semana, novoJ.id, novoJ.nome, novoJ.avatar, l.trimestre, !!novoJ.isAdmin, !!novoJ.isGuest, !!novoJ.isProfessor);
      }
    } catch(e) { console.error(e); }

    let r = [...ranking];
    const idx = r.findIndex(x => x.id === novoJ.id);
    if (idx !== -1) {
      r[idx].nome = novoJ.nome;
      r[idx].avatar = novoJ.avatar;
      ss('ranking_' + licao.semana, r);
      setRanking(r);
    }
    setTela('home');
  };

  if (tela === 'splash') return <Splash />;
  if (tela === 'login') return <Login onLogin={handleLogin} />;
  if (!jogador || !licao) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100dvh',color:'#B9ACE6'}}>Carregando...</div>;

  return (
    <>
      {tela === 'home' && <Home jogador={jogador} licao={licao} prog={prog} onEstudo={(d: any) => { setDiaAtual(d); setTela('estudo'); getDayOverride(licao.semana, d.id).then(ov => { if (ov) setDiaAtual((cur: any) => (cur && cur.id === d.id) ? { ...cur, ...ov } : cur); }).catch(() => {}); }} onRanking={() => loadLatestRanking('week')} onRankingSemana={async (l: any) => { if (l.semana !== licao.semana) await handleChangeLicao(l); loadLatestRanking('week', l); }} onConfig={() => setTela('config')} onChangeLicao={handleChangeLicao} />}
      {tela === 'estudo' && diaAtual && <Estudo dia={diaAtual} prog={prog} jogador={jogador} semana={licao.semana} activePair={activePair} myGroups={myGroups} onSaveStudy={handleSaveStudy} onDayUpdated={(d: any) => setDiaAtual(d)} onQuiz={() => setTela('quiz')} onBack={() => setTela('home')} />}
      {tela === 'quiz' && diaAtual && <Quiz dia={diaAtual} onDone={handleDoneQuiz} onBack={() => setTela('estudo')} />}
      {tela === 'resultado' && resultado && <Resultado res={resultado} dia={diaAtual} prog={prog} onRanking={() => loadLatestRanking('week')} onHome={() => setTela('home')} />}
      {tela === 'ranking' && <Ranking jogador={jogador} ranking={ranking} prog={prog} type={rankingType} onChangeType={loadLatestRanking} onBack={() => setTela('home')} licao={licao} />}
      {tela === 'admin' && <Admin licao={licao} jogador={jogador} onBack={() => setTela('home')} onSorteador={() => setTela('sorteador')} />}
      {tela === 'config' && <Config jogador={jogador} onSave={handleUpdateConfig} onBack={() => setTela('home')} onLogout={handleLogout} theme={theme} onThemeChange={setTheme} />}
      {tela === 'sorteador' && <Sorteador licao={licao} jogador={jogador} onBack={() => setTela('home')} />}
      {tela === 'dupla' && <Dupla jogador={jogador} licao={licao} activePair={activePair} pendingInvite={pendingInvite} onPairChange={setActivePair} onClearPending={clearPendingInvite} onBack={() => setTela('home')} onSwitchToGroup={() => setTela('grupo')} />}
      {tela === 'grupo' && <Grupo jogador={jogador} licao={licao} pendingGroupInvite={pendingGroupInvite} onClearPendingGroupInvite={clearPendingGroupInvite} onBack={() => setTela('home')} onSwitchToPair={() => setTela('dupla')} />}
      {tela === 'home' && <div onClick={handleLogoTap} style={{position:'fixed',top:0,left:0,width:55,height:55,zIndex:500,opacity:0,cursor:'default'}} />}

      {!['splash', 'login', 'quiz'].includes(tela) && !(tela === 'config' && !jogador.locationId) && (
        <BottomNav
          active={tela}
          jogador={jogador}
          diaAtual={diaAtual}
          onHome={() => setTela('home')}
          onRanking={() => loadLatestRanking('week')}
          onEstudo={() => setTela('estudo')}
          onConfig={() => setTela('config')}
          onAdmin={() => setTela('admin')}
          onSorteador={() => setTela('sorteador')}
          onDupla={() => setTela('dupla')}
          onMais={shareApp}
        />
      )}

      {showNotifPrompt && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--card)', border: '1px solid var(--hdr-border)',
          borderRadius: 16, padding: '16px 20px',
          zIndex: 9998, boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column', gap: 12,
          minWidth: 300, maxWidth: '90%',
          animation: 'fadeInDown 0.4s ease-out forwards'
        }}>
          <div style={{fontSize: 14, fontWeight: 800, color: 'var(--gold)', fontFamily:'Poppins,sans-serif'}}>
            🔔 Ativar notificações?
          </div>
          <div style={{fontSize: 13, color: 'var(--txt2)', lineHeight: 1.4}}>
            Receba lembretes de estudo e avisos importantes da sua turma.
          </div>
          <div style={{display: 'flex', gap: 10}}>
            <button onClick={handleNotifAccept} className="btn btn-primary" style={{flex:1, padding:'10px', fontSize:13}}>
              Ativar
            </button>
            <button onClick={handleNotifDismiss} className="btn btn-ghost" style={{flex:1, padding:'10px', fontSize:13, color:'var(--mut)'}}>
              Agora não
            </button>
          </div>
        </div>
      )}

      {inAppNotif && (
        <div style={{
           position: 'fixed',
           top: 20,
           left: '50%',
           transform: 'translateX(-50%)',
           background: 'var(--notif-bg)',
           border: '1px solid var(--notif-border)',
           padding: '16px 20px',
           borderRadius: 16,
           zIndex: 9999,
           boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
           display: 'flex',
           flexDirection: 'column',
           minWidth: 300,
           maxWidth: '90%',
           animation: 'fadeInDown 0.4s ease-out forwards'
        }}>
           <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
              <div>
                 <div style={{fontSize: 14, fontWeight: 800, color: 'var(--gold)', marginBottom: 4, fontFamily:'Poppins,sans-serif'}}>{inAppNotif.title}</div>
                 <div style={{fontSize: 13, color: 'var(--txt2)', lineHeight: 1.4}}>{inAppNotif.body}</div>
              </div>
              <button
                onClick={() => setInAppNotif(null)}
                style={{background:'none', border:'none', color:'var(--mut)', fontSize: 18, cursor:'pointer', padding: '0 0 0 12px'}}
              >
                ✕
              </button>
           </div>
        </div>
      )}
    </>
  );
}
