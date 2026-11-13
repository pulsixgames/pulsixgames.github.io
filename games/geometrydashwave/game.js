(() => {
  const GAME_NAME = 'Level 67';
  const BUILD_URL = 'Build';
  const DATA_FILE = 'game.data.br';
  const WASM_FILE = 'game.wasm.br';
  const DATA_PARTS = 8;
  const WASM_PARTS = 6;
  const NO_DATA = 'no data';
  const DEFAULT_SAVE = JSON.stringify([JSON.stringify({ collectedStars: [] })]);

  let gameReady = false;
  let gamePaused = false;
  let unityInstance = null;
  let startPromise = null;

  const canvas = document.querySelector('#unity-canvas');
  const loadingCover = document.querySelector('#loading-cover');
  const progressBar = document.querySelector('#unity-progress-bar-full');
  const loadingMessage = document.querySelector('#loading-message');

  function sendToGame(method, arg) {
    if (!unityInstance) return;
    try {
      if (arg === undefined) unityInstance.SendMessage('YG2Instance', method);
      else unityInstance.SendMessage('YG2Instance', method, arg);
    } catch (error) {}
  }

  function environmentData() {
    const ua = navigator.userAgent;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
    const isTablet = /iPad|Tablet/i.test(ua);
    return JSON.stringify({
      language: (navigator.language || 'en').slice(0, 2),
      domain: location.hostname || 'localhost',
      deviceType: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop',
      isMobile,
      isDesktop: !isMobile && !isTablet,
      isTablet,
      isTV: false,
      appID: '0',
      browserLang: navigator.language || 'en',
      payload: new URLSearchParams(location.search).get('payload') || '',
      platform: navigator.platform || '',
      browser: navigator.userAgent || 'Other',
    });
  }

  function focusGame() {
    if (!gamePaused) canvas.focus({ preventScroll: true });
  }

  function setVisibility(visible) {
    if (!gameReady) return;
    sendToGame('SetFocusWindowGame', visible ? 'true' : 'false');
  }

  function setProgress(percent) {
    progressBar.style.width = `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
  }

  async function fetchParts(filename, count, startPercent, endPercent, mimeType) {
    const chunks = [];
    const step = (endPercent - startPercent) / count;

    for (let index = 0; index < count; index += 1) {
      const url = `${BUILD_URL}/${filename}.part${index}`;
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Missing file: ${url}`);
      chunks.push(new Uint8Array(await response.arrayBuffer()));
      setProgress(startPercent + step * (index + 1));
    }

    const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const merged = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    return URL.createObjectURL(new Blob([merged], { type: mimeType }));
  }

  const ysdk = {
    environment: {
      i18n: { lang: 'en', tld: 'com' },
      app: { id: '0' },
      browser: { lang: 'en' },
      payload: '',
    },
    deviceInfo: {
      type: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
      isMobile: () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
      isDesktop: () => !/iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
      isTablet: () => /iPad|Tablet/i.test(navigator.userAgent),
      isTV: () => false,
    },
    screen: { fullscreen: { status: 'off', request: () => {}, exit: () => {} } },
    adv: {
      showFullscreenAdv: options => options?.callbacks?.onClose?.(true),
      showRewardedVideo: options => {
        options?.callbacks?.onRewarded?.();
        options?.callbacks?.onClose?.();
      },
      showBannerAdv: () => Promise.resolve({ stickyAdvIsShowing: false }),
      hideBannerAdv: () => Promise.resolve(),
      getBannerAdvStatus: () => Promise.resolve({ stickyAdvIsShowing: false }),
    },
    auth: { openAuthDialog: () => Promise.resolve() },
    features: {
      LoadingAPI: { ready: () => {} },
      GameplayAPI: { start: () => {}, stop: () => {} },
      GamesAPI: { getAllGames: () => Promise.resolve([]) },
    },
    leaderboards: {
      getDescription: () => Promise.resolve({ default: false, description: { type: 'numeric' } }),
      getEntries: () => Promise.resolve({ entries: [] }),
      setScore: () => Promise.resolve(),
    },
    getPlayer: () => Promise.resolve({
      isAuthorized: () => false,
      getName: () => '',
      getUniqueID: () => 'unauthorized',
      getPhoto: () => NO_DATA,
      getPayingStatus: () => 'unknown',
      getData: () => Promise.resolve({}),
      setData: () => Promise.resolve(),
      getStats: () => Promise.resolve({}),
      setStats: () => Promise.resolve(),
      incrementStats: () => Promise.resolve(),
    }),
    getPayments: () => Promise.reject(new Error('payments unavailable')),
    getFlags: () => Promise.resolve({}),
    serverTime: () => Date.now(),
    on: () => {},
  };

  Object.assign(window, {
    ysdk,
    initYSDK: true,
    initGame: false,
    isVisibility: true,
    isPausedGame: false,
    nowFullAdOpen: false,
    cloudSaves: NO_DATA,
    environmentData: NO_DATA,
    playerData: NO_DATA,
    statsSaves: NO_DATA,
    paymentsData: NO_DATA,
    allGamesData: NO_DATA,
    flasgsData: NO_DATA,
    LogStyledMessage: message => console.log(`[${GAME_NAME}] ${message}`),
    InitGame: () => {
      gameReady = true;
      window.initGame = true;
      setTimeout(() => sendToGame('SetPauseGame', gamePaused ? 'true' : 'false'), 100);
    },
    FocusGame: focusGame,
    SetVisibility: setVisibility,
    SaveCloud: () => {},
    LoadCloud: () => {
      sendToGame('SetLoadSaves', DEFAULT_SAVE);
      return Promise.resolve(DEFAULT_SAVE);
    },
    RewardedAdvShow: id => {
      sendToGame('OpenRewardedAdv');
      sendToGame('RewardAdv', id);
      sendToGame('CloseRewardedAdv');
      focusGame();
    },
    InterAdvShow: () => {
      sendToGame('OpenInterAdv');
      sendToGame('CloseInterAdv', 'true');
      focusGame();
    },
    GetStats: () => {
      sendToGame('ReceiveStats', NO_DATA);
      return Promise.resolve(NO_DATA);
    },
    SetStats: () => {},
    InitPayments: () => {
      sendToGame('PaymentsEntries', NO_DATA);
      return Promise.resolve(NO_DATA);
    },
    BuyPayments: id => {
      sendToGame('OnPurchaseFailed', id);
      focusGame();
    },
    ConsumePurchase: () => {},
    ConsumePurchases: () => {},
    GetAllGames: () => Promise.resolve(NO_DATA),
    SetLeaderboard: () => {},
    GetLeaderboard: name => {
      sendToGame('LeaderboardEntries', JSON.stringify({
        technoName: name,
        isDefault: false,
        isInvertSortOrder: false,
        decimalOffset: 0,
        type: 'numeric',
        entries: NO_DATA,
        ranks: [],
        photos: [],
        names: [],
        scores: [],
        uniqueIDs: [],
        extraDataArray: [],
      }));
    },
    EntriesLB: () => ({}),
    RequestingEnvironmentData: () => {
      const data = environmentData();
      sendToGame('SetEnvirData', data);
      return Promise.resolve(data);
    },
    InitPlayer: () => {
      const data = JSON.stringify({
        auth: false,
        playerName: '',
        playerId: 'unauthorized',
        playerPhoto: NO_DATA,
        payingStatus: 'unknown',
      });
      sendToGame('SetAuth', data);
      return Promise.resolve(data);
    },
    OpenAuthDialog: () => {},
  });

  function installInputGuards() {
    document.addEventListener('contextmenu', event => event.preventDefault());
    document.addEventListener('visibilitychange', () => setVisibility(!document.hidden));
    window.addEventListener('blur', () => setVisibility(false));
    window.addEventListener('focus', () => setVisibility(true));
    window.addEventListener('pointerdown', () => {
      focusGame();
      setVisibility(true);
    });
    document.body.addEventListener('touchmove', event => event.preventDefault(), { passive: false });
  }

  async function startGame() {
    if (startPromise) return startPromise;

    startPromise = (async () => {
      installInputGuards();
      setProgress(2);
      loadingMessage.textContent = 'Loading game files...';

      const [dataUrl, wasmUrl] = await Promise.all([
        fetchParts(DATA_FILE, DATA_PARTS, 2, 50, 'application/octet-stream'),
        fetchParts(WASM_FILE, WASM_PARTS, 50, 88, 'application/wasm'),
      ]);

      setProgress(92);
      loadingMessage.textContent = 'Starting...';

      await new Promise((resolve, reject) => {
        const loader = document.createElement('script');
        loader.src = `${BUILD_URL}/game.loader.js`;
        loader.onload = resolve;
        loader.onerror = () => reject(new Error('Missing file: Build/game.loader.js'));
        document.body.appendChild(loader);
      });

      const instance = await createUnityInstance(canvas, {
        dataUrl,
        frameworkUrl: `${BUILD_URL}/game.framework.js`,
        codeUrl: wasmUrl,
        streamingAssetsUrl: 'StreamingAssets',
        companyName: 'Level 67',
        productName: 'Level 67',
        productVersion: '1.0',
      }, progress => setProgress(92 + progress * 8));

      unityInstance = instance;
      window.ygGameInstance = instance;
      loadingCover.classList.add('hidden');
      setProgress(100);

      setTimeout(() => sendToGame('InitSDKComplete'), 300);
      setTimeout(() => {
        sendToGame('SetEnvirData', environmentData());
        window.InitPlayer();
        sendToGame('SetLoadSaves', DEFAULT_SAVE);
        sendToGame('ReceiveStats', NO_DATA);
        sendToGame('PaymentsEntries', NO_DATA);
      }, 600);

      focusGame();
      return instance;
    })().catch(error => {
      console.error(error);
      loadingMessage.textContent = 'The game could not start. Please refresh the page.';
      throw error;
    });

    return startPromise;
  }

  startGame();
})();
