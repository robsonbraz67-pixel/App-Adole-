import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getTrackLessons } from './data';
import { gs, ss, calcPos, PROG0, playSound, getRecencyMult, scheduleStudyReminder, shareApp, aggregateWeekRanking, aggregateSeasonRanking, mergeLiveWeek, buildPairWeekRanking, buildPairSeasonRanking } from './utils';
import { listenToUserNotifications, waitForAuthInit, getProgress, getUser, saveUser, saveProgress, saveStudyNote, logout, getDayOverride, getActivePair, getPairInvite, getMyGroups, getGroupInvite, getFriendStreakInvite, listenToWeekProgress, listenToPairRoster, getSeasonProgress } from './firebase';
import { Splash, Login, Home, Estudo, Quiz, Resultado, Ranking, Admin, Config, BottomNav, Sorteador, Dupla, Grupo, Amigos } from './components';

const CACHE_VERSION = '3T2026';

const clearStaleCache = () => {
  if (localStorage.getItem('cacheVersion') === CACHE_VERSION) return;
  Object.keys(localStorage)
    .filter(k => k.startsWith('prog_') || k.startsWith('ranking_') || k.startsWith('rankrows_'))
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
  // Rankings ao vivo: weekRows chega por assinatura do Firestore e pairRoster
  // idem; seasonRows é lido sob demanda ao abrir a Campanha (13× mais docs).
  // A lista exibida é DERIVADA disso — não há estado de ranking para desatualizar.
  const [weekRows, setWeekRows] = useState<any[]>([]);
  const [pairRoster, setPairRoster] = useState<any[]>([]);
  const [seasonRows, setSeasonRows] = useState<any[]>([]);
  const [seasonTrimestre, setSeasonTrimestre] = useState('');
  const [seasonLoading, setSeasonLoading] = useState(false);
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
  const [pendingFriendInvite, setPendingFriendInvite] = useState<any>(null);

  // Deep links ?dupla=<id> / ?grupo=<id> / ?amigo=<id>: guarda e limpa da URL (sobrevive ao login)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pairParam = params.get('dupla');
    const groupParam = params.get('grupo');
    const friendParam = params.get('amigo');
    if (pairParam) localStorage.setItem('pendingPairInvite', pairParam);
    if (groupParam) localStorage.setItem('pendingGroupInvite', groupParam);
    if (friendParam) localStorage.setItem('pendingFriendInvite', friendParam);
    if (pairParam || groupParam || friendParam) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  // Carrega a dupla ativa e os grupos quando há usuário matriculado
  useEffect(() => {
    if (!jogador?.id || !jogador?.locationId) { setActivePair(null); setMyGroups([]); return; }
    getActivePair(jogador.id).then(setActivePair).catch(() => {});
    getMyGroups(jogador.id).then(setMyGroups).catch(() => {});
  }, [jogador?.id, jogador?.locationId]);

  // ===== Assinatura ao vivo do progresso da semana =====
  // Base do ranking da semana e do de duplas. Enquanto a tela estiver aberta,
  // qualquer quiz concluído por qualquer pessoa aparece sem precisar recarregar.
  useEffect(() => {
    if (!jogador?.id || !licao?.semana || licao.isComingSoon) return;
    setWeekRows(gs('rankrows_' + licao.semana, []));
    let cancelado = false;
    let unsub: (() => void) | null = null;
    waitForAuthInit().then(user => {
      if (!user || cancelado) return;
      unsub = listenToWeekProgress(licao.semana, rows => {
        const linhas = aggregateWeekRanking(rows);
        setWeekRows(linhas);
        ss('rankrows_' + licao.semana, linhas);
      });
    }).catch(e => console.error('assinatura da semana', e));
    return () => { cancelado = true; unsub?.(); };
  }, [jogador?.id, licao?.semana]);

  // Escalação das duplas do meu local, também ao vivo: dupla formada agora
  // entra no ranking na mesma hora (pairsPublic é escrito junto com pairs).
  useEffect(() => {
    if (!jogador?.id || !jogador?.locationId) { setPairRoster([]); return; }
    let cancelado = false;
    let unsub: (() => void) | null = null;
    waitForAuthInit().then(user => {
      if (!user || cancelado) return;
      unsub = listenToPairRoster(jogador.locationId, jogador.track || 'teen', setPairRoster);
    }).catch(e => console.error('assinatura das duplas', e));
    return () => { cancelado = true; unsub?.(); };
  }, [jogador?.id, jogador?.locationId, jogador?.track]);

  // Minha posição na semana acompanha a assinatura
  useEffect(() => {
    if (!jogador?.id) return;
    setProg((prev: any) => ({ ...prev, pos: calcPos(weekRows, jogador.id, prev.xp || 0) }));
  }, [weekRows, jogador?.id]);

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

  // Resgata convite de ofensiva com amigos pendente (chegou por link) após login + matrícula
  useEffect(() => {
    const fid = localStorage.getItem('pendingFriendInvite');
    if (!fid || !jogador?.id || !jogador?.locationId) return;
    getFriendStreakInvite(fid).then(inv => {
      if (inv && inv.status === 'pending') { setPendingFriendInvite(inv); setTela('amigos'); }
      else localStorage.removeItem('pendingFriendInvite');
    }).catch(() => {});
  }, [jogador?.id, jogador?.locationId]);

  const clearPendingInvite = () => { localStorage.removeItem('pendingPairInvite'); setPendingInvite(null); };
  const clearPendingGroupInvite = () => { localStorage.removeItem('pendingGroupInvite'); setPendingGroupInvite(null); };
  const clearPendingFriendInvite = () => { localStorage.removeItem('pendingFriendInvite'); setPendingFriendInvite(null); };

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

  // Compatível com o cache antigo: teen (histórico de todos) mantém a chave
  // legada `prog_${semana}`; trilhas novas ganham a trilha na chave.
  const semKey = (l: any, track?: string) => 'prog_' + (track && track !== 'teen' ? track + '_' : '') + (l?.semana || 'w');

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

      if (unmounted) return;

      let hasLocation = !!j?.locationId;

      if (j) {
        setJogador(j);

        const initialTrack = j?.track || 'teen';
        let p = gs(semKey(l, initialTrack), PROG0);
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
            const track = dbUser?.track || initialTrack;
            const dbProg = await getProgress(j.id, l.semana, track);
            if (dbProg) {
              p = { xp: dbProg.xp, streak: dbProg.streak, done: dbProg.done || [], history: dbProg.history || {} };
              ss(semKey(l, track), p);
            } else if ((p.xp > 0 || (p.done?.length ?? 0) > 0) && dbUser) {
              saveProgress(p, l.semana, j.id, dbUser.nome || j.nome, dbUser.avatar || j.avatar, l.trimestre, track, !!dbUser.isAdmin, !!dbUser.isGuest, !!dbUser.isProfessor, dbUser.locationId).catch(console.error);
            }

            // Also sync previous lesson's local progress if it never reached Firestore
            if (dbUser) {
              const allVisible = (getTrackLessons(track) as any[]).filter((x: any) => !x.isAdminOnly);
              const curIdx = allVisible.findIndex((x: any) => x.semana === l.semana);
              if (curIdx > 0) {
                const prevL = allVisible[curIdx - 1];
                const prevLocal = gs(semKey(prevL, track), null);
                if (prevLocal && (prevLocal.xp > 0 || (prevLocal.done?.length ?? 0) > 0)) {
                  getProgress(j.id, prevL.semana, track).then(prevDb => {
                    if (!prevDb) saveProgress(prevLocal, prevL.semana, j.id, dbUser.nome || j.nome, dbUser.avatar || j.avatar, prevL.trimestre, track, !!dbUser.isAdmin, !!dbUser.isGuest, !!dbUser.isProfessor, dbUser.locationId).catch(console.error);
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
        // pos é recalculada pela assinatura da semana assim que ela chega
        setProg({ ...p, pos: calcPos(weekRows, j.id, p.xp || 0) });
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

    let p = gs(semKey(l, j?.track), PROG0);

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

      const dbProg = await getProgress(j.id, l.semana, j?.track || 'teen');
      if (dbProg) {
        p = { xp: dbProg.xp, streak: dbProg.streak, done: dbProg.done || [], history: dbProg.history || {} };
        ss(semKey(l, j?.track), p);
      }
    } catch(e) {
      console.error("Error saving user profile or loading progress:", e);
    }
    setJogador(j);

    setProg({ ...p, pos: calcPos(weekRows, j.id, p.xp || 0) });
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

    // Sem remendo otimista na lista: o save dispara a assinatura e o ranking
    // de todo mundo (inclusive o meu) chega atualizado em seguida.
    ss(semKey(l, jogador?.track), np);
    setProg({ ...np, pos: calcPos(weekRows, jogador.id, novoXP) });

    // Mostra o resultado imediatamente; sync com a nuvem roda em segundo plano
    setTela('resultado');

    (async () => {
      try {
         const user = await waitForAuthInit();
         if (user) {
            await saveProgress(np, l.semana, jogador.id, jogador.nome, jogador.avatar, l.trimestre, jogador?.track || 'teen', !!jogador.isAdmin, !!jogador.isGuest, !!jogador.isProfessor, jogador.locationId);
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

  // Campanha: leitura sob demanda, memorizada por temporada. Trocar entre
  // Minha Trilha / Meu Local / Geral / Duplas não custa leitura nenhuma —
  // os quatro saem do mesmo conjunto de linhas.
  const loadSeason = async (trimestre: string, forcar = false) => {
    if (!trimestre) return;
    if (!forcar && seasonTrimestre === trimestre) return;
    setSeasonLoading(true);
    try {
      const user = await waitForAuthInit();
      if (user) {
        setSeasonRows(await getSeasonProgress(trimestre));
        setSeasonTrimestre(trimestre);
      }
    } catch (e) {
      console.error('carregar campanha', e);
    }
    setSeasonLoading(false);
  };

  const loadLatestRanking = (type: string = 'week', licaoArg?: any) => {
    setRankingType(type);
    const l = licaoArg || licao || getActiveLicao(jogador?.track);
    playSound('ranking');
    setTela('ranking');
    // Semana e Duplas/Semana já estão assinadas; só a campanha precisa buscar.
    if (type !== 'week' && type !== 'duplasSemana') loadSeason(l.trimestre);
  };

  // Minha dupla entra na escalação mesmo antes do backfill espelhar duplas
  // antigas em pairsPublic — quem formou a dupla nunca fica de fora.
  const rosterComMinha = useMemo(() => {
    if (!activePair?.userA || !activePair?.userB) return pairRoster;
    if (pairRoster.some((p: any) => p.id === activePair.id)) return pairRoster;
    return [...pairRoster, {
      id: activePair.id,
      aId: activePair.userA, aNome: activePair.userAName, aAvatar: activePair.userAAvatar,
      bId: activePair.userB, bNome: activePair.userBName, bAvatar: activePair.userBAvatar,
    }];
  }, [pairRoster, activePair]);

  // A lista exibida é sempre derivada das linhas ao vivo — nada de estado
  // paralelo que possa ficar velho. A semana corrente é sobreposta às linhas da
  // campanha, então o total acumulado também reflete o quiz de agora há pouco.
  const ranking = useMemo(() => {
    const semana = licao?.semana;
    const meuLocal = jogador?.locationId;
    const minhaTrilha = jogador?.track || 'teen';
    if (rankingType === 'week') return weekRows;
    if (rankingType === 'duplasSemana') return buildPairWeekRanking(rosterComMinha, weekRows);
    const campanha = mergeLiveWeek(seasonRows, weekRows, semana, licao?.trimestre);
    switch (rankingType) {
      case 'trilha': return aggregateSeasonRanking(campanha, { locationId: meuLocal, track: minhaTrilha });
      case 'geral': return aggregateSeasonRanking(campanha, { locationId: meuLocal });
      case 'duplasCampanha': return buildPairSeasonRanking(rosterComMinha, campanha);
      default: return aggregateSeasonRanking(campanha);
    }
  }, [rankingType, weekRows, seasonRows, rosterComMinha, licao?.semana, licao?.trimestre, jogador?.locationId, jogador?.track]);

  const handleChangeLicao = async (newLicao: any, trackOverride?: string) => {
    ss('licao_atual', newLicao);
    setLicao(newLicao);
    const track = trackOverride || jogador?.track || 'teen';

    let p = gs(semKey(newLicao, track), PROG0);

    setProg({ ...p, pos: calcPos(weekRows, jogador.id, p.xp || 0) });

    try {
      const user = await waitForAuthInit();
      if (user) {
        const dbProg = await getProgress(jogador.id, newLicao.semana, track);
        if (dbProg) {
          p = { xp: dbProg.xp, streak: dbProg.streak, done: dbProg.done || [], history: dbProg.history || {} };
          ss(semKey(newLicao, track), p);
        }

        setProg({ ...p, pos: calcPos(weekRows, jogador.id, p.xp || 0) });
      }
    } catch(e) {
      console.error(e);
    }
  };

  // Admin/professor podem alternar a própria trilha livremente (uso próprio:
  // testar/acompanhar outras trilhas). Diferente de handleUpdateConfig — aqui
  // o progresso/ranking em tela são recarregados para a trilha nova, em vez
  // de salvar o progresso da trilha antiga sob a chave da trilha nova.
  const handleSwitchTrack = async (newTrack: string) => {
    if (!jogador || (!jogador.isAdmin && !jogador.isProfessor) || newTrack === jogador.track) return;
    const novoJ = { ...jogador, track: newTrack };
    try {
      const user = await waitForAuthInit();
      if (user) await saveUser(novoJ);
    } catch (e) {
      console.error(e);
      alert('Erro ao trocar de trilha. Verifique sua conexão e tente novamente.');
      return;
    }
    setJogador(novoJ);
    ss('jogador', novoJ);
    await handleChangeLicao(getActiveLicao(newTrack), newTrack);
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
    // nota/hl ficam no state/localStorage (device-local, ok); no Firestore vão
    // para studyNotes (privado). saveProgress já remove nota/hl do progress público.
    const np = {
      ...prog,
      history: { ...prog.history, [diaAtual.id]: { ...diaHist, nota, hl } }
    };
    ss(semKey(l, jogador?.track), np);
    setProg(np);
    try {
      const user = await waitForAuthInit();
      if (user) {
        await saveProgress(np, l.semana, jogador.id, jogador.nome, jogador.avatar, l.trimestre, jogador?.track || 'teen', !!jogador.isAdmin, !!jogador.isGuest, !!jogador.isProfessor, jogador.locationId);
        await saveStudyNote(jogador.id, l.semana, jogador?.track || 'teen', diaAtual.id, nota, hl);
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
        // Recalcula a lição ativa se a trilha mudou nesse save (ex: 1º cadastro
        // escolhendo a trilha) — senão `licao` ficaria com a trilha antiga/placeholder.
        const trackChanged = (jogador?.track || 'teen') !== (novoJ.track || 'teen');
        const l = (!trackChanged && licao) || getActiveLicao(novoJ.track);
        await saveProgress(prog, l.semana, novoJ.id, novoJ.nome, novoJ.avatar, l.trimestre, novoJ.track || 'teen', !!novoJ.isAdmin, !!novoJ.isGuest, !!novoJ.isProfessor, novoJ.locationId);
      }
    } catch(e) { console.error(e); }

    setTela('home');
  };

  if (tela === 'splash') return <Splash />;
  if (tela === 'login') return <Login onLogin={handleLogin} />;
  if (!jogador || !licao) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100dvh',color:'#B9ACE6'}}>Carregando...</div>;

  return (
    <>
      {tela === 'home' && <Home jogador={jogador} licao={licao} prog={prog} onEstudo={(d: any) => { setDiaAtual(d); setTela('estudo'); getDayOverride(jogador?.track || 'teen', licao.semana, d.id).then(ov => { if (ov) setDiaAtual((cur: any) => (cur && cur.id === d.id) ? { ...cur, ...ov } : cur); }).catch(() => {}); }} onRanking={() => loadLatestRanking('week')} onRankingSemana={async (l: any) => { if (l.semana !== licao.semana) await handleChangeLicao(l); loadLatestRanking('week', l); }} onConfig={() => setTela('config')} onChangeLicao={handleChangeLicao} />}
      {tela === 'estudo' && diaAtual && <Estudo dia={diaAtual} prog={prog} jogador={jogador} semana={licao.semana} activePair={activePair} myGroups={myGroups} onSaveStudy={handleSaveStudy} onDayUpdated={(d: any) => setDiaAtual(d)} onQuiz={() => setTela('quiz')} onBack={() => setTela('home')} />}
      {tela === 'quiz' && diaAtual && <Quiz dia={diaAtual} onDone={handleDoneQuiz} onBack={() => setTela('estudo')} />}
      {tela === 'resultado' && resultado && <Resultado res={resultado} dia={diaAtual} prog={prog} onRanking={() => loadLatestRanking('week')} onHome={() => setTela('home')} />}
      {tela === 'ranking' && <Ranking jogador={jogador} ranking={ranking} prog={prog} type={rankingType} onChangeType={loadLatestRanking} onBack={() => setTela('home')} licao={licao} rankingLoading={seasonLoading} onRefresh={() => loadSeason(licao.trimestre, true)} />}
      {tela === 'admin' && <Admin licao={licao} jogador={jogador} onBack={() => setTela('home')} onSorteador={() => setTela('sorteador')} />}
      {tela === 'config' && <Config jogador={jogador} onSave={handleUpdateConfig} onSwitchTrack={handleSwitchTrack} onBack={() => setTela('home')} onLogout={handleLogout} theme={theme} onThemeChange={setTheme} />}
      {tela === 'sorteador' && <Sorteador licao={licao} jogador={jogador} onBack={() => setTela('home')} />}
      {tela === 'dupla' && <Dupla jogador={jogador} licao={licao} prog={prog} activePair={activePair} pendingInvite={pendingInvite} onPairChange={setActivePair} onClearPending={clearPendingInvite} onBack={() => setTela('home')} onSwitchToGroup={() => setTela('grupo')} onSwitchToFriends={() => setTela('amigos')} onRankingDuplas={() => loadLatestRanking('duplasSemana')} />}
      {tela === 'grupo' && <Grupo jogador={jogador} licao={licao} pendingGroupInvite={pendingGroupInvite} onClearPendingGroupInvite={clearPendingGroupInvite} onBack={() => setTela('home')} onSwitchToPair={() => setTela('dupla')} onSwitchToFriends={() => setTela('amigos')} />}
      {tela === 'amigos' && <Amigos jogador={jogador} licao={licao} pendingFriendInvite={pendingFriendInvite} onClearPendingFriendInvite={clearPendingFriendInvite} onBack={() => setTela('home')} onSwitchToPair={() => setTela('dupla')} onSwitchToGroup={() => setTela('grupo')} />}
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
