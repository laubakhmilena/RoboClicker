// Yandex Games SDK state
let ysdk = null;
let sdkReady = false;
let player = null;
let isAuthorized = false;
let gameLoadedNotified = false;
let gameplayStarted = false;
let isAdShowing = false;
let isGamePaused = false;
let sdkInitPromise = null;
let appHooks = {
	onSDKReady: () => {},
	onExternalPause: () => {},
	onExternalResume: () => {},
	onPlatformLanguage: () => {},
};

function setAppHooks(nextHooks = {}) {
	appHooks = { ...appHooks, ...nextHooks };
}

function safeCall(fnName, ...args) {
	try {
		const fn = appHooks[fnName];
		if (typeof fn === 'function') fn(...args);
	} catch (error) {
		console.warn(`[Robo Clicker] Hook ${fnName} failed`, error);
	}
}

function markGameplayStart() {
	if (!sdkReady || !ysdk?.features?.GameplayAPI || gameplayStarted) return;
	if (typeof ysdk.features.GameplayAPI.start !== 'function') return;
	try {
		ysdk.features.GameplayAPI.start();
		gameplayStarted = true;
	} catch (error) {
		console.warn('[Robo Clicker] GameplayAPI.start failed', error);
	}
}

function markGameplayStop() {
	if (!sdkReady || !ysdk?.features?.GameplayAPI || !gameplayStarted) return;
	if (typeof ysdk.features.GameplayAPI.stop !== 'function') return;
	try {
		ysdk.features.GameplayAPI.stop();
		gameplayStarted = false;
	} catch (error) {
		console.warn('[Robo Clicker] GameplayAPI.stop failed', error);
	}
}

function notifyLoadingReady() {
	if (gameLoadedNotified || !sdkReady) return;
	try {
		ysdk?.features?.LoadingAPI?.ready?.();
		gameLoadedNotified = true;
	} catch (error) {
		console.warn('[Robo Clicker] LoadingAPI.ready failed', error);
	}
}

async function initSDK() {
	if (sdkReady) return ysdk;
	if (sdkInitPromise) return sdkInitPromise;
	if (!window.YaGames || typeof window.YaGames.init !== 'function') {
		console.info('[Robo Clicker] YaGames SDK not available, using local mode');
		return null;
	}

	sdkInitPromise = (async () => {
		try {
		ysdk = await window.YaGames.init();
		sdkReady = true;
		const platformLang = ysdk?.environment?.i18n?.lang || 'ru';
		safeCall('onPlatformLanguage', platformLang);

		try {
			player = await ysdk.getPlayer({ scopes: false });
			isAuthorized = Boolean(player && (player.getMode?.() === 'real' || player.getUniqueID?.()));
		} catch (_error) {
			player = null;
			isAuthorized = false;
		}
		if (typeof ysdk.on === 'function') {
			ysdk.on('game_api_pause', () => {
			isGamePaused = true;
			markGameplayStop();
			safeCall('onExternalPause');
		});
			ysdk.on('game_api_resume', () => {
			isGamePaused = false;
			safeCall('onExternalResume');
		});
		}

		safeCall('onSDKReady', ysdk);
		notifyLoadingReady();
		return ysdk;
		} catch (error) {
		console.warn('[Robo Clicker] SDK init failed, using local mode', error);
		return null;
		} finally {
			sdkInitPromise = null;
		}
	})();
	return sdkInitPromise;
}

window.initSDK = initSDK;

// 1. DOM

// Ждем загрузки всей страницы
document.addEventListener('DOMContentLoaded', () => {
	const menuScreen = document.getElementById('menu'); // Ссылки на наши экраны
	const aboutScreen = document.getElementById('about-modal');
	const settingsScreen = document.getElementById('settings');
	const skinsModal = document.getElementById('skins-modal');

	const startBtn = document.getElementById('start-btn'); // Кнопки начать игру
	const backBtn = document.getElementById('back-menu-btn'); // В меню
	const rewardFreeBoostBtn = document.getElementById('reward-free-boost-btn');
	const rewardRandomSkinBtn = document.getElementById('reward-random-skin-btn');

	const aboutBtn = document.getElementById('about-btn'); // Об игре
	const closeAbout = document.getElementById('close-about');
	const aboutGoBtn = document.getElementById('about-go-btn');

	const settingsBtn = document.getElementById('settings-btn'); // настройки
	const closeSetting = document.getElementById('close-settings');
	const closeSkinsBtn = document.getElementById('close-skins');
	const resetProgressBtn = document.getElementById('reset-progress-btn');
	const resetProgressLabel = resetProgressBtn ? resetProgressBtn.querySelector('.settings-restart-label') : null;
	const resetProgressOverlay = resetProgressBtn ? resetProgressBtn.querySelector('.settings-restart-progress') : null;

	const THEME_KEY = 'theme'; // тема
	const themeSelect = document.querySelector('.theme-select');

	const languageSelect = document.getElementById('language-select');
	const LANGUAGE_KEY = 'language';
	const LANGUAGE_USER_SELECTED_KEY = 'languageUserSelected';
	const SUPPORTED_LANGUAGES = ['ru', 'en'];
	let currentLanguage = 'ru';;

	const SCROLLABLE_UI_SELECTORS = [
		'.about-card',
		'.settings-card',
		'.skins-content',
		'.boosts-grid',
		'#boosts-active-list',
		'.achievements-content',
		'.stats-content',
	];

	function syncAppViewportHeight() {
		const viewportHeight = Math.max(
			320,
			Math.round(window.visualViewport?.height || window.innerHeight || 0)
		);
		document.documentElement.style.setProperty('--app-height', `${viewportHeight}px`);
	}

	function setupViewportScrollLock() {
		const SCROLLABLE_SELECTOR = SCROLLABLE_UI_SELECTORS.join(',');
		let lastTouchY = 0;

		const getAllowedScrollContainer = (target) => {
			if (!target || !(target instanceof Element)) return null;
			return target.closest(SCROLLABLE_SELECTOR);
		};

		const canScrollVertically = (element) => element && element.scrollHeight > element.clientHeight + 1;

		const shouldBlockDirectionalScroll = (element, deltaY) => {
			if (!canScrollVertically(element)) return true;
			if (deltaY < 0 && element.scrollTop <= 0) return true;
			if (deltaY > 0 && element.scrollTop + element.clientHeight >= element.scrollHeight - 1) return true;
			return false;
		};

		const onTouchStart = (event) => {
			lastTouchY = event.touches?.[0]?.clientY ?? 0;
		};

		const onTouchMove = (event) => {
			const touchY = event.touches?.[0]?.clientY;
			if (typeof touchY !== 'number') {
				event.preventDefault();
				return;
			}

			const scrollContainer = getAllowedScrollContainer(event.target);
			if (!scrollContainer) {
				event.preventDefault();
				return;
			}

			const deltaY = lastTouchY - touchY;
			lastTouchY = touchY;
			if (shouldBlockDirectionalScroll(scrollContainer, deltaY)) {
				event.preventDefault();
			}
		};

		const onWheel = (event) => {
			const scrollContainer = getAllowedScrollContainer(event.target);
			if (!scrollContainer) {
				event.preventDefault();
				return;
			}
			if (shouldBlockDirectionalScroll(scrollContainer, event.deltaY)) {
				event.preventDefault();
			}
		};

		document.addEventListener('touchstart', onTouchStart, { passive: true });
		document.addEventListener('touchmove', onTouchMove, { passive: false });
		document.addEventListener('wheel', onWheel, { passive: false });
		document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
	}

	// Единый словарь локализации интерфейса.
	// Русские значения сохранены как оригинальные формулировки проекта.
	const TRANSLATIONS = {
		ru: {
			gamename: 'Robo Clicker',
			'about-title': ' — это космическое приключение!',
			inginer: 'Ты — главный инженер секретной лаборатории будущего!',
			klik: '✨Кликай: Зарабатывай золото своими руками!',
			Upgrade: '⚙️Прокачивай: Увеличивай силу клика и покупай автоматических роботов.',
			Skin: '🎭Скины: Открывай новых уникальных героев за достижения.',
			Level: '🏆Уровни: Докажи, что ты лучший, повышая свой уровень инженера.',
			young: 'Создано специально для юных изобретателей!',
			'about-awaits': 'Что тебя ждёт:',
			Go: 'ПОЕХАЛИ!',
			settings: 'Настройки', language: '🌍 Язык', sound: '🔊 Звук', brightness: '☀️ Яркость', theme: '🌗 Тема',
			restart: 'Сбросить весь прогресс', welcome: 'Кликай, улучшай и собирай скины!', 'start-btn': 'Начать игру',
			'about-btn': 'Об игре', 'settings-btn': 'Настройки', gold: 'Золото', 'power-label': 'Сила клика', level: 'LVL {n}',
			'back-menu-btn': 'В меню', 'shop-title': 'МАГАЗИН', 'upgrade-click': 'Улучшить клик', 'robot-btn': 'Робот',
			'robot-info-default': '+1/сек • 0 куплено', 'skins-btn': 'Скины', 'boosts-btn': 'Бусты', 'achievements-btn': 'Достижения',
			'stats-btn': 'Статистика', 'skins-title': 'СКИНЫ', 'boosts-title': 'БУСТЫ', 'active-boosts': 'Активные бусты',
			'achievements-title': 'ДОСТИЖЕНИЯ', 'stats-title': 'СТАТИСТИКА', 'theme-dark': 'Темная', 'theme-light': 'Светлая', 'theme-auto': 'Авто',
			'reward-free-boost': 'Посмотреть рекламу и получить бесплатный буст', 'reward-random-skin': 'Посмотреть рекламу и открыть случайный скин',
		},
		en: {
			gamename: 'Robo Clicker',
			'about-title': ' is a space adventure!',
			inginer: 'You are the chief engineer of a secret laboratory of the future!',
			klik: '✨Click: Earn gold with your own hands!',
			Upgrade: '⚙️Upgrade: Increase click power and buy automatic robots.',
			Skin: '🎭Skins: Unlock unique heroes through achievements.',
			Level: '🏆Levels: Prove you are the best by leveling up your engineer rank.',
			young: 'Created especially for young inventors!',
			'about-awaits': 'What awaits you:',
			Go: "LET'S GO!",
			settings: 'Settings', language: '🌍 Language', sound: '🔊 Sound', brightness: '☀️ Brightness', theme: '🌗 Theme',
			restart: 'Reset all progress', welcome: 'Click, upgrade, and collect skins!', 'start-btn': 'Start game',
			'about-btn': 'About game', 'settings-btn': 'Settings', gold: 'Gold', 'power-label': 'Click power', level: 'LVL {n}',
			'back-menu-btn': 'To menu', 'shop-title': 'SHOP', 'upgrade-click': 'Upgrade click', 'robot-btn': 'Robot',
			'robot-info-default': '+1/sec • 0 bought', 'skins-btn': 'Skins', 'boosts-btn': 'Boosts', 'achievements-btn': 'Achievements',
			'stats-btn': 'Statistics', 'skins-title': 'SKINS', 'boosts-title': 'BOOSTS', 'active-boosts': 'Active boosts',
			'achievements-title': 'ACHIEVEMENTS', 'stats-title': 'STATISTICS', 'theme-dark': 'Dark', 'theme-light': 'Light', 'theme-auto': 'Auto',
			'reward-free-boost': 'Watch ad and get a free boost', 'reward-random-skin': 'Watch ad and unlock a random skin',
		}
	};

	function normalizeLanguage(language) {
		const normalized = String(language || '')
			.toLowerCase()
			.replace('_', '-')
			.split('-')[0];
		return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : 'ru';
	}

	function isLanguageManuallySelected() {
		return getStorageItem(LANGUAGE_USER_SELECTED_KEY) === '1';
	}

	function t(key, params = {}) {
		const langPack = TRANSLATIONS[currentLanguage] || TRANSLATIONS.ru;
		const raw = langPack[key] ?? TRANSLATIONS.ru[key] ?? key;
		return String(raw).replace(/\{(\w+)\}/g, (_, token) => (params[token] ?? `{${token}}`));
	}

	// Получение имени скина на активном языке.
	function getSkinNameById(skinId, fallbackName = '') {
		const enNames = {
			1: 'Classic Robot', 2: 'Workshop Mechanic', 3: 'Steel Guardian', 4: 'Moon Scout',
			5: 'Neon Courier', 6: 'Fire Prototype', 7: 'Frost Guardian', 8: 'Camouflage Tactician',
			9: 'Cyber Ninja', 10: 'Electro Warrior', 11: 'Space Raider', 12: 'Chrome Phantom',
			13: 'Dragon Mech', 14: 'Galactic Emperor', 15: 'Ghost Protocol', 16: 'Absolute Omega',
		};
		if (currentLanguage !== 'en') return fallbackName;
		return enNames[skinId] || fallbackName;
	}

	// Получение названия/описания буста на активном языке строго по утверждённому словарю.
	function getBoostText(boost, field) {
		if (currentLanguage !== 'en') return boost[field] || '';
		const en = {
			neon_overdrive: { name: 'Neon Overdrive', desc: 'x3 click power for 30 seconds' },
			offline_accelerator: { name: 'Offline Accelerator', desc: 'x5 offline income for 2 hours' },
			drone_army: { name: 'Drone Army', desc: 'x3 robot income for 90 seconds' },
			golden_storm: { name: 'Golden Storm', desc: '+150% coins per click for 40 seconds' },
			coin_burst: { name: 'Coin Burst', desc: 'Instantly gain 500 coins' },
			super_click: { name: 'Super Click', desc: 'Your next click is x25' },
			discount_protocol: { name: 'Discount Protocol', desc: 'Your next upgrade purchase costs 50% less' },
			offline_bonus: { name: 'Offline Bonus', desc: 'Grants 50% of offline income' },
			processor_plus: { name: 'Enhanced Processor', desc: '+1 click power' },
			eternal_generator: { name: 'Eternal Generator', desc: '+0.5 robot income' },
			evolution_module: { name: 'Evolution Module', desc: '+5% click power per level' },
			space_amplifier: { name: 'Space Amplifier', desc: '+10% to all income' },
			critical_overload: { name: 'Critical Overload', desc: '30% chance for x10 click power' },
			time_freeze: { name: 'Time Freeze', desc: 'Timers run at x0.5 speed for 30 seconds' },
			galactic_breakthrough: { name: 'Galactic Breakthrough', desc: 'Clicks x10 and robots x5' },
			omega_mode: { name: 'Omega Mode', desc: 'Clicks x20 for 20 seconds' },
		};
		return en[boost.id]?.[field] || boost[field] || '';
	}

	// Получение локализованного текста достижения строго по списку переводов.
	function getAchievementText(achievement, field) {
		if (currentLanguage !== 'en') return achievement[field] ?? '';
		const en = ACHIEVEMENT_EN_BY_ID[achievement.id];
		if (!en) return achievement[field] ?? '';
		if (field === 'name') return en.name;
		if (field === 'desc') return en.desc;
		if (field === 'bonus') return en.bonus ?? achievement.bonus ?? '';
		return achievement[field] ?? '';
	}

	function getAchievementSeriesText(series, step, field) {
		if (!series) return '';
		if (currentLanguage !== 'en') {
			if (field === 'name') return series.name || '';
			if (field === 'desc') return step?.desc || '';
			if (field === 'bonus') return step?.bonus || '';
			return '';
		}
		const firstStep = Array.isArray(series.steps) && series.steps.length > 0 ? series.steps[0] : null;
		const enName = firstStep ? getAchievementText(firstStep, 'name') : series.name;
		if (field === 'name') return enName || series.name || '';
		if (field === 'desc') return step ? getAchievementText(step, 'desc') : '';
		if (field === 'bonus') return step ? getAchievementText(step, 'bonus') : '';
		return '';
	}

		function updateLocalizedUI() {
			document.documentElement.lang = currentLanguage;

			document.querySelectorAll('[data-lang]').forEach((el) => {
			const key = el.dataset.lang;
			if (!key) return;

			if (el.id === 'level-text') {
				el.dataset.langTemplate = t('level');
			return;
			}

				el.textContent = t(key);
		});

		const staticMap = {
			'.about-wait .wait > p': { ru: 'Что тебя ждёт:', en: 'What awaits you:' },
			'.stats-title': { ru: 'СТАТИСТИКА', en: 'STATISTICS' },
			'#stats-basic-title': { ru: 'Основное', en: 'Main' },
			'#stats-upgrade-title': { ru: 'Прокачка', en: 'Upgrades' },
			'#stats-robots-title': { ru: 'Роботы', en: 'Robots' },
			'#stats-skins-title': { ru: 'Скины', en: 'Skins' },
			'#stats-boosts-title': { ru: 'Бусты', en: 'Boosts' },
			'#stats-achievements-title': { ru: 'Достижения', en: 'Achievements' },
			};

		Object.entries(staticMap).forEach(([selector, labels]) => {
			const el = document.querySelector(selector);
			if (el) el.textContent = labels[currentLanguage] || labels.ru;
		});

		const statsFieldLabels = [
				{ ru: 'Монеты сейчас', en: 'Coins Now' },
				{ ru: 'Всего заработано монет', en: 'Total Coins Earned' },
				{ ru: 'Всего кликов', en: 'Total Clicks' },
				{ ru: 'Базовая сила клика', en: 'Base Click Power' },
				{ ru: 'Эффективная сила клика', en: 'Effective Click Power' },
				{ ru: 'Текущий уровень', en: 'Current Level' },
				{ ru: 'Прогресс уровня', en: 'Level Progress' },
				{ ru: 'До следующего уровня', en: 'Remaining to Next Level' },
				{ ru: 'Куплено улучшений клика', en: 'Click Upgrades Purchased' },
				{ ru: 'Роботов куплено', en: 'Robots Purchased' },
				{ ru: 'Базовый доход роботов в секунду', en: 'Base Robot Income' },
				{ ru: 'Эффективный доход роботов в секунду', en: 'Effective Robot Income' },
				{ ru: 'Куплено скинов', en: 'Skins Purchased' },
				{ ru: 'Открыто скинов', en: 'Skins Unlocked' },
				{ ru: 'Выбранный скин', en: 'Selected Skin' },
				{ ru: 'Улучшено бустов', en: 'Boosts Upgraded' },
				{ ru: 'Всего использовано бустов', en: 'Boosts Used' },
				{ ru: 'Разных типов использовано', en: 'Boost Types Used' },
				{ ru: 'Активно сейчас', en: 'Active Boosts' },
				{ ru: 'Лучшее комбо бустов', en: 'Best Boost Combo' },
				{ ru: 'Суммарное время бустов (сек)', en: 'Total Boost Time' },
				{ ru: 'Открыто достижений', en: 'Achievements Unlocked' },
				{ ru: 'Получено наград', en: 'Rewards Claimed' },
				{ ru: 'Система достижений', en: 'Achievement System Unlocked' },
			];

	document.querySelectorAll('.stats-item__label').forEach((el, index) => {
		const pair = statsFieldLabels[index];
		if (!pair) return;
		el.textContent = pair[currentLanguage] || pair.ru;
	});

	const ariaMap = {
		'.game-stats-row': { ru: 'Игровая статистика', en: 'Game statistics' },
		'.level-row': { ru: 'Уровень игрока', en: 'Player level' },
		'#level-bar': { ru: 'Прогресс уровня', en: 'Level progress' },
		'.game-upgrades': { ru: 'Улучшения', en: 'Upgrades' },
		'.feature-panel': { ru: 'Игровые разделы', en: 'Game sections' },
		'#skins-grid': { ru: 'Список скинов', en: 'Skins list' },
		'#boosts-tabs': { ru: 'Категории бустов', en: 'Boost categories' },
		'.boosts-active': { ru: 'Активные бусты', en: 'Active boosts' },
		'#boosts-grid': { ru: 'Список бустов', en: 'Boosts list' },
		'.achievements-overall-progress': { ru: 'Общий прогресс достижений', en: 'Overall achievement progress' },
		'#achievements-list': { ru: 'Список достижений', en: 'Achievements list' },
		'.stats-content': { ru: 'Игровая статистика', en: 'Game statistics' },
		'#volume-slider': { ru: 'Громкость звука', en: 'Sound volume' },
		'#reset-progress-btn': { ru: 'Сбросить весь прогресс', en: 'Reset all progress' },
		'#close-skins': { ru: 'Закрыть окно скинов', en: 'Close skins window' },
		'#close-boosts': { ru: 'Закрыть окно бустов', en: 'Close boosts window' },
		'#close-achievements': { ru: 'Закрыть окно достижений', en: 'Close achievements window' },
		'#close-stats': { ru: 'Закрыть окно статистики', en: 'Close statistics window' },
	};

	Object.entries(ariaMap).forEach(([selector, labels]) => {
			const el = document.querySelector(selector);
			if (el) el.setAttribute('aria-label', labels[currentLanguage] || labels.ru);
		});

		document.querySelectorAll('.price').forEach((el) => {
			el.setAttribute('aria-label', currentLanguage === 'en' ? 'Price' : 'Цена');
		});

		if (rewardFreeBoostBtn) rewardFreeBoostBtn.textContent = t('reward-free-boost');
		if (rewardRandomSkinBtn) rewardRandomSkinBtn.textContent = t('reward-random-skin');
		if (languageSelect) languageSelect.value = currentLanguage;

		renderSkinsGrid();
		renderBoostsUI();
		renderAchievements();
		renderStatistics();
		updateUI();
	}

	function applyLanguage(language, options = {}) {
		const { save = true, userSelected = false } = options;
		currentLanguage = normalizeLanguage(language);
		if (save) {
			setStorageItem(LANGUAGE_KEY, currentLanguage);
			if (userSelected) {
				setStorageItem(LANGUAGE_USER_SELECTED_KEY, '1');
			}
		}
		updateLocalizedUI();
		if (save) saveGame();
	}

	// Кликер
	const scoreEl = document.getElementById('score');
	const clickPowerEl = document.getElementById('click-power-val');
	const clickObject = document.getElementById('click-object');
	const gameEl = document.getElementById('game');

	// Кнопки панели разделов
	const skinsBtn = document.getElementById('btn-skins');
	const boostsBtn = document.getElementById('btn-boosts');
	const achievementsBtn = document.getElementById('btn-achievements');
	const statsBtn = document.getElementById('btn-stats');
	const skinsGrid = document.getElementById('skins-grid');
	const boostsModal = document.getElementById('boosts-modal');
	const closeBoostsBtn = document.getElementById('close-boosts');
		const boostsGrid = document.getElementById('boosts-grid');
		const boostsTabs = document.getElementById('boosts-tabs');
		const boostsActiveList = document.getElementById('boosts-active-list');
		const achievementsModal = document.getElementById('achievements-modal');
		const closeAchievementsBtn = document.getElementById('close-achievements');
		const achievementsList = document.getElementById('achievements-list');
		const achievementsSummary = document.getElementById('achievements-summary');
		const achievementsOverallFill = document.getElementById('achievements-overall-fill');
		const statsModal = document.getElementById('stats-modal');
		const closeStatsBtn = document.getElementById('close-stats');

		// Элементы вкладки статистики. Храним ссылки централизованно,
		// чтобы обновление шло через один рендер-метод без разрозненного кода.
		const statsEls = {
			coinsCurrent: document.getElementById('stats-coins-current'),
			totalCoinsEarned: document.getElementById('stats-total-coins-earned'),
			totalClicks: document.getElementById('stats-total-clicks'),
			clickPowerBase: document.getElementById('stats-click-power-base'),
			clickPowerEffective: document.getElementById('stats-click-power-effective'),
			level: document.getElementById('stats-level'),
			levelProgress: document.getElementById('stats-level-progress'),
			levelRemaining: document.getElementById('stats-level-remaining'),
			clickUpgrades: document.getElementById('stats-click-upgrades'),
			robotsCount: document.getElementById('stats-robots-count'),
			robotsIncomeBase: document.getElementById('stats-robots-income-base'),
			robotsIncomeEffective: document.getElementById('stats-robots-income-effective'),
			skinsBought: document.getElementById('stats-skins-bought'),
			skinsOwned: document.getElementById('stats-skins-owned'),
			skinsSelected: document.getElementById('stats-skins-selected'),
			boostsUpgraded: document.getElementById('stats-boosts-upgraded'),
			boostsUsedTotal: document.getElementById('stats-boosts-used-total'),
			boostsTypesUsed: document.getElementById('stats-boosts-types-used'),
			boostsActive: document.getElementById('stats-boosts-active'),
			boostsBestCombo: document.getElementById('stats-boosts-best-combo'),
			boostsTotalTime: document.getElementById('stats-boosts-total-time'),
			achievementsUnlocked: document.getElementById('stats-achievements-unlocked'),
			achievementsClaimed: document.getElementById('stats-achievements-claimed'),
			achievementsSystem: document.getElementById('stats-achievements-system'),
		};

	let coins = 0;
	let clickPower = 1;

	// === Улучшение клика ===
	const CLICK_UPGRADE_PRICE_KEY = 'clickUpgradePrice';
	let upgradePrice = 85; // стартовая цена (можешь поменять)

	const upgradeClickBtn = document.getElementById('btn-upgrade-click');
	const upgradeClickPriceEl = upgradeClickBtn ? upgradeClickBtn.querySelector('.price') : null;

	// === Робот (автодоход) ===
	const ROBOT_PRICE_KEY = 'robotPrice';
	const ROBOT_COUNT_KEY = 'robotCount';
	const ROBOT_INCOME_KEY = 'robotIncomePerSecond';
	const LAST_SEEN_AT_KEY = 'lastSeenAt';
	const ROBOT_BASE_PRICE = 200;

	const autoBotBtn = document.getElementById('btn-auto-bot');
	const autoBotPriceEl = autoBotBtn ? autoBotBtn.querySelector('.price') : null;
	const robotInfoEl = document.getElementById('robot-info');

	let robotPrice = ROBOT_BASE_PRICE;
	let robotCount = 0;
	let robotIncomePerSecond = 0;
	let lastSeenAt = Date.now();
	let robotTimer = null;

	// Звук
	const VOLUME_KEY = 'globalVolume';
	const volumeSlider =
		document.getElementById('volume-slider') ||
		document.querySelector('#settings input[type="range"]:not(#brightness-range)');

	let globalVolume = 1; // 0..1

	// Яркость
	const BRIGHTNESS_KEY = 'brightness';
	const BR_MIN = 20;
	const BR_MAX = 80;
	const DEFAULT_THEME = 'dark';
	const DEFAULT_BRIGHTNESS = BR_MAX;
	const DEFAULT_VOLUME = 1;

	const brightnessRange = document.getElementById('brightness-range'); // именно яркость (не звук)
	let brightness = DEFAULT_BRIGHTNESS; // 20..80

	if (brightnessRange) {
		brightnessRange.min = String(BR_MIN);
		brightnessRange.max = String(BR_MAX);
	}

	// Увеличение уровня
	const levelBarEl = document.getElementById('level-bar');
	const levelFillEl = document.getElementById('level-fill');
	const levelTextEl = document.getElementById('level-text');

	const LEVEL_KEY = 'playerLevel';
	const LEVEL_CLICKS_KEY = 'levelClicks';

	let level = 0; // стартовый уровень 0
	let levelClicks = 0; // прогресс кликов в текущем уровне

	// Сложность: LVL 0 -> 1 = 150 кликов, дальше умножаем на 2.1 каждый уровень
	const LEVEL_FIRST_CLICKS = 150; // требование для перехода с LVL 0 на LVL 1
	const LEVEL_MULTIPLIER = 2.1; // множитель роста сложности


		// === СКИНЫ ===
	const SKINS_OWNED_KEY = 'skinsOwned';
	const SKINS_SELECTED_KEY = 'skinSelected';
	const skins = [
		{ id: 1, name: 'Классический Робот', icon: '🤖', price: 0, rarity: 'common' },
		{ id: 2, name: 'Рабочий Механик', icon: '🔧', price: 800, rarity: 'common' },
		{ id: 3, name: 'Стальной Защитник', icon: '🛡️', price: 1600, rarity: 'common' },
		{ id: 4, name: 'Лунный Разведчик', icon: '🪐', price: 3500, rarity: 'common' },
		{ id: 5, name: 'Неоновый Курьер', icon: '🌟', price: 6000, rarity: 'uncommon' },
		{ id: 6, name: 'Огненный Прототип', icon: '🔥', price: 8500, rarity: 'uncommon' },
		{ id: 7, name: 'Ледяной Страж', icon: '❄️', price: 11000, rarity: 'uncommon' },
		{ id: 8, name: 'Камуфляжный Тактик', icon: '🪖', price: 14000, rarity: 'uncommon' },
		{ id: 9, name: 'Кибер-Ниндзя', icon: '🥷', price: 22000, rarity: 'rare' },
		{ id: 10, name: 'Электро-Воин', icon: '⚡', price: 29000, rarity: 'rare' },
		{ id: 11, name: 'Космический Рейдер', icon: '🌌', price: 39000, rarity: 'rare' },
		{ id: 12, name: 'Хромовый Фантом', icon: '💎', price: 49000, rarity: 'rare' },
		{ id: 13, name: 'Драконий Мех', icon: '🐉', price: 78000, rarity: 'ultra' },
		{ id: 14, name: 'Галактический Император', icon: '👑', price: 115000, rarity: 'ultra' },
		{ id: 15, name: 'Призрачный Протокол', icon: '👻', price: 155000, rarity: 'ultra' },
		{ id: 16, name: 'Абсолютный Омега', icon: '☄️', price: 780000, rarity: 'ultra' },
	];

	const DEFAULT_SKIN_ID = 1;
	const skinById = new Map(skins.map((skin) => [skin.id, skin]));
	let ownedSkinIds = new Set([DEFAULT_SKIN_ID]);
	let selectedSkinId = DEFAULT_SKIN_ID;

	// === БУСТЫ ===
	const BOOST_LEVELS_KEY = 'boostLevels';
	const BOOST_USAGE_KEY = 'boostUsageCount';
	const BOOST_ACTIVE_KEY = 'activeBoosts';
	const BOOSTS_STATE_KEY = 'boostsState';
	const BOOST_PENDING_DISCOUNT_KEY = 'pendingDiscount';
	const BOOST_PENDING_SUPER_CLICK_KEY = 'pendingSuperClick';

	let currentBoostCategory = 'temporary';
	let boostLevels = {};
	let boostUsageCount = {};
	let activeBoosts = {};
	let boostTimers = new Map();
	let pendingSuperClick = false;
	let pendingDiscount = false;
	let boostTimeScale = 1;
	let critBoostActive = false;

	const boostCategories = [
		{ id: 'temporary', label: { ru: 'Временные', en: 'Temporary' } },
		{ id: 'permanent', label: { ru: 'Постоянные', en: 'Permanent' } },
		{ id: 'super', label: { ru: 'Супер', en: 'Super' } },
	];

	const boosts = [
		{ id: 'neon_overdrive', category: 'temporary', type: 'temporary', rarity: 'rare', icon: '⚡', name: 'Неоновый разгон', description: 'x3 к силе клика', desc: 'x3 к силе клика на 30 секунд', basePrice: 300, currentPrice: 300, priceMultiplier: 1.2, baseEffect: 3, currentEffect: 3, effectStep: 1, effectMultiplier: null, purchases: 0, duration: 30, active: false, expiresAt: null },
		{ id: 'offline_accelerator', category: 'temporary', type: 'temporary_offline', rarity: 'rare', icon: '🛰️', name: 'Офлайн-ускоритель', description: 'x5 к офлайн-доходу на 2 часа', desc: 'x5 к офлайн-доходу на 2 часа', basePrice: 800, currentPrice: 800, priceMultiplier: 1.2, baseEffect: 5, currentEffect: 5, effectStep: 0, effectMultiplier: null, purchases: 0, duration: 7200, active: false, expiresAt: null },
		{ id: 'drone_army', category: 'temporary', type: 'temporary', rarity: 'epic', icon: '🤖', name: 'Армия дронов', description: 'x3 доход роботов на 90 секунд', desc: 'x3 доход роботов на 90 секунд', basePrice: 1800, currentPrice: 1800, priceMultiplier: 1.2, baseEffect: 3, currentEffect: 3, effectStep: 0.5, effectMultiplier: null, purchases: 0, duration: 90, active: false, expiresAt: null },
		{ id: 'golden_storm', category: 'temporary', type: 'temporary', rarity: 'rare', icon: '🌟', name: 'Золотой шторм', description: '+150% монет за клик', desc: '+150% монет за клик на 40 секунд', basePrice: 1200, currentPrice: 1200, priceMultiplier: 1.2, baseEffect: 2.5, currentEffect: 2.5, effectStep: 0.5, effectMultiplier: null, purchases: 0, duration: 40, active: false, expiresAt: null },
		{ id: 'processor_plus', category: 'permanent', type: 'passive', rarity: 'rare', icon: '📈', name: 'Улучшенный процессор', description: '+1 к силе клика', desc: '+1 к силе клика', basePrice: 3000, currentPrice: 3000, priceMultiplier: 1.35, baseEffect: 1, currentEffect: 1, effectStep: 1, effectMultiplier: null, purchases: 0, duration: 0, active: false, expiresAt: null },
		{ id: 'eternal_generator', category: 'permanent', type: 'passive', rarity: 'epic', icon: '🔋', name: 'Вечный генератор', description: '+0.5 дохода роботов', desc: '+0.5 дохода роботов', basePrice: 5000, currentPrice: 5000, priceMultiplier: 1.35, baseEffect: 0.5, currentEffect: 0.5, effectStep: 0.5, effectMultiplier: null, purchases: 0, duration: 0, active: false, expiresAt: null },
		{ id: 'evolution_module', category: 'permanent', type: 'passive', rarity: 'epic', icon: '🧬', name: 'Модуль эволюции', description: '+5% к силе клика за уровень', desc: '+5% к силе клика за уровень', basePrice: 12000, currentPrice: 12000, priceMultiplier: 1.5, baseEffect: 0.05, currentEffect: 0.05, effectStep: 0, effectMultiplier: null, purchases: 0, duration: 0, active: false, expiresAt: null, oneTime: true, consumed: false },
		{ id: 'space_amplifier', category: 'permanent', type: 'passive', rarity: 'epic', icon: '🌌', name: 'Космический усилитель', description: '+10% ко всем доходам', desc: '+10% ко всем доходам', basePrice: 25000, currentPrice: 25000, priceMultiplier: 1.5, baseEffect: 0.1, currentEffect: 0.1, effectStep: 0, effectMultiplier: null, purchases: 0, duration: 0, active: false, expiresAt: null, oneTime: true, consumed: false },
		{ id: 'critical_overload', category: 'super', type: 'temporary', rarity: 'epic', icon: '💥', name: 'Критический перегруз', description: '30% шанс x10 за клик', desc: '30% шанс x10 за клик', basePrice: 1700, currentPrice: 1700, priceMultiplier: 1.3, baseEffect: 10, currentEffect: 10, effectStep: 0, effectMultiplier: 1.5, baseChance: 0.3, currentChance: 0.3, chanceStep: 0, purchases: 0, duration: 75, active: false, expiresAt: null },
		{ id: 'time_freeze', category: 'super', type: 'temporary', rarity: 'rare', icon: '❄', name: 'Заморозка времени', description: 'Таймеры x0.5 на 30 секунд', desc: 'Таймеры x0.5 на 30 секунд', basePrice: 1500, currentPrice: 1500, priceMultiplier: 1.25, baseEffect: 0.5, currentEffect: 0.5, effectStep: 0, effectMultiplier: null, purchases: 0, duration: 30, active: false, expiresAt: null },
		{ id: 'galactic_breakthrough', category: 'super', type: 'temporary', rarity: 'epic', icon: '🌠', name: 'Галактический прорыв', description: 'Клики x10 и роботы x5', desc: 'Клики x10 и роботы x5', basePrice: 8000, currentPrice: 8000, priceMultiplier: 1.4, baseEffect: 10, currentEffect: 10, effectStep: 2, effectMultiplier: null, baseRobotEffect: 5, currentRobotEffect: 5, robotEffectStep: 1, purchases: 0, duration: 15, active: false, expiresAt: null },
		{ id: 'omega_mode', category: 'super', type: 'temporary', rarity: 'epic', icon: '🌀', name: 'Омега режим', description: 'Клики x20 на 20 секунд', desc: 'Клики x20 на 20 секунд', basePrice: 12000, currentPrice: 12000, priceMultiplier: 1.4, baseEffect: 20, currentEffect: 20, effectStep: 5, effectMultiplier: null, purchases: 0, duration: 20, active: false, expiresAt: null },
	];
		const boostById = new Map(boosts.map((boost) => [boost.id, boost]));

		const ACHIEVEMENTS_STATE_KEY = 'achievementsState';
		const ACHIEVEMENTS_BUTTON_UNLOCKED_KEY = 'achievementsButtonUnlocked';
		const ACHIEVEMENTS_COUNTERS_KEY = 'achievementsCounters';
		const ACHIEVEMENTS_SEEN_UNLOCKED_KEY = 'achievementsSeenUnlocked';
		const TOTAL_CLICKS_KEY = 'totalClicks';
		const TOTAL_COINS_EARNED_KEY = 'totalCoinsEarned';
		const CLICK_UPGRADES_COUNT_KEY = 'clickUpgradesCount';
		const SKINS_BOUGHT_COUNT_KEY = 'skinsBoughtCount';

		const achievements = [
  { id: 1, name: "Первый контакт", icon: "👋", desc: "Сделай 1 клик", type: "clicks", goal: 1, reward: 50, bonus: null, unlocked: false, claimed: false },
  { id: 2, name: "Я оживаю!", icon: "🤖", desc: "Купи 1 робота", type: "robots", goal: 1, reward: 150, bonus: null, unlocked: false, claimed: false },
  { id: 3, name: "Первый тюнинг", icon: "⚙️", desc: "Улучши клик 1 раз", type: "clickUpgrades", goal: 1, reward: 100, bonus: null, unlocked: false, claimed: false },
  { id: 4, name: "Добро пожаловать на борт", icon: "🌟", desc: "Достигни уровня 3", type: "level", goal: 3, reward: 300, bonus: null, unlocked: false, claimed: false },
  { id: 5, name: "Первый сигнал", icon: "📡", desc: "Заработай 100 монет", type: "totalCoins", goal: 100, reward: 200, bonus: null, unlocked: false, claimed: false },
  { id: 6, name: "Сборка начинается", icon: "🔧", desc: "Купи 3 робота", type: "robots", goal: 3, reward: 400, bonus: null, unlocked: false, claimed: false },
  { id: 7, name: "Базовая калибровка", icon: "🛠️", desc: "Улучши клик 5 раз", type: "clickUpgrades", goal: 5, reward: 250, bonus: null, unlocked: false, claimed: false },
  { id: 8, name: "Первые данные", icon: "📊", desc: "Набери 500 кликов", type: "clicks", goal: 500, reward: 350, bonus: null, unlocked: false, claimed: false },
  { id: 9, name: "Выход на орбиту", icon: "🪐", desc: "Достигни уровня 5", type: "level", goal: 5, reward: 500, bonus: null, unlocked: false, claimed: false },
  { id: 10, name: "Запуск протокола", icon: "🚀", desc: "Заработай 1000 монет", type: "totalCoins", goal: 1000, reward: 600, bonus: null, unlocked: false, claimed: false },

  { id: 11, name: "Клик-новичок", icon: "👆", desc: "500 кликов", type: "clicks", goal: 500, reward: 400, bonus: null, unlocked: false, claimed: false },
  { id: 12, name: "Клик-машина", icon: "💥", desc: "2500 кликов", type: "clicks", goal: 2500, reward: 900, bonus: null, unlocked: false, claimed: false },
  { id: 13, name: "Клик-маньяк", icon: "🔥", desc: "10000 кликов", type: "clicks", goal: 10000, reward: 2000, bonus: null, unlocked: false, claimed: false },
  { id: 14, name: "Клик-шторм", icon: "⚡", desc: "25000 кликов", type: "clicks", goal: 25000, reward: 4500, bonus: null, unlocked: false, claimed: false },
  { id: 15, name: "Клик-бог", icon: "🏆", desc: "50000 кликов", type: "clicks", goal: 50000, reward: 8000, bonus: null, unlocked: false, claimed: false },
  { id: 16, name: "Галактический кликер", icon: "🌌", desc: "100000 кликов", type: "clicks", goal: 100000, reward: 15000, bonus: null, unlocked: false, claimed: false },
  { id: 17, name: "Метеоритный дождь", icon: "☄️", desc: "250000 кликов", type: "clicks", goal: 250000, reward: 25000, bonus: "скин", unlocked: false, claimed: false },
  { id: 18, name: "Взрывной клик", icon: "💣", desc: "500000 кликов", type: "clicks", goal: 500000, reward: 40000, bonus: null, unlocked: false, claimed: false },
  { id: 19, name: "Абсолютный кликер", icon: "🧨", desc: "1000000 кликов", type: "clicks", goal: 1000000, reward: 70000, bonus: null, unlocked: false, claimed: false },
  { id: 20, name: "Король кликов", icon: "👑", desc: "2500000 кликов", type: "clicks", goal: 2500000, reward: 120000, bonus: "+2% навсегда", unlocked: false, claimed: false },

  { id: 21, name: "Первый миллионер", icon: "💰", desc: "10000 монет всего", type: "totalCoins", goal: 10000, reward: 800, bonus: null, unlocked: false, claimed: false },
  { id: 22, name: "Космический банкир", icon: "🪙", desc: "50000 монет", type: "totalCoins", goal: 50000, reward: 2000, bonus: null, unlocked: false, claimed: false },
  { id: 23, name: "Галактический олигарх", icon: "🏦", desc: "250000 монет", type: "totalCoins", goal: 250000, reward: 5000, bonus: null, unlocked: false, claimed: false },
  { id: 24, name: "Триллионер", icon: "🌠", desc: "1000000 монет", type: "totalCoins", goal: 1000000, reward: 12000, bonus: null, unlocked: false, claimed: false },
  { id: 25, name: "Алмазный запас", icon: "💎", desc: "5000000 монет", type: "totalCoins", goal: 5000000, reward: 25000, bonus: null, unlocked: false, claimed: false },
  { id: 26, name: "Планетарный капитал", icon: "🪐", desc: "10000000 монет", type: "totalCoins", goal: 10000000, reward: 40000, bonus: null, unlocked: false, claimed: false },
  { id: 27, name: "Звёздный магнат", icon: "🌌", desc: "25000000 монет", type: "totalCoins", goal: 25000000, reward: 70000, bonus: "+3% навсегда", unlocked: false, claimed: false },
  { id: 28, name: "Метеоритный дождь богатства", icon: "☄️", desc: "50000000 монет", type: "totalCoins", goal: 50000000, reward: 100000, bonus: null, unlocked: false, claimed: false },
  { id: 29, name: "Император богатства", icon: "👑", desc: "100000000 монет", type: "totalCoins", goal: 100000000, reward: 150000, bonus: null, unlocked: false, claimed: false },
  { id: 30, name: "Абсолютный триллионер", icon: "🏆", desc: "250000000 монет", type: "totalCoins", goal: 250000000, reward: 250000, bonus: "секретный скин", unlocked: false, claimed: false },

  { id: 31, name: "Армия начинается", icon: "🛠️", desc: "10 роботов", type: "robots", goal: 10, reward: 600, bonus: null, unlocked: false, claimed: false },
  { id: 32, name: "Робот-фабрика", icon: "🤖", desc: "25 роботов", type: "robots", goal: 25, reward: 1500, bonus: null, unlocked: false, claimed: false },
  { id: 33, name: "Робот-империя", icon: "🏭", desc: "50 роботов", type: "robots", goal: 50, reward: 3500, bonus: null, unlocked: false, claimed: false },
  { id: 34, name: "Космический флот", icon: "🚀", desc: "100 роботов", type: "robots", goal: 100, reward: 7000, bonus: null, unlocked: false, claimed: false },
  { id: 35, name: "Галактическая армада", icon: "🌌", desc: "200 роботов", type: "robots", goal: 200, reward: 15000, bonus: null, unlocked: false, claimed: false },
  { id: 36, name: "Планетарный гарнизон", icon: "🪐", desc: "300 роботов", type: "robots", goal: 300, reward: 25000, bonus: null, unlocked: false, claimed: false },
  { id: 37, name: "Механическая орда", icon: "👾", desc: "500 роботов", type: "robots", goal: 500, reward: 40000, bonus: null, unlocked: false, claimed: false },
  { id: 38, name: "Автоматическая цивилизация", icon: "⚙️", desc: "750 роботов", type: "robots", goal: 750, reward: 60000, bonus: null, unlocked: false, claimed: false },
  { id: 39, name: "Робот-император", icon: "🏆", desc: "1000 роботов", type: "robots", goal: 1000, reward: 90000, bonus: null, unlocked: false, claimed: false },
  { id: 40, name: "Владыка машин", icon: "👑", desc: "2000 роботов", type: "robots", goal: 2000, reward: 150000, bonus: "+5% роботы", unlocked: false, claimed: false },

  { id: 41, name: "Мастер апгрейдов", icon: "📈", desc: "20 улучшений клика", type: "clickUpgrades", goal: 20, reward: 800, bonus: null, unlocked: false, claimed: false },
  { id: 42, name: "Процессор уровня 2", icon: "🔧", desc: "Сила клика = 20", type: "clickPower", goal: 20, reward: 1200, bonus: null, unlocked: false, claimed: false },
  { id: 43, name: "Максимальная мощность", icon: "⚡", desc: "Сила клика = 50", type: "clickPower", goal: 50, reward: 3000, bonus: null, unlocked: false, claimed: false },
  { id: 44, name: "Перегрев системы", icon: "🔥", desc: "Сила клика = 100", type: "clickPower", goal: 100, reward: 6000, bonus: null, unlocked: false, claimed: false },
  { id: 45, name: "Сверхпроводник", icon: "🌟", desc: "100 улучшений клика", type: "clickUpgrades", goal: 100, reward: 12000, bonus: null, unlocked: false, claimed: false },
  { id: 46, name: "Генетический тюнинг", icon: "🧬", desc: "Сила клика = 200", type: "clickPower", goal: 200, reward: 20000, bonus: null, unlocked: false, claimed: false },
  { id: 47, name: "Хромовый максимум", icon: "💎", desc: "Сила клика = 300", type: "clickPower", goal: 300, reward: 35000, bonus: null, unlocked: false, claimed: false },
  { id: 48, name: "Абсолютный процессор", icon: "☄️", desc: "Сила клика = 500", type: "clickPower", goal: 500, reward: 55000, bonus: null, unlocked: false, claimed: false },
  { id: 49, name: "Императорский чип", icon: "👑", desc: "250 улучшений клика", type: "clickUpgrades", goal: 250, reward: 80000, bonus: null, unlocked: false, claimed: false },
  { id: 50, name: "Легенда улучшений", icon: "🏆", desc: "Сила клика = 1000", type: "clickPower", goal: 1000, reward: 120000, bonus: "+4% навсегда", unlocked: false, claimed: false },

  { id: 51, name: "Первый стиль", icon: "👕", desc: "Купи 1 скин", type: "skins", goal: 1, reward: 300, bonus: null, unlocked: false, claimed: false },
  { id: 52, name: "Модный инженер", icon: "🎨", desc: "4 скина", type: "skins", goal: 4, reward: 1000, bonus: null, unlocked: false, claimed: false },
  { id: 53, name: "Коллекционер среднего уровня", icon: "🌟", desc: "8 скинов", type: "skins", goal: 8, reward: 3000, bonus: null, unlocked: false, claimed: false },
  { id: 54, name: "Редкий собиратель", icon: "🥷", desc: "12 скинов", type: "skins", goal: 12, reward: 7000, bonus: null, unlocked: false, claimed: false },
  { id: 55, name: "Хромовый коллекционер", icon: "💎", desc: "Все 16 скинов", type: "skins", goal: 16, reward: 25000, bonus: "секретный скин", unlocked: false, claimed: false },
  { id: 56, name: "Галактический гардероб", icon: "🌌", desc: "10 разных скинов одновременно", type: "skinsEquipped", goal: 10, reward: 12000, bonus: null, unlocked: false, claimed: false },
  { id: 57, name: "Император стиля", icon: "👑", desc: "Все ультра-редкие скины", type: "skins", goal: 4, reward: 40000, bonus: null, unlocked: false, claimed: false },
  { id: 58, name: "Легенда моды", icon: "🏆", desc: "Купи 50 скинов", type: "skinsBought", goal: 50, reward: 18000, bonus: null, unlocked: false, claimed: false },
  { id: 59, name: "Огненный гардероб", icon: "🔥", desc: "Надень 5 редких скинов подряд", type: "skinsEquipped", goal: 5, reward: 8000, bonus: null, unlocked: false, claimed: false },
  { id: 60, name: "Абсолютный коллекционер", icon: "☄️", desc: "Все 16 скинов + все достижения", type: "skins", goal: 16, reward: 100000, bonus: "вечный бонус", unlocked: false, claimed: false },

  { id: 61, name: "Буст-новичок", icon: "⚡", desc: "Активируй 5 бустов", type: "boosts", goal: 5, reward: 500, bonus: null, unlocked: false, claimed: false },
  { id: 62, name: "Буст-энтузиаст", icon: "🚀", desc: "25 бустов", type: "boosts", goal: 25, reward: 1500, bonus: null, unlocked: false, claimed: false },
  { id: 63, name: "Буст-король", icon: "💥", desc: "100 бустов", type: "boosts", goal: 100, reward: 4000, bonus: null, unlocked: false, claimed: false },
  { id: 64, name: "Мастер комбо", icon: "🌟", desc: "3 буста одновременно", type: "boostCombo", goal: 3, reward: 2500, bonus: null, unlocked: false, claimed: false },
  { id: 65, name: "Временной бог", icon: "⏳", desc: "300+ секунд бустов суммарно", type: "boostTime", goal: 300, reward: 6000, bonus: null, unlocked: false, claimed: false },
  { id: 66, name: "Критический буст", icon: "🔥", desc: "10 редких бустов", type: "boosts", goal: 10, reward: 8000, bonus: null, unlocked: false, claimed: false },
  { id: 67, name: "Взрывной бустер", icon: "🧨", desc: "500 бустов", type: "boosts", goal: 500, reward: 15000, bonus: null, unlocked: false, claimed: false },
  { id: 68, name: "Император бустов", icon: "👑", desc: "Все типы бустов хотя бы раз", type: "boostTypes", goal: 3, reward: 10000, bonus: null, unlocked: false, claimed: false },
  { id: 69, name: "Легенда ускорения", icon: "🏆", desc: "1000 бустов", type: "boosts", goal: 1000, reward: 25000, bonus: null, unlocked: false, claimed: false },
  { id: 70, name: "Абсолютный буст-мастер", icon: "☄️", desc: "2500 бустов + 10 комбо", type: "boosts", goal: 2500, reward: 50000, bonus: "+5% навсегда", unlocked: false, claimed: false },

  { id: 71, name: "Инженер-легенда", icon: "🏅", desc: "Достигни уровня 20", type: "level", goal: 20, reward: 8000, bonus: null, unlocked: false, claimed: false },
  { id: 72, name: "Галактический герой", icon: "🌌", desc: "Уровень 30", type: "level", goal: 30, reward: 15000, bonus: null, unlocked: false, claimed: false },
  { id: 73, name: "Император лаборатории", icon: "👑", desc: "Уровень 40", type: "level", goal: 40, reward: 30000, bonus: null, unlocked: false, claimed: false },
  { id: 74, name: "Абсолютный Омега", icon: "☄️", desc: "Уровень 50", type: "level", goal: 50, reward: 50000, bonus: "+5% навсегда", unlocked: false, claimed: false },
  { id: 75, name: "Легенда Robo Clicker", icon: "🏆", desc: "Все достижения кроме этого", type: "achievements", goal: 79, reward: 100000, bonus: null, unlocked: false, claimed: false },
  { id: 76, name: "Вечный двигатель", icon: "🔥", desc: "10 млн монет + 500 роботов", type: "totalCoins", goal: 10000000, reward: 40000, bonus: null, unlocked: false, claimed: false },
  { id: 77, name: "Эволюция завершена", icon: "🧬", desc: "Сила клика 500 + уровень 45", type: "clickPower", goal: 500, reward: 60000, bonus: null, unlocked: false, claimed: false },
  { id: 78, name: "Звёздный инженер", icon: "🌠", desc: "Все скины + уровень 35", type: "skins", goal: 16, reward: 35000, bonus: null, unlocked: false, claimed: false },
  { id: 79, name: "Перегрузка системы", icon: "💥", desc: "5 млн кликов + 1000 роботов", type: "clicks", goal: 5000000, reward: 80000, bonus: null, unlocked: false, claimed: false },
  { id: 80, name: "Абсолютная легенда", icon: "🏆", desc: "500 млн монет + все выше", type: "totalCoins", goal: 500000000, reward: 200000, bonus: "секретный ультра-скин", unlocked: false, claimed: false }
];

		// Готовые утверждённые английские переводы достижений.
		const ACHIEVEMENT_EN_BY_ID = {
			1: { name: 'First Contact', desc: 'Make 1 click' },
			2: { name: "I’m Coming Alive!", desc: 'Buy 1 robot' },
			3: { name: 'First Upgrade', desc: 'Upgrade click once' },
			4: { name: 'Welcome Aboard', desc: 'Reach level 3' },
			5: { name: 'First Signal', desc: 'Earn 100 coins' },
			6: { name: 'Assembly Begins', desc: 'Buy 3 robots' },
			7: { name: 'Basic Calibration', desc: 'Upgrade click 5 times' },
			8: { name: 'First Data', desc: 'Reach 500 clicks' },
			9: { name: 'Into Orbit', desc: 'Reach level 5' },
			10: { name: 'Protocol Launch', desc: 'Earn 1,000 coins' },
			11: { name: 'Click Rookie', desc: '500 clicks' },
			12: { name: 'Click Machine', desc: '2,500 clicks' },
			13: { name: 'Click Maniac', desc: '10,000 clicks' },
			14: { name: 'Click Storm', desc: '25,000 clicks' },
			15: { name: 'Click God', desc: '50,000 clicks' },
			16: { name: 'Galactic Clicker', desc: '100,000 clicks' },
			17: { name: 'Meteor Shower', desc: '250,000 clicks', bonus: 'skin' },
			18: { name: 'Explosive Click', desc: '500,000 clicks' },
			19: { name: 'Ultimate Clicker', desc: '1,000,000 clicks' },
			20: { name: 'King of Clicks', desc: '2,500,000 clicks', bonus: '+2% forever' },
			21: { name: 'First Millionaire', desc: '10,000 total coins' },
			22: { name: 'Space Banker', desc: '50,000 coins' },
			23: { name: 'Galactic Oligarch', desc: '250,000 coins' },
			24: { name: 'Trillionaire', desc: '1,000,000 coins' },
			25: { name: 'Diamond Reserve', desc: '5,000,000 coins' },
			26: { name: 'Planetary Capital', desc: '10,000,000 coins' },
			27: { name: 'Star Tycoon', desc: '25,000,000 coins', bonus: '+3% forever' },
			28: { name: 'Meteor Shower of Wealth', desc: '50,000,000 coins' },
			29: { name: 'Emperor of Wealth', desc: '100,000,000 coins' },
			30: { name: 'Ultimate Trillionaire', desc: '250,000,000 coins', bonus: 'secret skin' },
			31: { name: 'The Army Begins', desc: '10 robots' },
			32: { name: 'Robot Factory', desc: '25 robots' },
			33: { name: 'Robot Empire', desc: '50 robots' },
			34: { name: 'Space Fleet', desc: '100 robots' },
			35: { name: 'Galactic Armada', desc: '200 robots' },
			36: { name: 'Planetary Garrison', desc: '300 robots' },
			37: { name: 'Mechanical Horde', desc: '500 robots' },
			38: { name: 'Automated Civilization', desc: '750 robots' },
			39: { name: 'Robot Emperor', desc: '1,000 robots' },
			40: { name: 'Lord of Machines', desc: '2,000 robots', bonus: '+5% robot income' },
			41: { name: 'Upgrade Master', desc: '20 click upgrades' },
			42: { name: 'Level 2 Processor', desc: 'Click power = 20' },
			43: { name: 'Maximum Power', desc: 'Click power = 50' },
			44: { name: 'System Overheat', desc: 'Click power = 100' },
			45: { name: 'Superconductor', desc: '100 click upgrades' },
			46: { name: 'Genetic Tuning', desc: 'Click power = 200' },
			47: { name: 'Chrome Maximum', desc: 'Click power = 300' },
			48: { name: 'Ultimate Processor', desc: 'Click power = 500' },
			49: { name: 'Imperial Chip', desc: '250 click upgrades' },
			50: { name: 'Legend of Upgrades', desc: 'Click power = 1,000', bonus: '+4% forever' },
			51: { name: 'First Style', desc: 'Buy 1 skin' },
			52: { name: 'Fashion Engineer', desc: '4 skins' },
			53: { name: 'Mid-Tier Collector', desc: '8 skins' },
			54: { name: 'Rare Collector', desc: '12 skins' },
			55: { name: 'Chrome Collector', desc: 'All 16 skins', bonus: 'secret skin' },
			56: { name: 'Galactic Wardrobe', desc: '10 different skins at once' },
			57: { name: 'Emperor of Style', desc: 'All ultra-rare skins' },
			58: { name: 'Fashion Legend', desc: 'Buy 50 skins' },
			59: { name: 'Fiery Wardrobe', desc: 'Equip 5 rare skins in a row' },
			60: { name: 'Ultimate Collector', desc: 'All 16 skins + all achievements', bonus: 'permanent bonus' },
			61: { name: 'Boost Rookie', desc: 'Activate 5 boosts' },
			62: { name: 'Boost Enthusiast', desc: '25 boosts' },
			63: { name: 'Boost King', desc: '100 boosts' },
			64: { name: 'Combo Master', desc: 'Activate 3 boosts at once' },
			65: { name: 'Time God', desc: '300+ total boost seconds' },
			66: { name: 'Critical Boost', desc: 'Use 10 rare boosts' },
			67: { name: 'Explosive Booster', desc: '500 boosts' },
			68: { name: 'Emperor of Boosts', desc: 'Use every boost type at least once' },
			69: { name: 'Speed Legend', desc: '1,000 boosts' },
			70: { name: 'Ultimate Boost Master', desc: '2,500 boosts + 10 combos', bonus: '+5% forever' },
			71: { name: 'Legendary Engineer', desc: 'Reach level 20' },
			72: { name: 'Galactic Hero', desc: 'Level 30' },
			73: { name: 'Emperor of the Lab', desc: 'Level 40' },
			74: { name: 'Absolute Omega', desc: 'Level 50', bonus: '+5% forever' },
			75: { name: 'Robo Clicker Legend', desc: 'Unlock every achievement except this one' },
			76: { name: 'Perpetual Engine', desc: '10M coins + 500 robots' },
			77: { name: 'Evolution Complete', desc: 'Click power 500 + level 45' },
			78: { name: 'Star Engineer', desc: 'All skins + level 35' },
			79: { name: 'System Overload', desc: '5M clicks + 1,000 robots' },
			80: { name: 'Ultimate Legend', desc: '500M coins + everything above', bonus: 'secret ultra skin' },
		};


		const ACHIEVEMENT_SERIES_SCHEMA_VERSION = 2;
		const achievementSeries = [];
		const achievementSeriesById = new Map();
		const achievementStepByLegacyId = new Map();

		function createSeriesFromLegacy(id, options = {}) {
			const { type = null, name = '', icon = '🏅', stepIds = [] } = options;
			const steps = stepIds
				.map((legacyId) => achievements.find((item) => item.id === legacyId))
				.filter(Boolean)
				.sort((a, b) => a.goal - b.goal)
				.map((item, index, arr) => ({
					id: item.id,
					goal: item.goal,
					desc: item.desc,
					reward: item.reward,
					bonus: item.bonus,
					final: index === arr.length - 1,
					finalVisual: index === arr.length - 1,
					legacyAchievement: item,
					claimed: false,
					unlocked: false,
				}));

			const series = {
				id,
				name: name || (steps[0] ? steps[0].name : ''),
				icon: icon || (steps[0] ? steps[0].icon : '🏅'),
				type: type || (steps[0] ? steps[0].type : 'special'),
				category: type || (steps[0] ? steps[0].type : 'special'),
				hiddenStageProgression: true,
				steps,
				currentStepIndex: 0,
				completed: false,
				fullyCompleted: false,
			};

			steps.forEach((step) => {
				achievementStepByLegacyId.set(step.id, { seriesId: id, stepId: step.id });
			});
			return series;
		}

		function buildAchievementSeries() {
			achievementSeries.length = 0;
			achievementSeriesById.clear();
			achievementStepByLegacyId.clear();

			const definitions = [
				{ id: 'clicks_series', type: 'clicks', name: 'Путь кликера', icon: '🖱️', stepIds: [1, 8, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] },
				{ id: 'coins_series', type: 'totalCoins', name: 'Монетная орбита', icon: '💰', stepIds: [5, 10, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30] },
				{ id: 'robots_series', type: 'robots', name: 'Робо-армия', icon: '🤖', stepIds: [2, 6, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40] },
				{ id: 'upgrades_series', type: 'clickUpgrades', name: 'Инженер апгрейдов', icon: '⚙️', stepIds: [3, 7, 41, 45, 49] },
				{ id: 'click_power_series', type: 'clickPower', name: 'Мощность ядра', icon: '🔋', stepIds: [42, 43, 44, 46, 47, 48, 50] },
				{ id: 'level_series', type: 'level', name: 'Ранг инженера', icon: '🌟', stepIds: [4, 9, 71, 72, 73, 74] },
				{ id: 'skins_series', type: 'skins', name: 'Коллекция стиля', icon: '🎨', stepIds: [51, 52, 53, 54, 55] },
				{ id: 'skins_master_series', type: 'skinsBought', name: 'Модный прорыв', icon: '👔', stepIds: [56, 58, 59, 57, 60] },
				{ id: 'boosts_series', type: 'boosts', name: 'Поток бустов', icon: '🚀', stepIds: [61, 62, 63, 67, 69] },
				{ id: 'boosts_master_series', type: 'boostCombo', name: 'Мастер синергии', icon: '✨', stepIds: [64, 65, 66, 68, 70] },
				{ id: 'legendary_series', type: 'special', name: 'Легенды лаборатории', icon: '🏆', stepIds: [76, 77, 78, 79, 75, 80] },
			];

			definitions.forEach((definition) => {
				const series = createSeriesFromLegacy(definition.id, definition);
				if (series.steps.length === 0) return;
				achievementSeries.push(series);
				achievementSeriesById.set(series.id, series);
			});
		}

		buildAchievementSeries();

		let totalClicks = 0;
		let totalCoinsEarned = 0;
		let clickUpgradesCount = 0;
		let skinsBoughtCount = 0;
		// Базовые стартовые значения, которые НЕ должны давать прогресс достижений.
		const ACHIEVEMENT_BASE_LEVEL = 0;
		const ACHIEVEMENT_BASE_ROBOTS = 0;
		const ACHIEVEMENT_BASE_CLICK_UPGRADES = 0;
		const ACHIEVEMENT_BASE_SKINS = 1; // стартовый скин по умолчанию
		let achievementsButtonUnlocked = false;
		let permanentCoinBonusMultiplier = 1;
		let permanentRobotBonusMultiplier = 1;
		let permanentClickPowerBonus = 0;
		const seenUnlockedAchievementIds = new Set();
		const boostTypesUsed = new Set();
		const achievementCounters = { boostComboBest: 0, boostTime: 0 };
	let lastBoostTick = Date.now();

	// Полный список ключей, которые относятся только к игре.
	// В reset мы чистим только эти ключи, не затрагивая чужие данные в localStorage.
	const GAME_STORAGE_KEYS = [
		'coins',
		'clickPower',
		CLICK_UPGRADE_PRICE_KEY,
		ROBOT_PRICE_KEY,
		ROBOT_COUNT_KEY,
		ROBOT_INCOME_KEY,
		LAST_SEEN_AT_KEY,
		BRIGHTNESS_KEY,
		VOLUME_KEY,
		LEVEL_KEY,
		LEVEL_CLICKS_KEY,
		SKINS_OWNED_KEY,
		SKINS_SELECTED_KEY,
		BOOST_LEVELS_KEY,
		BOOST_USAGE_KEY,
		BOOST_ACTIVE_KEY,
		BOOSTS_STATE_KEY,
		BOOST_PENDING_DISCOUNT_KEY,
		BOOST_PENDING_SUPER_CLICK_KEY,
		TOTAL_CLICKS_KEY,
		TOTAL_COINS_EARNED_KEY,
		CLICK_UPGRADES_COUNT_KEY,
		SKINS_BOUGHT_COUNT_KEY,
		ACHIEVEMENTS_BUTTON_UNLOCKED_KEY,
		ACHIEVEMENTS_COUNTERS_KEY,
		ACHIEVEMENTS_SEEN_UNLOCKED_KEY,
		ACHIEVEMENTS_STATE_KEY,
		THEME_KEY,
	];

	function toFiniteNumber(value, fallback = 0) {
		const n = Number(value);
		return Number.isFinite(n) ? n : fallback;
	}

	function toInt(value) {
		return Math.floor(Number(value) || 0);
	}

	function getStorageItem(key) {
		try {
			return localStorage.getItem(key);
		} catch {
			return null;
		}
	}

		function setStorageItem(key, value) {
			try {
				localStorage.setItem(key, String(value));
			} catch {
				// localStorage может быть недоступен (privacy mode / quota / sandbox)
			}
		}

		function safePercent(value, goal) {
			const safeGoal = Math.max(1, toFiniteNumber(goal, 1));
			const pct = (Math.max(0, toFiniteNumber(value, 0)) / safeGoal) * 100;
			return Math.max(0, Math.min(100, pct));
		}

		function getAchievementStatusText(state) {
			if (state === 'series_done') return currentLanguage === 'en' ? 'Fully completed' : 'Полностью завершено';
			if (state === 'step_ready') return currentLanguage === 'en' ? 'Ready for reward' : 'Награда доступна';
			if (state === 'step_progress') return currentLanguage === 'en' ? 'In progress' : 'В процессе';
			return currentLanguage === 'en' ? 'Unavailable' : 'Недоступно';
		}

		function formatAchievementReward(step) {
			if (!step) return '';
			const parts = [];
			const coinText = currentLanguage === 'en' ? `+${step.reward} coins` : `+${step.reward} монет`;
			parts.push(coinText);
			if (step.bonus) {
				parts.push(currentLanguage === 'en' ? getAchievementText(step.legacyAchievement, 'bonus') : step.bonus);
			}
			return parts.join(currentLanguage === 'en' ? ' + ' : ' + ');
		}

		function getSeriesCurrentStep(series) {
			if (!series || !Array.isArray(series.steps) || series.steps.length === 0) return null;
			const idx = Math.max(0, Math.min(series.currentStepIndex, series.steps.length - 1));
			return series.steps[idx];
		}

		function getAchievementProgressValue(achievement) {
			const purchasedRobots = Math.max(0, robotCount - ACHIEVEMENT_BASE_ROBOTS);
			const purchasedClickUpgrades = Math.max(0, clickUpgradesCount - ACHIEVEMENT_BASE_CLICK_UPGRADES);
			const ownedSkinsWithoutDefault = Math.max(0, ownedSkinIds.size - ACHIEVEMENT_BASE_SKINS);
			switch (achievement.type) {
				case 'clicks': return totalClicks;
				case 'totalCoins': return totalCoinsEarned;
				case 'robots': return purchasedRobots;
				case 'clickUpgrades': return purchasedClickUpgrades;
				case 'clickPower': return Math.floor(getEffectiveClickPower());
				case 'level': return Math.max(0, level - ACHIEVEMENT_BASE_LEVEL);
				case 'skins': return ownedSkinsWithoutDefault;
				case 'skinsEquipped': return ownedSkinsWithoutDefault;
				case 'skinsBought': return skinsBoughtCount;
				case 'boosts': return Object.values(boostUsageCount).reduce((sum, n) => sum + Math.max(0, Math.floor(toFiniteNumber(n, 0))), 0);
				case 'boostCombo': return achievementCounters.boostComboBest;
				case 'boostTime': return Math.floor(achievementCounters.boostTime);
				case 'boostTypes': return boostTypesUsed.size;
				case 'achievements': return achievements.filter((item) => item.id !== 75 && item.claimed).length;
				default: return 0;
			}
		}

		function checkSpecialAchievementCompletion(achievement) {
			if (achievement.id === 75) return achievements.filter((item) => item.id !== 75 && item.unlocked).length >= 79;
			if (achievement.id === 76) return totalCoinsEarned >= 10000000 && Math.max(0, robotCount - ACHIEVEMENT_BASE_ROBOTS) >= 500;
			if (achievement.id === 77) return getEffectiveClickPower() >= 500 && level >= 45;
			if (achievement.id === 78) return Math.max(0, ownedSkinIds.size - ACHIEVEMENT_BASE_SKINS) >= 16 && level >= 35;
			if (achievement.id === 79) return totalClicks >= 5000000 && Math.max(0, robotCount - ACHIEVEMENT_BASE_ROBOTS) >= 1000;
			if (achievement.id === 80) return totalCoinsEarned >= 500000000 && achievements.filter((item) => item.id < 80 && item.unlocked).length === 79;
			return null;
		}

		function applyAchievementRewardEffects(step) {
			const bonusText = String(step?.bonus || '').toLowerCase();
			if (bonusText.includes('скин') || bonusText.includes('skin')) {
				const available = skins.filter((skin) => !ownedSkinIds.has(skin.id));
				if (available.length > 0) ownedSkinIds.add(available[0].id);
			}
			if (bonusText.includes('% навсегда') || bonusText.includes('% forever')) {
				const pct = toFiniteNumber(String(step.bonus).replace(/[^0-9.]/g, ''), 0);
				if (pct > 0) permanentCoinBonusMultiplier *= (1 + (pct / 100));
			}
			if (bonusText.includes('% роботы') || bonusText.includes('robot')) {
				const pct = toFiniteNumber(String(step.bonus).replace(/[^0-9.]/g, ''), 0);
				if (pct > 0) permanentRobotBonusMultiplier *= (1 + (pct / 100));
			}
			if (bonusText.includes('процессор') || bonusText.includes('click power')) {
				const add = toFiniteNumber(String(step.bonus).replace(/[^0-9.]/g, ''), 0);
				if (add > 0) permanentClickPowerBonus += add;
			}
		}

		function updatePermanentBonusesFromAchievements() {
			permanentCoinBonusMultiplier = 1;
			permanentRobotBonusMultiplier = 1;
			permanentClickPowerBonus = 0;
			achievements.forEach((achievement) => {
				if (!achievement.claimed) return;
				const stepRef = achievementStepByLegacyId.get(achievement.id);
				if (!stepRef) return;
				const series = achievementSeriesById.get(stepRef.seriesId);
				if (!series) return;
				const step = series.steps.find((it) => it.id === stepRef.stepId);
				if (!step) return;
				applyAchievementRewardEffects(step);
			});
		}

		function syncAchievementsAttentionEffect() {
			if (!achievementsBtn) return;
			const hasNewAchievement = achievements.some((achievement) => (
				achievement.unlocked &&
				!achievement.claimed &&
				!seenUnlockedAchievementIds.has(achievement.id)
			));
			achievementsBtn.classList.toggle('has-new-achievement', hasNewAchievement);
		}

		function markUnlockedAchievementsAsSeen() {
			achievements.forEach((achievement) => {
				if (achievement.unlocked) seenUnlockedAchievementIds.add(achievement.id);
			});
			syncAchievementsAttentionEffect();
		}

		function updateAchievementsState() {
			achievements.forEach((achievement) => {
				const special = checkSpecialAchievementCompletion(achievement);
				const isDone = special === null ? getAchievementProgressValue(achievement) >= achievement.goal : special;
				achievement.unlocked = Boolean(isDone);
			});

			achievementSeries.forEach((series) => {
				let currentIndex = series.steps.findIndex((step) => !step.legacyAchievement.claimed);
				if (currentIndex === -1) currentIndex = series.steps.length - 1;
				series.currentStepIndex = Math.max(0, currentIndex);
				series.steps.forEach((step) => {
					step.claimed = Boolean(step.legacyAchievement.claimed);
					step.unlocked = Boolean(step.legacyAchievement.unlocked);
				});
				series.completed = series.steps.every((step) => step.claimed || step.unlocked);
				series.fullyCompleted = series.steps.every((step) => step.claimed);
			});
			syncAchievementsAttentionEffect();
		}

		function applyAchievementReward(achievement) {
			if (achievement.claimed) return;
			achievement.claimed = true;
			coins = toInt(coins + Math.max(0, toFiniteNumber(achievement.reward, 0)));
			updatePermanentBonusesFromAchievements();
		}

		function claimAchievementRewardById(achievementId) {
			const rawId = String(achievementId);
			const series = achievementSeriesById.get(rawId);
			if (series) {
				updateAchievementsState();
				if (series.fullyCompleted) return;
				const step = getSeriesCurrentStep(series);
				if (!step || !step.legacyAchievement.unlocked || step.legacyAchievement.claimed) return;
				applyAchievementReward(step.legacyAchievement);
				updateAchievementsState();
				updateUI();
				saveGame();
				renderAchievements();
				return;
			}
			const parsedId = Number(achievementId);
			const achievement = achievements.find((item) => item.id === parsedId);
			if (!achievement) return;
			updateAchievementsState();
			if (!achievement.unlocked || achievement.claimed) return;
			applyAchievementReward(achievement);
			updateUI();
			saveGame();
			renderAchievements();
		}

		function renderAchievements() {
			if (!achievementsList) return;
			updateAchievementsState();
			const fullyDone = achievementSeries.filter((item) => item.fullyCompleted).length;
			const percent = safePercent(fullyDone, achievementSeries.length);
			if (achievementsSummary) {
				achievementsSummary.textContent = currentLanguage === 'en'
					? `Series completed: ${fullyDone} • Progress ${percent.toFixed(1)}%`
					: `Завершено серий: ${fullyDone} • Прогресс ${percent.toFixed(1)}%`;
			}
			if (achievementsOverallFill) achievementsOverallFill.style.width = `${percent.toFixed(1)}%`;

			const prepared = achievementSeries.map((series) => {
				const step = getSeriesCurrentStep(series);
				const currentValue = step ? getAchievementProgressValue(step.legacyAchievement) : 0;
				const stepPercent = step ? safePercent(currentValue, step.goal) : 100;
				const state = series.fullyCompleted ? 'series_done' : (step && step.unlocked && !step.claimed ? 'step_ready' : (currentValue > 0 ? 'step_progress' : 'locked'));
				return { series, step, currentValue, stepPercent, state };
			}).sort((a, b) => {
				if (a.series.fullyCompleted !== b.series.fullyCompleted) return a.series.fullyCompleted ? 1 : -1;
				if (a.state === 'step_ready' && b.state !== 'step_ready') return -1;
				if (b.state === 'step_ready' && a.state !== 'step_ready') return 1;
				return b.stepPercent - a.stepPercent;
			});

			achievementsList.textContent = '';
			prepared.forEach(({ series, step, currentValue, stepPercent, state }) => {
				const statusText = getAchievementStatusText(state);
				const statusClass = state === 'series_done'
					? 'achievement-card__status--series-done'
					: state === 'step_ready'
						? 'achievement-card__status--done'
						: state === 'step_progress'
							? 'achievement-card__status--progress'
							: 'achievement-card__status--locked';
				const rewardText = formatAchievementReward(step);
				const claimDisabled = state !== 'step_ready';
				const claimText = series.fullyCompleted
					? (currentLanguage === 'en' ? 'Completed' : 'Серия завершена')
					: (currentLanguage === 'en' ? 'Claim reward' : 'Забрать награду');
				const claimClass = series.fullyCompleted
					? 'achievement-card__claim-btn is-claimed'
					: claimDisabled ? 'achievement-card__claim-btn is-locked' : 'achievement-card__claim-btn is-ready';
				const progressText = step
					? (currentLanguage === 'en' ? `${Math.min(currentValue, step.goal)} / ${step.goal}` : `${Math.min(currentValue, step.goal)} / ${step.goal}`)
					: '';

				const card = document.createElement('article');
				card.className = `achievement-card ${series.fullyCompleted ? 'achievement-card--series-done' : (state === 'locked' ? 'achievement-card--locked' : '')}`;

				const iconEl = document.createElement('div');
				iconEl.className = 'achievement-card__icon';
				iconEl.textContent = series.icon;

				const mainEl = document.createElement('div');
				mainEl.className = 'achievement-card__main';

				const topLineEl = document.createElement('div');
				topLineEl.className = 'achievement-card__topline';

				const nameEl = document.createElement('h3');
				nameEl.className = 'achievement-card__name';
				nameEl.textContent = `${getAchievementSeriesText(series, step, 'name')} — `;

				const statusEl = document.createElement('span');
				statusEl.className = `achievement-card__status ${statusClass}`;
				statusEl.textContent = statusText;
				nameEl.appendChild(statusEl);

				const controlsEl = document.createElement('div');
				controlsEl.className = 'achievement-card__controls';

				const claimBtnEl = document.createElement('button');
				claimBtnEl.type = 'button';
				claimBtnEl.className = claimClass;
				claimBtnEl.dataset.achievementId = series.id;
				claimBtnEl.textContent = claimText;
				claimBtnEl.disabled = claimDisabled;

				const rewardEl = document.createElement('div');
				rewardEl.className = 'achievement-card__reward';
				rewardEl.textContent = rewardText;

				controlsEl.appendChild(claimBtnEl);
				controlsEl.appendChild(rewardEl);
				topLineEl.appendChild(nameEl);
				topLineEl.appendChild(controlsEl);

				const descEl = document.createElement('p');
				descEl.className = 'achievement-card__desc';
				descEl.textContent = step ? getAchievementSeriesText(series, step, 'desc') : '';

				const progressMetaEl = document.createElement('p');
				progressMetaEl.className = 'achievement-card__progress-meta';
				progressMetaEl.textContent = progressText;

				const progressEl = document.createElement('div');
				progressEl.className = 'achievement-card__progress';
				const progressFillEl = document.createElement('div');
				progressFillEl.className = 'achievement-card__progress-fill';
				progressFillEl.style.width = `${(series.fullyCompleted ? 100 : stepPercent).toFixed(1)}%`;
				progressEl.appendChild(progressFillEl);

				mainEl.appendChild(topLineEl);
				mainEl.appendChild(descEl);
				mainEl.appendChild(progressMetaEl);
				card.appendChild(iconEl);
				card.appendChild(mainEl);
				card.appendChild(progressEl);
				achievementsList.appendChild(card);
			});
		}

		function unlockAchievementsButton() {
			if (!achievementsBtn || achievementsButtonUnlocked) return;
			achievementsButtonUnlocked = true;
			achievementsBtn.classList.remove('locked');
			achievementsBtn.classList.add('is-unlocked', 'unlocking');
			setTimeout(() => {
				if (achievementsBtn) achievementsBtn.classList.remove('unlocking');
			}, 750);
		}

		function restoreAchievementsButtonState() {
			if (!achievementsBtn) return;
			if (achievementsButtonUnlocked) {
				achievementsBtn.classList.remove('locked');
				achievementsBtn.classList.add('is-unlocked');
			} else {
				achievementsBtn.classList.add('locked');
				achievementsBtn.classList.remove('is-unlocked', 'unlocking');
			}
		}

		function openAchievementsModal() {
			if (!achievementsModal) return;
			closeAllFeatureModals();
			unlockAchievementsButton();
			markUnlockedAchievementsAsSeen();
			renderAchievements();
			achievementsModal.classList.remove('hidden');
		markGameplayStop();
		syncBannerForScreen('achievements');
			updateUI();
			saveGame();
		}

		function closeAchievementsModal() {
			if (!achievementsModal) return;
			achievementsModal.classList.add('hidden');
		syncBannerForScreen('game');
		syncGameplayState();
		}

	// ТЕМА =========================
	function normalizeTheme(value) {
		const v = String(value || '').toLowerCase().trim();
		if (v === 'light') return 'light';
		if (v === 'dark') return 'dark';
		if (v === 'auto') return 'auto';
		return 'dark';
	}

	function applyTheme(theme) {
		const t = normalizeTheme(theme);

		document.body.classList.remove('light_theme', 'auto', 'dark'); // снимаем старые классы

		if (t === 'light') {
			document.body.classList.add('light_theme');
		} else if (t === 'auto') {
			document.body.classList.add('auto');
		} else {
			document.body.classList.add('dark'); // default = dark
		}
	}

	function setSelectToTheme(theme) {
		if (!themeSelect) return;
		const t = normalizeTheme(theme);
		const options = Array.from(themeSelect.options); // Подбираем option по data-theme
		const wanted = t === 'auto' ? 'auto' : t;
		const opt = options.find((o) => (o.dataset.theme || '').toLowerCase() === wanted);
		if (opt) {
			themeSelect.value = opt.value; // value у option без value = её текст
		}
	}


	if (languageSelect) {
		languageSelect.addEventListener('change', () => {
			applyLanguage(languageSelect.value || 'ru', { save: true, userSelected: true });
		});
	}

	const savedLanguage = normalizeLanguage(getStorageItem(LANGUAGE_KEY));
	const shouldUseManualLanguage = isLanguageManuallySelected();
	applyLanguage(shouldUseManualLanguage ? savedLanguage : 'ru', { save: false });

	// 1) При загрузке — вспомнить тему или поставить тёмную по умолчанию
	const savedTheme = getStorageItem(THEME_KEY) || DEFAULT_THEME;
	applyTheme(savedTheme);
	setSelectToTheme(savedTheme);

	// 2) При смене select — применить и сохранить
	if (themeSelect) {
		themeSelect.addEventListener('change', () => {
			const selectedOption = themeSelect.options[themeSelect.selectedIndex];
			const selectedTheme = selectedOption?.dataset?.theme || DEFAULT_THEME;

			applyTheme(selectedTheme);
			setStorageItem(THEME_KEY, normalizeTheme(selectedTheme));
			saveGame();
		});
	}

	// ЗВУК =========================
	function clamp01(value) {
		const num = toFiniteNumber(value, 1);
		return Math.max(0, Math.min(1, num));
	}

	function createGameSound(primarySrc, fallbackSrc = '') {
		const audio = new Audio();
		let fallbackUsed = false;

		if (fallbackSrc) {
			audio.addEventListener(
				'error',
				() => {
					if (fallbackUsed) return;
					fallbackUsed = true;
					audio.src = fallbackSrc;
					audio.load();
				},
				{ once: true }
			);
		}

		audio.preload = 'auto';
		audio.volume = globalVolume;
		audio.src = primarySrc;
		return audio;
	}

	const sounds = {
		click: createGameSound('sounds/click.wav', 'click.wav'),
		start: createGameSound('sounds/start.wav', 'start.wav'),
		menu: createGameSound('sounds/menu.wav', 'menu.wav'),
	};

	function applyGlobalVolume(value) {
		globalVolume = clamp01(value);

		Object.values(sounds).forEach((audio) => {
			audio.volume = globalVolume;
		});

		if (volumeSlider) {
			volumeSlider.value = String(Math.round(globalVolume * 100));
		}
	}

	function playSound(name) {
		const audio = sounds[name];
		if (!audio || globalVolume <= 0) return;

		try {
			audio.pause();
			audio.currentTime = 0;
			audio.volume = globalVolume;
		} catch {
			// Некоторые браузеры могут бросить исключение,
			// если аудио ещё не готово — просто игнорируем.
		}

		const playPromise = audio.play();

		if (playPromise && typeof playPromise.catch === 'function') {
			playPromise.catch(() => {
				// Игнорируем NotAllowedError / AbortError,
				// если браузер временно не дал воспроизвести звук.
			});
		}
	}

	function initVolumeControl() {
		if (volumeSlider) {
			volumeSlider.min = '0';
			volumeSlider.max = '100';
			volumeSlider.step = '1';
		}

		const savedVolume = getStorageItem(VOLUME_KEY);

		if (savedVolume !== null) {
			applyGlobalVolume(savedVolume);
		} else if (volumeSlider) {
			applyGlobalVolume(Number(volumeSlider.value || 100) / 100);
		} else {
			applyGlobalVolume(DEFAULT_VOLUME);
		}

		if (!volumeSlider) return;

		volumeSlider.addEventListener('input', () => {
			applyGlobalVolume(Number(volumeSlider.value) / 100);
			setStorageItem(VOLUME_KEY, globalVolume);
		});

		volumeSlider.addEventListener('change', () => {
			setStorageItem(VOLUME_KEY, globalVolume);
		});
	}

	// Яркость =========================
	function clamp(n, min, max) {
		const num = toFiniteNumber(n, min);
		return Math.max(min, Math.min(max, num));
	}

	function applyBrightness(value, options = {}) {
		const { syncSlider = true, syncState = true } = options;
		const v = clamp(value, BR_MIN, BR_MAX);

		if (syncState) {
			brightness = v;
		}

		if (syncSlider && brightnessRange) {
			brightnessRange.value = String(v);
		}

		const factor = v / BR_MAX; // 20..80 => 0.25..1.0
		document.documentElement.style.setProperty('--screen-brightness', String(factor));
		return v;
	}

	// Движение ползунка яркости
	if (brightnessRange) {
		brightnessRange.addEventListener('input', () => {
			applyBrightness(brightnessRange.value);
			saveGame(); // сохраняем сразу
		});
	}


	function isMainGameplayActive() {
		const gameVisible = menuScreen ? menuScreen.classList.contains('hidden') : true;
		return gameVisible && !document.querySelector('.menu:not(.hidden):not(#menu)');
	}

	function syncGameplayState() {
		if (isGamePaused || isAdShowing || !isMainGameplayActive()) {
			markGameplayStop();
			return;
		}
		markGameplayStart();
	}


async function showSafeBanner() {
	if (!sdkReady || !ysdk?.adv?.showBannerAdv) return false;

	try {
		let status = null;

		if (typeof ysdk.adv.getBannerAdvStatus === 'function') {
			status = await ysdk.adv.getBannerAdvStatus();
		}

		if (status?.stickyAdvIsShowing) {
			return true;
		}

		if (status?.canShow === false) {
			return false;
		}

		await ysdk.adv.showBannerAdv();
		return true;
	} catch (error) {
		console.warn('[Robo Clicker] showBannerAdv failed', error);
		return false;
	}
}

function hideSafeBanner() {
	if (!sdkReady || !ysdk?.adv?.hideBannerAdv) return;
	try {
		ysdk.adv.hideBannerAdv();
	} catch (error) {
		console.warn('[Robo Clicker] hideBannerAdv failed', error);
	}
}

function syncBannerForScreen(screenName) {
	if (!sdkReady || isAdShowing) return;

	// Баннер показываем только там, где он действительно нужен
	if (['boosts', 'skins'].includes(screenName)) {
		void showSafeBanner();
	} else {
		hideSafeBanner();
	}
}

function pauseGameplayContext(options = {}) {
	const wasGameplayActive = !isGamePaused && isMainGameplayActive();

	adPauseState = {
		wasGameplayActive,
		reason: options.reason || 'external',
	};

	isGamePaused = true;
	pauseAllSounds?.();
	stopRobotIncomeTimer?.();
	markGameplayStop();
}

function resumeGameplayContext() {
	const shouldResumeGameplay = adPauseState?.wasGameplayActive === true;

	adPauseState = null;
	isGamePaused = false;

	if (shouldResumeGameplay && robotIncomePerSecond > 0) {
		startRobotIncomeTimer?.();
	}

	syncGameplayState();
}

function showInterstitialAd(options = {}) {
	// Убрали спорную задержку 450 мс.
	// Оставляем только защиту от показа сразу после игрового клика.
	const minClickToAdDelayMs = 280;
	const sinceRobotClickMs = Date.now() - lastRobotClickAt;

	if (sinceRobotClickMs < minClickToAdDelayMs) {
		options.onClose?.(false);
		return;
	}

	if (!sdkReady || !ysdk?.adv?.showFullscreenAdv || isAdShowing) {
		options.onClose?.(false);
		return;
	}

	isAdShowing = true;
	pauseGameplayContext({ reason: 'interstitial' });

	try {
		ysdk.adv.showFullscreenAdv({
			callbacks: {
				onOpen: () => {
					options.onOpen?.();
				},
				onClose: (wasShown) => {
					isAdShowing = false;
					resumeGameplayContext();
					options.onClose?.(Boolean(wasShown));
				},
				onError: (error) => {
					isAdShowing = false;
					resumeGameplayContext();
					options.onError?.(error);
				},
				onOffline: () => {
					isAdShowing = false;
					resumeGameplayContext();
					options.onOffline?.();
				},
			},
		});
	} catch (error) {
		console.warn('[Robo Clicker] showFullscreenAdv failed', error);
		isAdShowing = false;
		resumeGameplayContext();
		options.onError?.(error);
		options.onClose?.(false);
	}
}

	function grantRewardByType(rewardType) {
		if (rewardType === 'boost_free') {
			const available = boosts.filter((boost) => canBuyBoost(boost));
			const targetBoost = available[Math.floor(Math.random() * available.length)] || boosts[0];
			if (targetBoost) {
				applyBoostEffect(targetBoost);
				targetBoost.purchases = toInt(targetBoost.purchases + 1);
				boostLevels[targetBoost.id] = toInt(targetBoost.purchases);
				boostUsageCount[targetBoost.id] = toInt(boostUsageCount[targetBoost.id]) + 1;
			}
		}
		if (rewardType === 'skin_random') {
			const availableSkins = skins.filter((skin) => !ownedSkinIds.has(skin.id));
			if (availableSkins.length > 0) {
				const randomSkin = availableSkins[Math.floor(Math.random() * availableSkins.length)];
				ownedSkinIds.add(randomSkin.id);
				selectedSkinId = randomSkin.id;
				skinsBoughtCount += 1;
			}
		}
		if (rewardType === 'coins_bonus') {
			const rewardCoins = Math.max(100, toInt(getEffectiveCoinsPerClick() * 100));
			coins = toInt(coins + rewardCoins);
			totalCoinsEarned = toInt(totalCoinsEarned + rewardCoins);
		}
		updateUI();
		saveGame();
	}

function showRewardedAd(rewardType) {
	if (!sdkReady || !ysdk?.adv?.showRewardedVideo || isAdShowing) return;

	isAdShowing = true;
	pauseGameplayContext({ reason: `reward:${rewardType}` });

	try {
		ysdk.adv.showRewardedVideo({
			callbacks: {
				onOpen: () => {},
				onRewarded: () => {
					grantRewardByType(rewardType);
					updateUI?.();
					renderBoostsUI?.();
					renderSkinsGrid?.();
					saveGame?.();
				},
				onClose: () => {
					isAdShowing = false;
					resumeGameplayContext();
				},
				onError: (error) => {
					console.warn('[Robo Clicker] showRewardedVideo failed', error);
					isAdShowing = false;
					resumeGameplayContext();
				},
			},
		});
	} catch (error) {
		console.warn('[Robo Clicker] showRewardedVideo failed', error);
		isAdShowing = false;
		resumeGameplayContext();
	}
}

	const tvModeEnabled = /smart-tv|smarttv|hbbtv|tizen|web0s|webos|googletv|appletv|android tv/i.test(navigator.userAgent);
	let tvFocusIndex = 0;
	let lastRobotClickAt = 0;
	let adPauseState = null;

	function getTvFocusable() {
		const root = document.querySelector('.menu:not(.hidden), #game, .menu:not(.hidden) .menu-card');
		const scope = root || document;
		return Array.from(scope.querySelectorAll('button:not([disabled]), [role="button"]:not([aria-disabled="true"]), select')).filter((el) => el.offsetParent !== null);
	}

	function syncTvFocus(direction = 1) {
		if (!tvModeEnabled) return;
		const items = getTvFocusable();
		if (!items.length) return;
		tvFocusIndex = (tvFocusIndex + direction + items.length) % items.length;
		items[tvFocusIndex].focus();
	}

	function initTvControls() {
		if (!tvModeEnabled) return;
		document.body.classList.add('tv-mode');
		window.addEventListener('keydown', (event) => {
			if (['ArrowUp', 'ArrowLeft'].includes(event.key)) {
				event.preventDefault();
				syncTvFocus(-1);
			}
			if (['ArrowDown', 'ArrowRight'].includes(event.key)) {
				event.preventDefault();
				syncTvFocus(1);
			}
			if (event.key === 'Enter') {
				event.preventDefault();
				document.activeElement?.click?.();
			}
			if (event.key === 'Escape' || event.key === 'Backspace') {
				event.preventDefault();
				if (!closeAllFeatureModals()) goToMenu();
			}
		});
	}

	setAppHooks({
		onPlatformLanguage: (lang) => {
			if (!lang) return;
			if (isLanguageManuallySelected()) return;
			const normalized = normalizeLanguage(lang);
			applyLanguage(normalized, { save: true, userSelected: false });
		},
		onExternalPause: pauseGameplayContext,
		onExternalResume: resumeGameplayContext,
		onSDKReady: () => {
			notifyLoadingReady();
			syncGameplayState();
		},
	});

	if (rewardFreeBoostBtn) {
		rewardFreeBoostBtn.addEventListener('click', () => showRewardedAd('boost_free'));
	}

	if (rewardRandomSkinBtn) {
		rewardRandomSkinBtn.addEventListener('click', () => showRewardedAd('skin_random'));
	}

	// Game Start
	function startGame() {
		if (!menuScreen) return;
		menuScreen.classList.add('hidden');
		syncBannerForScreen('game');
		syncGameplayState();
	}

	// Функция возврата в меню
	function goToMenu() {
		saveGame();
		if (!menuScreen) return;
		menuScreen.classList.remove('hidden');
		markGameplayStop();
		syncBannerForScreen('menu');
	}

	if (startBtn) {
		startBtn.addEventListener('click', () => {
			playSound('start');
			startGame();
		});
	}
	markGameplayStop();

	if (backBtn) {
		backBtn.addEventListener('click', () => {
			showInterstitialAd({ onClose: () => goToMenu() });
		});
	}

	if (aboutBtn && aboutScreen) {
		aboutBtn.onclick = () => {
			aboutScreen.classList.remove('hidden'); // об игре
		markGameplayStop();
		syncBannerForScreen('about');
		};
	}

	if (closeAbout && aboutScreen) {
		closeAbout.onclick = () => {
			aboutScreen.classList.add('hidden'); // крестик об игре
		syncBannerForScreen('menu');
		syncGameplayState();
		};
	}

	if (aboutGoBtn && aboutScreen) {
		aboutGoBtn.addEventListener('click', () => {
			playSound('start');
			aboutScreen.classList.add('hidden');
			goToMenu();
			syncBannerForScreen('menu');
		});
	}

	if (settingsBtn && settingsScreen) {
		settingsBtn.onclick = () => {
			settingsScreen.classList.remove('hidden'); // Настройки
			markGameplayStop();
			syncBannerForScreen('settings');
		};
	}

	if (closeSetting && settingsScreen) {
		closeSetting.onclick = () => {
			settingsScreen.classList.add('hidden'); // Закрыть настройки
			syncBannerForScreen('menu');
			syncGameplayState();
		};
	}

	
	// --- СКИНЫ: модалка, покупка, выбор и рендер карточек ---
// --- СКИНЫ: модалка, покупка, выбор и рендер карточек ---
function getRarityLabel(rarity) {
	const rarityLabels = {
		common: { ru: 'Обычный', en: 'Common' },
		uncommon: { ru: 'Необычный', en: 'Uncommon' },
		rare: { ru: 'Редкий', en: 'Rare' },
		ultra: { ru: 'Ультраредкий', en: 'Ultra Rare' },
	};

	return rarityLabels[rarity]?.[currentLanguage] || rarityLabels.common[currentLanguage] || rarityLabels.common.ru;
}

	function updateClickObjectSkin() {
		if (!clickObject) return;
		const currentSkin = skinById.get(selectedSkinId) || skinById.get(DEFAULT_SKIN_ID);
		clickObject.textContent = currentSkin ? currentSkin.icon : '🤖';
	}

	function getSkinButtonState(skin) {
		const isOwned = ownedSkinIds.has(skin.id) || skin.price === 0;
		if (skin.id === selectedSkinId) {
			return {
				text: currentLanguage === 'en' ? '✓ Equipped' : '✓ Надето',
				className: 'is-equipped',
				disabled: true,
				title: currentLanguage === 'en' ? 'Skin is already equipped' : 'Скин уже надет',
			};
		}

		if (isOwned) {
			return {
				text: currentLanguage === 'en' ? 'Owned' : 'Куплено',
				className: 'is-owned',
				disabled: false,
				title: currentLanguage === 'en' ? 'Click to equip skin' : 'Нажмите, чтобы надеть скин',
			};
		}

		const isLocked = coins < skin.price;

		return {
			text: currentLanguage === 'en' ? `Buy for ${skin.price} 💰` : `Купить за ${skin.price} 💰`,
			className: isLocked ? 'is-locked' : '',
			disabled: isLocked,
			title: isLocked ? (currentLanguage === 'en' ? 'Not enough coins to buy' : 'Недостаточно монет для покупки') : (currentLanguage === 'en' ? 'Click to buy skin' : 'Нажмите, чтобы купить скин'),
		};
	}

	function renderSkinsGrid() {
		if (!skinsGrid) return;
		skinsGrid.textContent = '';

		skins.forEach((skin) => {
				const buttonState = getSkinButtonState(skin);
				const rarityLabel = getRarityLabel(skin.rarity);
				const card = document.createElement('article');
				card.className = `skin-card skin-card--${skin.rarity}`;
				if (buttonState.className === 'is-locked') {
					card.classList.add('skin-card--locked');
				}

				const icon = document.createElement('div');
				icon.className = 'skin-card__icon';
				icon.setAttribute('aria-hidden', 'true');
				icon.textContent = skin.icon;

				const title = document.createElement('h3');
				title.className = 'skin-card__name';
				title.textContent = getSkinNameById(skin.id, skin.name);

				const rarity = document.createElement('span');
				rarity.className = 'skin-card__rarity';
				rarity.textContent = rarityLabel;

				const action = document.createElement('button');
				action.type = 'button';
				action.className = 'skin-card__action';
				if (buttonState.className) action.classList.add(buttonState.className);
				action.dataset.skinId = String(skin.id);
				action.title = buttonState.title;
				action.setAttribute('aria-label', buttonState.title);
				action.disabled = buttonState.disabled;
				action.textContent = buttonState.text;

			card.append(icon, title, rarity, action);
			skinsGrid.appendChild(card);
		});
	}

	function openSkinsModal() {
		if (!skinsModal) return;
		closeAllFeatureModals();
		renderSkinsGrid();
		skinsModal.classList.remove('hidden');
		markGameplayStop();
		syncBannerForScreen('skins');
	}

	function closeSkinsModal() {
		if (!skinsModal) return;
		skinsModal.classList.add('hidden');
		syncBannerForScreen('game');
		syncGameplayState();
	}

	if (skinsBtn) {
		skinsBtn.addEventListener('click', () => {
			openSkinsModal();
		});
	}

	if (closeSkinsBtn) {
		closeSkinsBtn.addEventListener('click', () => {
			closeSkinsModal();
		});
	}

	if (skinsModal) {
		skinsModal.addEventListener('click', (event) => {
			if (event.target === skinsModal) {
				closeSkinsModal();
			}
		});
	}

	if (skinsGrid) {
		skinsGrid.addEventListener('click', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) return;

			const actionBtn = target.closest('.skin-card__action');
			if (!actionBtn) return;

			const skinId = Number(actionBtn.dataset.skinId);
			const skin = skinById.get(skinId);
			if (!skin) return;

			const isOwned = ownedSkinIds.has(skin.id) || skin.price === 0;

			if (!isOwned) {
				if (coins < skin.price) return;
				coins = toInt(coins - skin.price);
				skinsBoughtCount += 1;
				ownedSkinIds.add(skin.id);
				selectedSkinId = skin.id;
			} else {
				selectedSkinId = skin.id;
			}

			updateClickObjectSkin();
			updateUI();
			saveGame();
			renderSkinsGrid();
		});
	}

	// Временные кликабельные обработчики для остальных кнопок панели

		if (achievementsBtn) {
			achievementsBtn.addEventListener('click', openAchievementsModal);
		}

		if (closeAchievementsBtn) {
			closeAchievementsBtn.addEventListener('click', closeAchievementsModal);
		}

		if (achievementsModal) {
			achievementsModal.addEventListener('click', (event) => {
				if (event.target === achievementsModal) {
					closeAchievementsModal();
				}
			});
		}

		if (achievementsList) {
			achievementsList.addEventListener('click', (event) => {
				const target = event.target;
				if (!(target instanceof HTMLElement)) return;
				const claimButton = target.closest('.achievement-card__claim-btn');
				if (!claimButton) return;
				const achievementId = claimButton.dataset.achievementId;
				if (!achievementId) return;
				claimAchievementRewardById(achievementId);
			});
		}

	function closeAllFeatureModals() {
		const hadOpenModal = Boolean(document.querySelector('#skins-modal:not(.hidden), #boosts-modal:not(.hidden), #achievements-modal:not(.hidden), #stats-modal:not(.hidden)'));
		closeSkinsModal();
		closeBoostsModal();
		closeAchievementsModal();
		closeStatsModal();
		return hadOpenModal;
	}

	function openStatsModal() {
		if (!statsModal) return;
		closeAllFeatureModals();
		renderStatistics();
		statsModal.classList.remove('hidden');
		markGameplayStop();
		syncBannerForScreen('stats');
	}

	function closeStatsModal() {
		if (!statsModal) return;
		statsModal.classList.add('hidden');
		syncBannerForScreen('game');
		syncGameplayState();
	}

	if (statsBtn) {
		statsBtn.addEventListener('click', openStatsModal);
	}

	if (closeStatsBtn) {
		closeStatsBtn.addEventListener('click', closeStatsModal);
	}

	if (statsModal) {
		statsModal.addEventListener('click', (event) => {
			if (event.target === statsModal) {
				closeStatsModal();
			}
		});
	}

	function getBoostsUpgradedCount() {
		// Считаем, сколько бустов было улучшено/куплено хотя бы один раз.
		// Берём только реальные значения из boostLevels, без отдельного счётчика.
		return Object.values(boostLevels).reduce((count, value) => {
			return count + (Math.max(0, Math.floor(toFiniteNumber(value, 0))) > 0 ? 1 : 0);
		}, 0);
	}

	function getTotalBoostUsageCount() {
		// Сумма использований всех бустов из накопительного объекта boostUsageCount.
		return Object.values(boostUsageCount).reduce((sum, value) => {
			return sum + Math.max(0, Math.floor(toFiniteNumber(value, 0)));
		}, 0);
	}

	function getActiveBoostsCount() {
		// Считаем только бусты, которые реально активны на текущий момент,
		// чтобы статистика не показывала уже истёкшие записи.
		const now = Date.now();
		return Object.values(activeBoosts).reduce((count, boostData) => {
			return count + (toFiniteNumber(boostData?.endAt, 0) > now ? 1 : 0);
		}, 0);
	}

	function getSelectedSkinName() {
		const selectedSkin = skinById.get(selectedSkinId) || skinById.get(DEFAULT_SKIN_ID);
		return selectedSkin ? getSkinNameById(selectedSkin.id, selectedSkin.name) : (currentLanguage === 'en' ? 'Not selected' : 'Не выбран');
	}

	function renderStatistics() {
		if (!statsModal) return;

		const levelRequiredClicks = requiredClicksForLevel(level);
		const safeLevelClicks = Math.max(0, Math.floor(toFiniteNumber(levelClicks, 0)));
		const levelRemainingClicks = Math.max(0, levelRequiredClicks - safeLevelClicks);
		const unlockedAchievementsCount = achievementSeries.filter((item) => item.fullyCompleted === true).length;
		const claimedAchievementsCount = achievements.filter((item) => item.claimed === true).length;

		if (statsEls.coinsCurrent) statsEls.coinsCurrent.textContent = String(Math.floor(toFiniteNumber(coins, 0)));
		if (statsEls.totalCoinsEarned) statsEls.totalCoinsEarned.textContent = String(Math.floor(toFiniteNumber(totalCoinsEarned, 0)));
		if (statsEls.totalClicks) statsEls.totalClicks.textContent = String(Math.floor(toFiniteNumber(totalClicks, 0)));

		if (statsEls.clickPowerBase) statsEls.clickPowerBase.textContent = String(toInt(clickPower));
		if (statsEls.clickPowerEffective) statsEls.clickPowerEffective.textContent = String(toInt(getEffectiveClickPower()));
		if (statsEls.level) statsEls.level.textContent = String(Math.max(0, Math.floor(toFiniteNumber(level, 0))));
		if (statsEls.levelProgress) statsEls.levelProgress.textContent = `${safeLevelClicks} / ${levelRequiredClicks}`;
		if (statsEls.levelRemaining) statsEls.levelRemaining.textContent = String(levelRemainingClicks);
		if (statsEls.clickUpgrades) statsEls.clickUpgrades.textContent = String(Math.max(0, Math.floor(toFiniteNumber(clickUpgradesCount, 0))));

		if (statsEls.robotsCount) statsEls.robotsCount.textContent = String(Math.max(0, Math.floor(toFiniteNumber(robotCount, 0))));
		if (statsEls.robotsIncomeBase) statsEls.robotsIncomeBase.textContent = String(toInt(Math.max(0, toFiniteNumber(robotIncomePerSecond, 0))));
		if (statsEls.robotsIncomeEffective) statsEls.robotsIncomeEffective.textContent = String(toInt(Math.max(0, getEffectiveRobotIncome())));

		if (statsEls.skinsBought) statsEls.skinsBought.textContent = String(Math.max(0, Math.floor(toFiniteNumber(skinsBoughtCount, 0))));
		if (statsEls.skinsOwned) statsEls.skinsOwned.textContent = String(ownedSkinIds.size);
		if (statsEls.skinsSelected) statsEls.skinsSelected.textContent = getSelectedSkinName();

		if (statsEls.boostsUpgraded) statsEls.boostsUpgraded.textContent = String(getBoostsUpgradedCount());
		if (statsEls.boostsUsedTotal) statsEls.boostsUsedTotal.textContent = String(getTotalBoostUsageCount());
		if (statsEls.boostsTypesUsed) statsEls.boostsTypesUsed.textContent = String(boostTypesUsed.size);
		if (statsEls.boostsActive) statsEls.boostsActive.textContent = String(getActiveBoostsCount());
		if (statsEls.boostsBestCombo) statsEls.boostsBestCombo.textContent = String(Math.max(0, Math.floor(toFiniteNumber(achievementCounters.boostComboBest, 0))));
		if (statsEls.boostsTotalTime) statsEls.boostsTotalTime.textContent = String(Math.floor(Math.max(0, toFiniteNumber(achievementCounters.boostTime, 0))));

		if (statsEls.achievementsUnlocked) statsEls.achievementsUnlocked.textContent = String(unlockedAchievementsCount);
		if (statsEls.achievementsClaimed) statsEls.achievementsClaimed.textContent = String(claimedAchievementsCount);
		if (statsEls.achievementsSystem) statsEls.achievementsSystem.textContent = achievementsButtonUnlocked ? (currentLanguage === 'en' ? 'Yes' : 'Да') : (currentLanguage === 'en' ? 'No' : 'Нет');
	}

	function getBoostLevel(boostId) {
		const boost = boostById.get(boostId);
		if (boost) return toInt(boost.purchases);
		return Math.max(0, toInt(boostLevels[boostId]));
	}

	function getBoostPrice(boost) {
		return Math.max(1, toInt(boost.currentPrice));
	}

	function isBoostActive(boostId) {
		const boost = boostById.get(boostId);
		if (!boost) return false;
		return !!(boost.active && boost.expiresAt && Date.now() < boost.expiresAt);
	}

	function refreshBoostState(boost) {
		if (!boost) return;
		if (boost.active && boost.expiresAt && Date.now() >= boost.expiresAt) {
			boost.active = false;
			boost.expiresAt = null;
		}
		if (boost.id === 'discount_protocol' && pendingDiscount === false && boost.active) {
			boost.active = false;
			boost.expiresAt = null;
			boost.consumed = true;
		}
	}

	function pauseAllSounds() {
		Object.values(sounds).forEach((audio) => {
			try {
				audio.pause();
				audio.currentTime = 0;
			} catch {
				// Безопасная остановка для браузеров, где аудио может быть не готово.
			}
		});
	}

	function updateBoostDerivedState() {
		critBoostActive = isBoostActive('critical_overload');
		boostTimeScale = isBoostActive('time_freeze') ? 0.5 : 1;
	}

	function getBoostCurrentEffect(boostId, fallback = 1) {
		const boost = boostById.get(boostId);
		if (!boost) return fallback;
		return toFiniteNumber(boost.currentEffect, fallback);
	}

	function getPassiveBoostTotalEffect(boostId, fallback = 0) {
		const boost = boostById.get(boostId);
		if (!boost) return fallback;
		const purchases = getBoostLevel(boostId);
		const step = toFiniteNumber(boost.effectStep, 0);
		const base = toFiniteNumber(boost.baseEffect, 0);
		if (purchases <= 0) return fallback;
		if (step === 0) return purchases * base;
		return purchases * base + ((purchases - 1) * purchases * step) / 2;
	}

	function getEffectiveClickPower() {
		let power = clickPower;
		power += getPassiveBoostTotalEffect('processor_plus', 0);
		power += permanentClickPowerBonus;
		if (getBoostLevel('evolution_module') > 0) {
			power *= 1 + (level * 0.05);
		}
		const neonBoost = boostById.get('neon_overdrive');
		if (isBoostActive('neon_overdrive') && neonBoost) power *= toFiniteNumber(neonBoost.currentEffect, 1);
		if (isBoostActive('galactic_breakthrough')) power *= getBoostCurrentEffect('galactic_breakthrough', 1);
		if (isBoostActive('omega_mode')) power *= getBoostCurrentEffect('omega_mode', 1);
		return power;
	}

		function getEffectiveCoinsPerClick() {
			let coinsPerClick = getEffectiveClickPower();
			if (isBoostActive('golden_storm')) coinsPerClick *= getBoostCurrentEffect('golden_storm', 1);
			if (getBoostLevel('space_amplifier') > 0) coinsPerClick *= 1.1;
			coinsPerClick *= permanentCoinBonusMultiplier;
			return coinsPerClick;
		}

		function getEffectiveRobotIncome() {
			let income = robotIncomePerSecond;
			income += getPassiveBoostTotalEffect('eternal_generator', 0);
			const droneBoost = boostById.get('drone_army');
			if (isBoostActive('drone_army') && droneBoost) income *= toFiniteNumber(droneBoost.currentEffect, 1);
			const galacticBoost = boostById.get('galactic_breakthrough');
			if (isBoostActive('galactic_breakthrough') && galacticBoost) income *= toFiniteNumber(galacticBoost.currentRobotEffect, 1);
			if (getBoostLevel('space_amplifier') > 0) income *= 1.1;
			income *= permanentRobotBonusMultiplier;
			return income;
		}

	function showBoostActivation(text) {
		if (!clickObject) return;
		const pulse = document.createElement('div');
		pulse.className = 'boost-activate-fx';
		clickObject.appendChild(pulse);
		setTimeout(() => pulse.remove(), 750);

		const label = document.createElement('div');
		label.className = 'boost-fx-text';
		label.textContent = text;
		clickObject.appendChild(label);
		setTimeout(() => label.remove(), 920);
		playSound('menu');
	}

	function activateTimedBoost(boost) {
		const startAt = Date.now();
		const durationMs = Math.max(1000, Math.floor(toFiniteNumber(boost.duration, 10) * 1000));
		activeBoosts[boost.id] = { startAt, endAt: startAt + durationMs, durationMs };
		boost.active = true;
		boost.expiresAt = startAt + durationMs;

		scheduleBoostTimer(boost.id);
		updateBoostDerivedState();
		renderBoostsUI();
	}

	function deactivateBoost(boostId) {
		delete activeBoosts[boostId];
		const timer = boostTimers.get(boostId);
		if (timer) clearTimeout(timer);
		boostTimers.delete(boostId);
		const boost = boostById.get(boostId);
		if (boost) {
			boost.active = false;
			boost.expiresAt = null;
		}
		updateBoostDerivedState();
		renderBoostsUI();
	}

	function scheduleBoostTimer(boostId) {
		const active = activeBoosts[boostId];
		if (!active) return;
		const existing = boostTimers.get(boostId);
		if (existing) clearTimeout(existing);
		const msLeft = Math.max(0, active.endAt - Date.now());
		const timeoutId = setTimeout(() => {
			deactivateBoost(boostId);
			saveGame();
		}, msLeft);
		boostTimers.set(boostId, timeoutId);
	}

	function getBoostActionState(boost) {
		refreshBoostState(boost);
		const price = getBoostPrice(boost);
		if (boost.oneTime && (boost.consumed || getBoostLevel(boost.id) > 0)) {
			return { disabled: true, text: currentLanguage === 'en' ? 'Consumed' : 'Использован' };
		}
		if (isBoostActive(boost.id)) {
			return { disabled: true, text: currentLanguage === 'en' ? 'Already active' : 'Уже активен' };
		}
		if (coins < price) return { disabled: true, text: currentLanguage === 'en' ? 'Not enough coins' : 'Недостаточно монет' };
		return { disabled: false, text: currentLanguage === 'en' ? `Buy for ${price} 💰` : `Купить за ${price} 💰` };
	}

	function renderBoostTabs() {
		if (!boostsTabs) return;
		boostsTabs.textContent = '';
		boostCategories.forEach((cat) => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'boosts-tab';
			if (cat.id === currentBoostCategory) btn.classList.add('is-active');
			btn.dataset.boostCategory = cat.id;
			btn.textContent = cat.label[currentLanguage] || cat.label.ru;
			boostsTabs.appendChild(btn);
		});
	}

		function renderActiveBoosts() {
			const now = Date.now();
			const delta = Math.max(0, (now - lastBoostTick) / 1000);
			const freezeBoost = boostById.get('time_freeze');
			if (freezeBoost && isBoostActive('time_freeze')) {
				const slowFactor = Math.max(0.05, toFiniteNumber(freezeBoost.currentEffect, 0.5));
				const extendMs = Math.max(0, (1 - slowFactor) * delta * 1000);
				if (extendMs > 0) {
					Object.entries(activeBoosts).forEach(([id, data]) => {
						if (id === 'time_freeze') return;
						if (toFiniteNumber(data.endAt, 0) <= now) return;
						data.endAt += extendMs;
						const boost = boostById.get(id);
						if (boost && boost.expiresAt) boost.expiresAt = toInt(boost.expiresAt + extendMs);
						scheduleBoostTimer(id);
					});
				}
			}
			lastBoostTick = now;
			if (Object.keys(activeBoosts).length > 0) {
				achievementCounters.boostTime += delta;
			}
			achievementCounters.boostComboBest = Math.max(achievementCounters.boostComboBest, Object.keys(activeBoosts).length);
			if (!boostsActiveList) return;
			const items = Object.entries(activeBoosts)
				.filter(([, data]) => toFiniteNumber(data.endAt, 0) > now)
				.map(([id, data]) => {
					const boost = boostById.get(id);
					if (!boost) return null;
					const remainingMs = data.endAt - now;
					const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
					const progress = data.durationMs > 0 ? (remainingMs / data.durationMs) * 100 : 0;
					const row = document.createElement('div');
					row.className = 'boost-active-item';

					const icon = document.createElement('div');
					icon.className = 'boost-active-item__icon';
					icon.textContent = boost.icon;

					const textWrap = document.createElement('div');
					const name = document.createElement('div');
					name.className = 'boost-active-item__name';
					name.textContent = `${getBoostText(boost, 'name')} — ${seconds}${currentLanguage === 'en' ? 's' : 'с'}`;
					const time = document.createElement('div');
					time.className = 'boost-active-item__time';
					time.textContent = `${currentLanguage === 'en' ? 'Left' : 'Осталось'} ${seconds}${currentLanguage === 'en' ? 's' : 'с'}`;
					textWrap.append(name, time);

					const progressWrap = document.createElement('div');
					progressWrap.className = 'boost-progress';
					const progressFill = document.createElement('div');
					progressFill.className = 'boost-progress__fill';
					progressFill.style.width = `${Math.max(0, Math.min(100, progress)).toFixed(1)}%`;
					progressWrap.appendChild(progressFill);
					row.append(icon, textWrap, progressWrap);
					return row;
				})
				.filter(Boolean);
			boostsActiveList.textContent = '';
			if (items.length === 0) {
				const row = document.createElement('div');
				row.className = 'boost-active-item';
				const name = document.createElement('div');
				name.className = 'boost-active-item__name';
				name.textContent = currentLanguage === 'en' ? 'No active boosts' : 'Нет активных бустов';
				row.appendChild(name);
				boostsActiveList.appendChild(row);
				return;
			}
			items.forEach((item) => boostsActiveList.appendChild(item));
	}

	function renderBoosts() {
		if (!boostsGrid) return;
		const filtered = boosts.filter((boost) => boost.category === currentBoostCategory);
		boostsGrid.textContent = '';
		filtered.forEach((boost) => {
				refreshBoostState(boost);
				const action = getBoostActionState(boost);
				const remainingSeconds = boost.expiresAt ? Math.max(0, Math.ceil((boost.expiresAt - Date.now()) / 1000)) : 0;
				const card = document.createElement('article');
				card.className = `boost-card boost-card--${boost.rarity === 'epic' ? 'epic' : boost.rarity === 'rare' ? 'rare' : 'common'}`;
				if (isBoostActive(boost.id)) card.classList.add('boost-card--active');

				const icon = document.createElement('div');
				icon.className = 'boost-card__icon';
				icon.textContent = boost.icon;

				const name = document.createElement('h3');
				name.className = 'boost-card__name';
				name.textContent = getBoostText(boost, 'name');

				const desc = document.createElement('p');
				desc.className = 'boost-card__desc';
				desc.textContent = getBoostText(boost, 'desc');

				const price = document.createElement('div');
				price.className = 'boost-card__meta';
				price.textContent = currentLanguage === 'en' ? `Price: ${toInt(boost.currentPrice)} 💰` : `Цена: ${toInt(boost.currentPrice)} 💰`;

				card.append(icon, name, desc, price);

				if (boost.duration > 0) {
					const duration = document.createElement('div');
					duration.className = 'boost-card__meta';
					duration.textContent = currentLanguage === 'en' ? `Duration: ${boost.duration}s` : `Длительность: ${boost.duration}с`;
					card.appendChild(duration);
				}

				if (isBoostActive(boost.id)) {
					const timer = document.createElement('div');
					timer.className = 'boost-card__meta boost-card__timer';
					timer.textContent = currentLanguage === 'en' ? `Timer: ${remainingSeconds}s` : `Таймер: ${remainingSeconds}с`;
					card.appendChild(timer);
				}

				const actionBtn = document.createElement('button');
				actionBtn.className = 'boost-card__action';
				actionBtn.type = 'button';
				actionBtn.dataset.boostId = boost.id;
				actionBtn.disabled = action.disabled;
				actionBtn.textContent = action.text;
				card.appendChild(actionBtn);
			boostsGrid.appendChild(card);
		});
	}

	function renderBoostsUI() {
		renderBoostTabs();
		renderBoosts();
		renderActiveBoosts();
	}

	function openBoostsModal() {
		if (!boostsModal) return;
		closeAllFeatureModals();
		renderBoostsUI();
		boostsModal.classList.remove('hidden');
		markGameplayStop();
		syncBannerForScreen('boosts');
	}

	function closeBoostsModal() {
		if (!boostsModal) return;
		boostsModal.classList.add('hidden');
		syncBannerForScreen('game');
		syncGameplayState();
	}

	function getOfflineBonusReward() {
		const now = Date.now();
		const offlineBoost = boostById.get('offline_accelerator');
		const realOfflineIncome = calculateOfflineReward(lastSeenAt, now, Math.max(0, getEffectiveRobotIncome()), offlineBoost);
		const offlineBonusBoost = boostById.get('offline_bonus');
		const bonusRatio = offlineBonusBoost ? toFiniteNumber(offlineBonusBoost.currentEffect, 0.5) : 0.5;
		return toInt(realOfflineIncome * bonusRatio);
	}

	function calculateOfflineReward(lastSeen, now, incomePerSecond, boost) {
		const totalOfflineSeconds = Math.max(0, toInt((now - lastSeen) / 1000));
		const cappedOfflineSeconds = Math.min(totalOfflineSeconds, 7200);
		let boostedSeconds = 0;
		let normalSeconds = cappedOfflineSeconds;
		if (boost && boost.id === 'offline_accelerator' && boost.expiresAt) {
			const boostActiveUntil = Math.min(boost.expiresAt, now);
			const boostedTime = Math.max(0, toInt((boostActiveUntil - lastSeen) / 1000));
			boostedSeconds = Math.min(boostedTime, cappedOfflineSeconds);
			normalSeconds = cappedOfflineSeconds - boostedSeconds;
		}
		const boostedReward = toInt(incomePerSecond * boostedSeconds * (boost?.currentEffect || 1));
		const normalReward = toInt(incomePerSecond * normalSeconds);
		return toInt(boostedReward + normalReward);
	}

	function applyBoostEffect(boost) {
		if (!boost) return;
		if (boost.id === 'coin_burst') {
			const reward = toInt(boost.currentEffect);
			coins = toInt(coins + reward);
			totalCoinsEarned = toInt(totalCoinsEarned + reward);
			showBoostActivation(currentLanguage === 'en' ? `+${reward} COINS` : `+${reward} МОНЕТ`);
		}
		if (boost.id === 'super_click') {
			pendingSuperClick = true;
			showBoostActivation(currentLanguage === 'en' ? 'SUPER CLICK x25' : 'СУПЕР КЛИК x25');
		}
		if (boost.id === 'discount_protocol') {
			pendingDiscount = true;
			showBoostActivation(currentLanguage === 'en' ? 'DISCOUNT -50%' : 'СКИДКА -50%');
		}
		if (boost.id === 'offline_bonus') {
			const reward = getOfflineBonusReward();
			coins = toInt(coins + reward);
			totalCoinsEarned = toInt(totalCoinsEarned + reward);
			showBoostActivation(currentLanguage === 'en' ? `OFFLINE +${reward}` : `ОФЛАЙН +${reward}`);
		}
		if (boost.duration > 0) {
			activateTimedBoost(boost);
		}
	}

	function recalculateBoostEffect(boost) {
		if (!boost || boost.oneTime) return;
		if (boost.type === 'passive') {
			boost.currentEffect = Math.round(getPassiveBoostTotalEffect(boost.id, 0) * 100) / 100;
			return;
		}
		if (boost.effectMultiplier) {
			boost.currentEffect = Math.round((toFiniteNumber(boost.currentEffect, 0) * toFiniteNumber(boost.effectMultiplier, 1)) * 100) / 100;
		} else {
			boost.currentEffect = Math.round((toFiniteNumber(boost.currentEffect, 0) + toFiniteNumber(boost.effectStep, 0)) * 100) / 100;
		}
		if (boost.id === 'galactic_breakthrough') {
			boost.currentRobotEffect = Math.round((toFiniteNumber(boost.currentRobotEffect, boost.baseRobotEffect || 1) + toFiniteNumber(boost.robotEffectStep, 0)) * 100) / 100;
		}
		if (boost.id === 'critical_overload') {
			boost.currentChance = Math.min(1, Math.max(0, Math.round((toFiniteNumber(boost.currentChance, boost.baseChance || 0.3) + toFiniteNumber(boost.chanceStep, 0)) * 1000) / 1000));
		}
	}

	function canBuyBoost(boost) {
		if (!boost) return false;
		refreshBoostState(boost);
		if (coins < getBoostPrice(boost)) return false;
		if (boost.oneTime && (boost.consumed || toInt(boost.purchases) > 0)) return false;
		if (boost.duration > 0 && isBoostActive(boost.id)) return false;
		return true;
	}

	function buyBoost(boostId) {
		const boost = boostById.get(boostId);
		if (!boost || !canBuyBoost(boost)) return;
		const price = getBoostPrice(boost);
		boostTypesUsed.add(boost.category);
		coins = toInt(coins - price);
		applyBoostEffect(boost);
		boost.purchases = toInt(boost.purchases + 1);
		boost.currentPrice = Math.max(1, toInt(boost.currentPrice * toFiniteNumber(boost.priceMultiplier, 1.2)));
		recalculateBoostEffect(boost);
		boostLevels[boost.id] = toInt(boost.purchases);
		boostUsageCount[boost.id] = toInt(boostUsageCount[boost.id]) + 1;
		updateBoostDerivedState();
		updateUI();
		renderBoostsUI();
		saveGame();
	}

if (boostsBtn) {
	boostsBtn.addEventListener('click', () => {
		openBoostsModal();
	});
}

	if (closeBoostsBtn) {
		closeBoostsBtn.addEventListener('click', closeBoostsModal);
	}

	if (boostsModal) {
		boostsModal.addEventListener('click', (event) => {
			if (event.target === boostsModal) closeBoostsModal();
		});
	}

	if (boostsTabs) {
		boostsTabs.addEventListener('click', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) return;
			const tab = target.closest('.boosts-tab');
			if (!tab) return;
			const category = tab.dataset.boostCategory;
			if (!category) return;
			currentBoostCategory = category;
			renderBoostsUI();
		});
	}

	if (boostsGrid) {
		boostsGrid.addEventListener('click', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) return;
			const actionBtn = target.closest('.boost-card__action');
			if (!actionBtn) return;
			const boostId = actionBtn.dataset.boostId;
			if (!boostId) return;
			buyBoost(boostId);
		});
	}


	const RESET_BUTTON_IDLE_TEXT = () => (currentLanguage === 'en' ? 'Reset all progress' : 'Сбросить весь прогресс');
	const RESET_BUTTON_ARMED_TEXT = () => (currentLanguage === 'en' ? 'Hold for 3 seconds' : 'Держите 3 секунды');
	const RESET_HOLD_DURATION_MS = 3000;
	const RESET_ARM_TIMEOUT_MS = 30000;

	let resetArmTimeout = null;
	let resetHoldRaf = null;
	let resetHoldStart = 0;
	let resetArmed = false;
	let resetHolding = false;

	function clearResetArmTimeout() {
		if (!resetArmTimeout) return;
		clearTimeout(resetArmTimeout);
		resetArmTimeout = null;
	}

	function setResetLabel(text) {
		if (resetProgressLabel) {
			resetProgressLabel.textContent = text;
		}
	}

	function setResetProgress(progress) {
		if (!resetProgressOverlay) return;
		const safeProgress = Math.max(0, Math.min(1, toFiniteNumber(progress, 0)));
		resetProgressOverlay.style.transform = `scaleX(${safeProgress})`;
	}

	function resetButtonToIdleState() {
		clearResetArmTimeout();
		if (resetHoldRaf) {
			cancelAnimationFrame(resetHoldRaf);
			resetHoldRaf = null;
		}

		resetArmed = false;
		resetHolding = false;
		if (resetProgressBtn) {
			resetProgressBtn.classList.remove('is-armed', 'is-holding');
		}
		setResetLabel(RESET_BUTTON_IDLE_TEXT());
		setResetProgress(0);
	}

	function armResetButton() {
		if (!resetProgressBtn) return;
		clearResetArmTimeout();
		resetArmed = true;
		resetProgressBtn.classList.add('is-armed');
		setResetLabel(RESET_BUTTON_ARMED_TEXT());

		resetArmTimeout = setTimeout(() => {
			resetButtonToIdleState();
		}, RESET_ARM_TIMEOUT_MS);
	}

	function createInitialGameState() {
		return {
			coins: 0,
			clickPower: 1,
			upgradePrice: 85,
			robotPrice: ROBOT_BASE_PRICE,
			robotCount: 0,
			robotIncomePerSecond: 0,
			lastSeenAt: Date.now(),
			level: 0,
			levelClicks: 0,
			ownedSkinIds: new Set([DEFAULT_SKIN_ID]),
			selectedSkinId: DEFAULT_SKIN_ID,
			boostsState: boosts.map((boost) => ({ ...boost })),
			boostLevels: {},
			boostUsageCount: {},
			activeBoosts: {},
			pendingDiscount: false,
			pendingSuperClick: false,
			boostTimeScale: 1,
			critBoostActive: false,
			totalClicks: 0,
			totalCoinsEarned: 0,
			clickUpgradesCount: 0,
			skinsBoughtCount: 0,
			achievementsButtonUnlocked: false,
			achievementCounters: { boostComboBest: 0, boostTime: 0 },
			boostTypesUsed: [],
			seenUnlockedAchievementIds: [],
			brightness: DEFAULT_BRIGHTNESS,
			volume: DEFAULT_VOLUME,
			theme: DEFAULT_THEME,
		};
	}

	function clearGameStorage() {
		GAME_STORAGE_KEYS.forEach((key) => {
			try {
				localStorage.removeItem(key);
			} catch {
				// localStorage может быть недоступен
			}
		});
	}

	function resetAchievementsToInitialState() {
		achievementsButtonUnlocked = false;
		achievementCounters.boostComboBest = 0;
		achievementCounters.boostTime = 0;
		seenUnlockedAchievementIds.clear();
		boostTypesUsed.clear();
		achievements.forEach((item) => {
			item.unlocked = false;
			item.claimed = false;
		});
		achievementSeries.forEach((series) => {
			series.currentStepIndex = 0;
			series.completed = false;
			series.fullyCompleted = false;
			series.steps.forEach((step) => {
				step.claimed = false;
				step.unlocked = false;
			});
		});
		updatePermanentBonusesFromAchievements();
		restoreAchievementsButtonState();
		syncAchievementsAttentionEffect();
	}

	function clearTransientUIState() {
		// Закрываем все модалки и приводим экран к состоянию меню.
		if (aboutScreen) aboutScreen.classList.add('hidden');
		if (settingsScreen) settingsScreen.classList.add('hidden');
		closeSkinsModal();
		closeBoostsModal();
		closeAchievementsModal();
		closeStatsModal();
		if (menuScreen) menuScreen.classList.remove('hidden');

		// Удаляем временные «всплывающие» числа от прошлой сессии.
		document.querySelectorAll('.floating-number').forEach((el) => el.remove());

		// Сбрасываем состояние кнопки reset (armed/holding/progress).
		resetButtonToIdleState();
	}

	function stopAllTransientProcesses() {
		stopRobotIncomeTimer();
		boostTimers.forEach((timer) => clearTimeout(timer));
		boostTimers.clear();
		activeBoosts = {};
		lastBoostTick = Date.now();
	}

	function applyInterfaceSettings(options = {}) {
		const {
			brightnessValue = brightness,
			volumeValue = globalVolume,
			themeValue = DEFAULT_THEME,
			save = false,
		} = options;

		applyBrightness(brightnessValue, { syncSlider: true, syncState: true });
		applyGlobalVolume(volumeValue);
		applyTheme(themeValue);
		setSelectToTheme(themeValue);

		if (save) {
			setStorageItem(BRIGHTNESS_KEY, brightness);
			setStorageItem(VOLUME_KEY, globalVolume);
			setStorageItem(THEME_KEY, normalizeTheme(themeValue));
		}
	}

	function applyGameState(state) {
		coins = toInt(state.coins);
		clickPower = state.clickPower;
		upgradePrice = state.upgradePrice;
		robotPrice = state.robotPrice;
		robotCount = state.robotCount;
		robotIncomePerSecond = state.robotIncomePerSecond;
		lastSeenAt = toInt(state.lastSeenAt || Date.now());
		level = state.level;
		levelClicks = state.levelClicks;
		ownedSkinIds = new Set(state.ownedSkinIds);
		selectedSkinId = state.selectedSkinId;
		boostLevels = { ...state.boostLevels };
		boostUsageCount = { ...state.boostUsageCount };
		activeBoosts = { ...state.activeBoosts };
		pendingDiscount = state.pendingDiscount;
		pendingSuperClick = state.pendingSuperClick;
		boostTimeScale = state.boostTimeScale;
		critBoostActive = state.critBoostActive;
		totalClicks = state.totalClicks;
		totalCoinsEarned = toInt(state.totalCoinsEarned);
		clickUpgradesCount = state.clickUpgradesCount;
		skinsBoughtCount = state.skinsBoughtCount;

		resetAchievementsToInitialState();
		achievementsButtonUnlocked = state.achievementsButtonUnlocked;
		achievementCounters.boostComboBest = state.achievementCounters.boostComboBest;
		achievementCounters.boostTime = state.achievementCounters.boostTime;
		seenUnlockedAchievementIds.clear();
		state.seenUnlockedAchievementIds.forEach((id) => {
			const parsedId = Math.floor(toFiniteNumber(id, -1));
			if (parsedId > 0) seenUnlockedAchievementIds.add(parsedId);
		});
		boostTypesUsed.clear();
		state.boostTypesUsed.forEach((type) => boostTypesUsed.add(String(type)));
		const savedBoosts = Array.isArray(state.boostsState) ? state.boostsState : [];
		activeBoosts = {};
		boosts.forEach((boost) => {
			const saved = savedBoosts.find((item) => item && item.id === boost.id) || null;
			const legacyLevel = Math.max(0, toInt(boostLevels[boost.id]));
			boost.purchases = Math.max(0, toInt(saved?.purchases ?? legacyLevel));
			boost.currentPrice = Math.max(1, toInt(saved?.currentPrice ?? (boost.basePrice * Math.pow(boost.priceMultiplier, boost.purchases))));
			boost.currentEffect = toFiniteNumber(saved?.currentEffect, boost.baseEffect + (boost.effectStep || 0) * boost.purchases);
			if (boost.type === 'passive') {
				boost.currentEffect = Math.round(getPassiveBoostTotalEffect(boost.id, 0) * 100) / 100;
			}
			if (boost.id === 'galactic_breakthrough') {
				boost.currentRobotEffect = toFiniteNumber(saved?.currentRobotEffect, boost.baseRobotEffect + (boost.robotEffectStep || 0) * boost.purchases);
			}
			if (boost.id === 'critical_overload') {
				boost.currentChance = toFiniteNumber(saved?.currentChance, boost.baseChance);
			}
			boost.active = Boolean(saved?.active);
			boost.expiresAt = saved?.expiresAt ? toInt(saved.expiresAt) : null;
			boost.consumed = Boolean(saved?.consumed);
			boostLevels[boost.id] = boost.purchases;
			if (boost.active && boost.expiresAt) {
				const durationMs = Math.max(1000, toInt(boost.duration * 1000));
				activeBoosts[boost.id] = { startAt: boost.expiresAt - durationMs, endAt: boost.expiresAt, durationMs };
			}
		});
		delete activeBoosts.rocket_pulse;

		if (Array.isArray(state.achievementsState)) {
			const byId = new Map(state.achievementsState.map((it) => [Number(it.id), it]));
			achievements.forEach((achievement) => {
				const saved = byId.get(achievement.id);
				if (!saved) return;
				achievement.unlocked = Boolean(saved.unlocked);
				achievement.claimed = Boolean(saved.claimed);
			});
		} else if (state.achievementsState && typeof state.achievementsState === 'object' && Array.isArray(state.achievementsState.series)) {
			const bySeries = new Map(state.achievementsState.series.map((item) => [String(item.id), item]));
			achievementSeries.forEach((series) => {
				const savedSeries = bySeries.get(series.id);
				if (!savedSeries || !Array.isArray(savedSeries.claimedStepIds)) return;
				const claimedSet = new Set(savedSeries.claimedStepIds.map((id) => Number(id)));
				series.steps.forEach((step) => {
					if (claimedSet.has(step.id)) {
						step.legacyAchievement.claimed = true;
					}
				});
			});
		}
		updateAchievementsState();
		updatePermanentBonusesFromAchievements();
		restoreAchievementsButtonState();
	}

	function resetGameProgress() {
		const initialState = createInitialGameState();
		stopAllTransientProcesses();
		clearGameStorage();
		applyGameState(initialState);
		applyInterfaceSettings({
			brightnessValue: initialState.brightness,
			volumeValue: initialState.volume,
			themeValue: initialState.theme,
			save: true,
		});
		updateBoostDerivedState();
		updateClickObjectSkin();
		renderSkinsGrid();
		updateUI();
		clearTransientUIState();
		saveGame();
	}


	function finishResetHold() {
		setResetProgress(1);
		resetGameProgress();
	}

	function tickResetHold(timestamp) {
		if (!resetHolding) return;
		const elapsed = timestamp - resetHoldStart;
		const progress = elapsed / RESET_HOLD_DURATION_MS;
		setResetProgress(progress);

		if (progress >= 1) {
			resetHolding = false;
			if (resetProgressBtn) {
				resetProgressBtn.classList.remove('is-holding');
			}
			finishResetHold();
			return;
		}

		resetHoldRaf = requestAnimationFrame(tickResetHold);
	}

	function startResetHold() {
		if (!resetProgressBtn || !resetArmed || resetHolding) return;
		clearResetArmTimeout();
		resetHolding = true;
		resetProgressBtn.classList.add('is-holding');
		resetHoldStart = performance.now();
		setResetProgress(0);
		resetHoldRaf = requestAnimationFrame(tickResetHold);
	}

	function cancelResetHold() {
		if (!resetHolding) return;
		resetButtonToIdleState();
	}

	function triggerResetClickPulse() {
		if (!resetProgressBtn) return;
		resetProgressBtn.classList.remove('is-click-pulse');
		void resetProgressBtn.offsetWidth;
		resetProgressBtn.classList.add('is-click-pulse');
	}

	function initResetProgressButton() {
		if (!resetProgressBtn) return;
		resetButtonToIdleState();

		resetProgressBtn.addEventListener('pointerdown', (event) => {
			if (event.pointerType === 'mouse' && event.button !== 0) return;
			triggerResetClickPulse();
		});

		resetProgressBtn.addEventListener('click', () => {
			if (!resetArmed && !resetHolding) {
				armResetButton();
			}
		});

		resetProgressBtn.addEventListener('animationend', (event) => {
			if (event.animationName === 'restartTapPulse') {
				resetProgressBtn.classList.remove('is-click-pulse');
			}
		});

		const onPressStart = (event) => {
			if (!resetArmed || resetHolding) return;
			if (event.type === 'mousedown' && event.button !== 0) return;
			startResetHold();
		};

		const onPressCancel = () => {
			cancelResetHold();
		};

		resetProgressBtn.addEventListener('mousedown', onPressStart);
		resetProgressBtn.addEventListener('touchstart', onPressStart, { passive: true });
		resetProgressBtn.addEventListener('mouseup', onPressCancel);
		resetProgressBtn.addEventListener('mouseleave', onPressCancel);
		resetProgressBtn.addEventListener('touchend', onPressCancel);
		resetProgressBtn.addEventListener('touchcancel', onPressCancel);
		resetProgressBtn.addEventListener('pointercancel', onPressCancel);
	}

	function isSpecialSoundButton(button) {
		if (!button) return true;
		if (button.disabled) return true;

		// У кнопки "Начать играть" свой отдельный звук
		if (startBtn && button === startBtn) return true;

		// У объекта клика (робота) свой отдельный звук,
		// даже если он когда-нибудь станет кнопкой или окажется внутри кнопки
		if (clickObject) {
			if (button === clickObject) return true;
			if (button.contains(clickObject)) return true;
			if (clickObject.contains(button)) return true;
		}

		return false;
	}

	function bindGenericButtonSound() {
		document.addEventListener('click', (e) => {
			const target = e.target;
			if (!(target instanceof Element)) return;

			const button = target.closest(
				'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]'
			);

			if (!button) return;
			if (!document.contains(button)) return;
			if (isSpecialSoundButton(button)) return;

			playSound('menu');
		});
	}

	//---------------КЛИКЕР-------------------------------------
	function startRobotIncomeTimer() {
		if (robotTimer || robotIncomePerSecond <= 0) return;

		robotTimer = setInterval(() => {
			if (isGamePaused || isAdShowing) return;
			const robotIncome = toInt(getEffectiveRobotIncome());
			coins = toInt(coins + robotIncome);
			totalCoinsEarned = toInt(totalCoinsEarned + robotIncome);
			updateUI();
			saveGame();
		}, 1000);
	}

	function stopRobotIncomeTimer() {
		if (!robotTimer) return;
		clearInterval(robotTimer);
		robotTimer = null;
	}

	// Обновляет числа на экране
	function updateUI() {
			if (scoreEl) scoreEl.textContent = String(toInt(coins));
			if (clickPowerEl) clickPowerEl.textContent = String(toInt(getEffectiveClickPower()));
			updateAchievementsState();
			updateLevelUI();
			updateClickUpgradeUI();
			updateRobotUpgradeUI();
			renderSkinsGrid();
			if (achievementsModal && !achievementsModal.classList.contains('hidden')) {
				renderAchievements();
			}
			renderStatistics();
		}


	let cloudSyncTimer = null;
	function scheduleCloudSync() {
		if (!sdkReady || !isAuthorized || !player?.setData) return;
		if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
		cloudSyncTimer = setTimeout(() => {
			const payload = {
				coins: Math.max(0, toInt(coins)),
				clickPower: Math.max(1, toFiniteNumber(clickPower, 1)),
				level: Math.max(0, Math.floor(toFiniteNumber(level, 0))),
				updatedAt: Date.now(),
			};
			player.setData(payload).catch((error) => {
				console.warn('[Robo Clicker] Cloud sync skipped', error);
			});
		}, 800);
	}

	// Сохраняем данные в localStorage
	function saveGame() {
		setStorageItem('coins', Math.max(0, toInt(coins)));
		setStorageItem('clickPower', Math.max(1, toFiniteNumber(clickPower, 1)));
		setStorageItem(CLICK_UPGRADE_PRICE_KEY, Math.max(1, toFiniteNumber(upgradePrice, 85)));
		setStorageItem(ROBOT_PRICE_KEY, Math.max(ROBOT_BASE_PRICE, toFiniteNumber(robotPrice, ROBOT_BASE_PRICE)));
		setStorageItem(ROBOT_COUNT_KEY, Math.max(0, Math.floor(toFiniteNumber(robotCount, 0))));
		setStorageItem(ROBOT_INCOME_KEY, Math.max(0, Math.floor(toFiniteNumber(robotIncomePerSecond, 0))));
		setStorageItem(LAST_SEEN_AT_KEY, toInt(Date.now()));
		setStorageItem(BRIGHTNESS_KEY, clamp(brightness, BR_MIN, BR_MAX));
		setStorageItem(VOLUME_KEY, clamp01(globalVolume));
		setStorageItem(LEVEL_KEY, Math.max(0, Math.floor(toFiniteNumber(level, 0))));
		setStorageItem(LEVEL_CLICKS_KEY, Math.max(0, Math.floor(toFiniteNumber(levelClicks, 0))));
		setStorageItem(SKINS_OWNED_KEY, JSON.stringify(Array.from(ownedSkinIds)));
		setStorageItem(SKINS_SELECTED_KEY, Math.max(DEFAULT_SKIN_ID, Math.floor(toFiniteNumber(selectedSkinId, DEFAULT_SKIN_ID))));
			setStorageItem(BOOST_LEVELS_KEY, JSON.stringify(boostLevels));
			setStorageItem(BOOST_USAGE_KEY, JSON.stringify(boostUsageCount));
			setStorageItem(BOOST_ACTIVE_KEY, JSON.stringify(activeBoosts));
			setStorageItem(BOOSTS_STATE_KEY, JSON.stringify(boosts.map((boost) => ({
				id: boost.id,
				currentPrice: toInt(boost.currentPrice),
				currentEffect: toFiniteNumber(boost.currentEffect, boost.baseEffect),
				currentRobotEffect: toFiniteNumber(boost.currentRobotEffect, boost.baseRobotEffect),
				currentChance: toFiniteNumber(boost.currentChance, boost.baseChance),
				purchases: toInt(boost.purchases),
				active: Boolean(boost.active),
				expiresAt: boost.expiresAt ? toInt(boost.expiresAt) : null,
				consumed: Boolean(boost.consumed),
			}))));
			setStorageItem(BOOST_PENDING_DISCOUNT_KEY, pendingDiscount ? '1' : '0');
			setStorageItem(BOOST_PENDING_SUPER_CLICK_KEY, pendingSuperClick ? '1' : '0');
			setStorageItem(TOTAL_CLICKS_KEY, Math.max(0, Math.floor(toFiniteNumber(totalClicks, 0))));
			setStorageItem(TOTAL_COINS_EARNED_KEY, Math.max(0, toInt(totalCoinsEarned)));
			setStorageItem(CLICK_UPGRADES_COUNT_KEY, Math.max(0, Math.floor(toFiniteNumber(clickUpgradesCount, 0))));
			setStorageItem(SKINS_BOUGHT_COUNT_KEY, Math.max(0, Math.floor(toFiniteNumber(skinsBoughtCount, 0))));
			setStorageItem(ACHIEVEMENTS_BUTTON_UNLOCKED_KEY, achievementsButtonUnlocked ? '1' : '0');
			setStorageItem(ACHIEVEMENTS_COUNTERS_KEY, JSON.stringify({ ...achievementCounters, boostTypesUsed: Array.from(boostTypesUsed) }));
			setStorageItem(ACHIEVEMENTS_SEEN_UNLOCKED_KEY, JSON.stringify(Array.from(seenUnlockedAchievementIds)));
			setStorageItem(ACHIEVEMENTS_STATE_KEY, JSON.stringify({
				version: ACHIEVEMENT_SERIES_SCHEMA_VERSION,
				series: achievementSeries.map((series) => ({
					id: series.id,
					currentStepIndex: series.currentStepIndex,
					claimedStepIds: series.steps.filter((step) => step.legacyAchievement.claimed).map((step) => step.id),
				})),
				legacy: achievements.map((item) => ({ id: item.id, unlocked: item.unlocked, claimed: item.claimed })),
			}));
			scheduleCloudSync();
		}

	// Загружаем данные из localStorage
	function loadGame() {
		const initialState = createInitialGameState();
		const loadedState = createInitialGameState();

		const savedCoins = getStorageItem('coins');
		const savedClickPower = getStorageItem('clickPower');
		const savedUpgradePrice = getStorageItem(CLICK_UPGRADE_PRICE_KEY);
		const savedRobotPrice = getStorageItem(ROBOT_PRICE_KEY);
		const savedRobotCount = getStorageItem(ROBOT_COUNT_KEY);
		const savedRobotIncome = getStorageItem(ROBOT_INCOME_KEY);
		const savedLastSeenAt = getStorageItem(LAST_SEEN_AT_KEY);
		const savedBrightness = getStorageItem(BRIGHTNESS_KEY);
		const savedVolume = getStorageItem(VOLUME_KEY);
		const savedTheme = getStorageItem(THEME_KEY);
		const savedLevel = getStorageItem(LEVEL_KEY);
		const savedLevelClicks = getStorageItem(LEVEL_CLICKS_KEY);
		const savedOwnedSkins = getStorageItem(SKINS_OWNED_KEY);
		const savedSelectedSkin = getStorageItem(SKINS_SELECTED_KEY);
		const savedBoostLevels = getStorageItem(BOOST_LEVELS_KEY);
		const savedBoostUsage = getStorageItem(BOOST_USAGE_KEY);
		const savedActiveBoosts = getStorageItem(BOOST_ACTIVE_KEY);
		const savedBoostsState = getStorageItem(BOOSTS_STATE_KEY);
		const savedPendingDiscount = getStorageItem(BOOST_PENDING_DISCOUNT_KEY);
		const savedPendingSuperClick = getStorageItem(BOOST_PENDING_SUPER_CLICK_KEY);
		const savedTotalClicks = getStorageItem(TOTAL_CLICKS_KEY);
		const savedTotalCoinsEarned = getStorageItem(TOTAL_COINS_EARNED_KEY);
		const savedClickUpgradesCount = getStorageItem(CLICK_UPGRADES_COUNT_KEY);
		const savedSkinsBoughtCount = getStorageItem(SKINS_BOUGHT_COUNT_KEY);
		const savedAchievementsButtonUnlocked = getStorageItem(ACHIEVEMENTS_BUTTON_UNLOCKED_KEY);
		const savedAchievementCounters = getStorageItem(ACHIEVEMENTS_COUNTERS_KEY);
		const savedSeenUnlockedAchievements = getStorageItem(ACHIEVEMENTS_SEEN_UNLOCKED_KEY);
		const savedAchievementsState = getStorageItem(ACHIEVEMENTS_STATE_KEY);

		if (savedCoins !== null) loadedState.coins = Math.max(0, toInt(savedCoins));
		if (savedClickPower !== null) loadedState.clickPower = Math.max(1, toFiniteNumber(savedClickPower, initialState.clickPower));
		if (savedUpgradePrice !== null) loadedState.upgradePrice = Math.max(1, toFiniteNumber(savedUpgradePrice, initialState.upgradePrice));
		if (savedRobotPrice !== null) loadedState.robotPrice = Math.max(ROBOT_BASE_PRICE, toFiniteNumber(savedRobotPrice, initialState.robotPrice));
		if (savedRobotCount !== null) loadedState.robotCount = Math.max(0, Math.floor(toFiniteNumber(savedRobotCount, initialState.robotCount)));
		if (savedRobotIncome !== null) {
			loadedState.robotIncomePerSecond = Math.max(0, Math.floor(toFiniteNumber(savedRobotIncome, initialState.robotIncomePerSecond)));
		} else {
			loadedState.robotIncomePerSecond = loadedState.robotCount;
		}
		if (savedLastSeenAt !== null) loadedState.lastSeenAt = Math.max(0, toInt(savedLastSeenAt));
		if (savedLevel !== null) loadedState.level = Math.max(0, Math.floor(toFiniteNumber(savedLevel, initialState.level)));
		if (savedLevelClicks !== null) loadedState.levelClicks = Math.max(0, Math.floor(toFiniteNumber(savedLevelClicks, initialState.levelClicks)));

		if (savedOwnedSkins) {
			try {
				const parsed = JSON.parse(savedOwnedSkins);
				if (Array.isArray(parsed)) {
					loadedState.ownedSkinIds = new Set(parsed.map((value) => Math.floor(toFiniteNumber(value, -1))).filter((id) => skinById.has(id)));
				}
			} catch {
				loadedState.ownedSkinIds = new Set([DEFAULT_SKIN_ID]);
			}
		}
		loadedState.ownedSkinIds.add(DEFAULT_SKIN_ID);

		if (savedSelectedSkin !== null) {
			const parsedSelected = Math.floor(toFiniteNumber(savedSelectedSkin, DEFAULT_SKIN_ID));
			loadedState.selectedSkinId = (skinById.has(parsedSelected) && loadedState.ownedSkinIds.has(parsedSelected)) ? parsedSelected : DEFAULT_SKIN_ID;
		}

		if (savedBoostLevels) {
			try { loadedState.boostLevels = JSON.parse(savedBoostLevels) || {}; } catch { loadedState.boostLevels = {}; }
		}
		if (savedBoostUsage) {
			try { loadedState.boostUsageCount = JSON.parse(savedBoostUsage) || {}; } catch { loadedState.boostUsageCount = {}; }
		}
		if (savedActiveBoosts) {
			try { loadedState.activeBoosts = JSON.parse(savedActiveBoosts) || {}; } catch { loadedState.activeBoosts = {}; }
		}
		if (savedBoostsState) {
			try { loadedState.boostsState = JSON.parse(savedBoostsState) || loadedState.boostsState; } catch { loadedState.boostsState = boosts.map((boost) => ({ ...boost })); }
		}

		loadedState.pendingDiscount = savedPendingDiscount === '1';
		loadedState.pendingSuperClick = savedPendingSuperClick === '1';
		if (savedTotalClicks !== null) loadedState.totalClicks = Math.max(0, Math.floor(toFiniteNumber(savedTotalClicks, initialState.totalClicks)));
		if (savedTotalCoinsEarned !== null) loadedState.totalCoinsEarned = Math.max(0, toInt(savedTotalCoinsEarned));
		if (savedClickUpgradesCount !== null) loadedState.clickUpgradesCount = Math.max(0, Math.floor(toFiniteNumber(savedClickUpgradesCount, initialState.clickUpgradesCount)));
		if (savedSkinsBoughtCount !== null) loadedState.skinsBoughtCount = Math.max(0, Math.floor(toFiniteNumber(savedSkinsBoughtCount, initialState.skinsBoughtCount)));
		loadedState.achievementsButtonUnlocked = savedAchievementsButtonUnlocked === '1';

		if (savedAchievementCounters) {
			try {
				const parsedCounters = JSON.parse(savedAchievementCounters) || {};
				loadedState.achievementCounters.boostComboBest = Math.max(0, Math.floor(toFiniteNumber(parsedCounters.boostComboBest, 0)));
				loadedState.achievementCounters.boostTime = Math.max(0, toFiniteNumber(parsedCounters.boostTime, 0));
				if (Array.isArray(parsedCounters.boostTypesUsed)) {
					loadedState.boostTypesUsed = parsedCounters.boostTypesUsed.map((type) => String(type));
				}
			} catch {
				loadedState.achievementCounters = { ...initialState.achievementCounters };
				loadedState.boostTypesUsed = [];
			}
		}

		if (savedSeenUnlockedAchievements) {
			try {
				const parsedSeen = JSON.parse(savedSeenUnlockedAchievements);
				if (Array.isArray(parsedSeen)) {
					loadedState.seenUnlockedAchievementIds = parsedSeen
						.map((id) => Math.floor(toFiniteNumber(id, -1)))
						.filter((id) => id > 0);
				}
			} catch {
				loadedState.seenUnlockedAchievementIds = [];
			}
		}

		if (savedAchievementsState) {
			try {
				const parsedState = JSON.parse(savedAchievementsState);
				if (Array.isArray(parsedState)) {
					loadedState.achievementsState = parsedState;
				} else if (parsedState && typeof parsedState === 'object' && Array.isArray(parsedState.series)) {
					loadedState.achievementsState = parsedState;
				} else if (parsedState && typeof parsedState === 'object' && Array.isArray(parsedState.legacy)) {
					loadedState.achievementsState = parsedState.legacy;
				}
			} catch {
				// игнор
			}
		}

		loadedState.brightness = savedBrightness !== null
			? clamp(savedBrightness, BR_MIN, BR_MAX)
			: initialState.brightness;
		loadedState.volume = savedVolume !== null ? clamp01(savedVolume) : initialState.volume;
		loadedState.theme = savedTheme !== null ? normalizeTheme(savedTheme) : initialState.theme;

		stopAllTransientProcesses();
		applyGameState(loadedState);
		applyInterfaceSettings({
			brightnessValue: loadedState.brightness,
			volumeValue: loadedState.volume,
			themeValue: loadedState.theme,
			save: false,
		});
		const now = Date.now();
		const offlineBoost = boostById.get('offline_accelerator');
		const offlineReward = calculateOfflineReward(lastSeenAt, now, Math.max(0, getEffectiveRobotIncome()), offlineBoost);
		if (offlineReward > 0) {
			coins = toInt(coins + offlineReward);
			totalCoinsEarned = toInt(totalCoinsEarned + offlineReward);
		}

		Object.entries(activeBoosts).forEach(([id, data]) => {
			if (toFiniteNumber(data.endAt, 0) <= now) {
				delete activeBoosts[id];
				return;
			}
			if (!toFiniteNumber(data.durationMs, 0)) {
				activeBoosts[id].durationMs = Math.max(1000, toFiniteNumber(data.endAt, now) - toFiniteNumber(data.startAt, now));
			}
			scheduleBoostTimer(id);
		});
		updateBoostDerivedState();
	}

	// Клик по роботу
	if (clickObject) {
		clickObject.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			lastRobotClickAt = Date.now();
			playSound('click');
			let gainedCoins = getEffectiveCoinsPerClick();
			if (pendingSuperClick) {
				gainedCoins *= 25;
				pendingSuperClick = false;
			}
			const criticalBoost = boostById.get('critical_overload');
			const critChance = criticalBoost ? toFiniteNumber(criticalBoost.currentChance, criticalBoost.baseChance || 0.3) : 0.3;
			const critPower = criticalBoost ? toFiniteNumber(criticalBoost.currentEffect, 10) : 10;
			if (critBoostActive && Math.random() < critChance) {
				gainedCoins *= critPower;
				showBoostActivation(currentLanguage === 'en' ? `CRIT x${toInt(critPower)}` : `КРИТ x${toInt(critPower)}`);
			}
				gainedCoins = toInt(gainedCoins);
				coins = toInt(coins + gainedCoins);
				totalCoinsEarned = toInt(totalCoinsEarned + gainedCoins);
				totalClicks += 1;

			// прогресс уровня по кликам
			levelClicks += 1;
			const req = requiredClicksForLevel(level);
			if (levelClicks >= req) {
				level += 1;
				levelClicks = 0; // шкала обнуляется при апе
				playLevelUpGlow(); // мягкое свечение
			}

			updateUI();
			saveGame();
			createFloatingNumber(e.clientX, e.clientY, gainedCoins);
		});
	}

	bindGenericButtonSound();
	initResetProgressButton();
	initVolumeControl();
	syncAppViewportHeight();
	setupViewportScrollLock();
	window.addEventListener('resize', syncAppViewportHeight, { passive: true });
	window.visualViewport?.addEventListener('resize', syncAppViewportHeight, { passive: true });
		loadGame(); // 1. загружаем сохранение
		totalCoinsEarned = Math.max(toInt(totalCoinsEarned), toInt(coins));
		restoreAchievementsButtonState();
		updatePermanentBonusesFromAchievements();
	setInterval(() => {
		renderActiveBoosts();
	}, 250);
	updateClickObjectSkin();
	renderSkinsGrid();
	if (robotIncomePerSecond > 0) {
		startRobotIncomeTimer();
	} else {
		stopRobotIncomeTimer();
	}
	updateUI(); // 2. показываем данные на экране
	applyInterfaceSettings({
		brightnessValue: brightness,
		volumeValue: globalVolume,
		themeValue: getStorageItem(THEME_KEY) || DEFAULT_THEME,
		save: false,
	});
	notifyLoadingReady();
	initTvControls();
	initSDK();

	// Сохранение при перезагрузке/закрытии и при уходе со страницы
	window.addEventListener('beforeunload', saveGame);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') {
			pauseAllSounds();
			markGameplayStop();
			saveGame();
		} else {
			syncGameplayState();
		}
	});
	window.addEventListener('blur', () => {
		pauseAllSounds();
		markGameplayStop();
	});

	// "вылет" числа в точке клика (рисуем внутри #game)
	function createFloatingNumber(clientX, clientY, value) {
		if (!gameEl) return;

		const rect = gameEl.getBoundingClientRect();
		const x = clientX - rect.left;
		const y = clientY - rect.top;

		const el = document.createElement('div');
		el.className = 'floating-number';

		const randomX = (Math.random() - 0.5) * 40;
		el.textContent = `+${value}`;
		el.style.left = `${x + randomX}px`;
		el.style.top = `${y}px`;

		gameEl.appendChild(el);
		setTimeout(() => el.remove(), 900);
	}

	// Уровень
	function requiredClicksForLevel(lvl) {
		const safeLevel = Math.max(0, Math.floor(toFiniteNumber(lvl, 0)));
		return Math.max(1, Math.round(LEVEL_FIRST_CLICKS * Math.pow(LEVEL_MULTIPLIER, safeLevel)));
	}

	function updateLevelUI() {
		if (!levelFillEl || !levelTextEl) return;

		const req = requiredClicksForLevel(level);
		const safeLevelClicks = Math.max(0, toFiniteNumber(levelClicks, 0));
		const progress = Math.min(safeLevelClicks / req, 1);
		levelFillEl.style.width = `${(progress * 100).toFixed(2)}%`;

		// Поддержка data-lang-template="LVL {n}"
		const template = levelTextEl.dataset.langTemplate || 'LVL {n}';
		levelTextEl.textContent = template.replace('{n}', level);

		if (levelBarEl) {
			levelBarEl.setAttribute('aria-valuenow', String(safeLevelClicks));
			levelBarEl.setAttribute('aria-valuemax', String(req));
		}
	}

	function playLevelUpGlow() {
		if (!levelBarEl) return;
		levelBarEl.classList.remove('level-up');
		void levelBarEl.offsetWidth; // перезапуск анимации
		levelBarEl.classList.add('level-up');
		setTimeout(() => levelBarEl.classList.remove('level-up'), 900);
	}

	// улучшение клика
	function updateClickUpgradeUI() {
		// Цена на кнопке
		const displayPrice = pendingDiscount ? toInt(upgradePrice * 0.5) : toInt(upgradePrice);
		if (upgradeClickPriceEl) {
			upgradeClickPriceEl.textContent = `${displayPrice} 💰`;
		}

		// Блокировка/разблокировка
		if (upgradeClickBtn) {
			const disabled = coins < displayPrice;
			upgradeClickBtn.disabled = disabled;
			upgradeClickBtn.classList.toggle('disabled', disabled);
		}
	}

	function updateRobotUpgradeUI() {
		const displayPrice = pendingDiscount ? toInt(robotPrice * 0.5) : toInt(robotPrice);
		if (autoBotPriceEl) {
			autoBotPriceEl.textContent = `${displayPrice} 💰`;
		}

		if (robotInfoEl) {
			robotInfoEl.textContent = currentLanguage === 'en' ? `+${toInt(robotIncomePerSecond)}/sec • ${toInt(robotCount)} bought` : `+${toInt(robotIncomePerSecond)}/сек • ${toInt(robotCount)} куплено`;
		}

		if (autoBotBtn) {
			const disabled = coins < displayPrice;
			autoBotBtn.disabled = disabled;
			autoBotBtn.classList.toggle('disabled', disabled);
		}
	}

	function buyAutoBot() {
		const finalPrice = pendingDiscount ? toInt(robotPrice * 0.5) : toInt(robotPrice);
		if (coins < finalPrice) return;
		coins = toInt(coins - finalPrice);
		pendingDiscount = false;
		robotCount += 1;
		robotIncomePerSecond += 1;
		robotPrice = toInt(robotPrice * 2);

		startRobotIncomeTimer();
		updateUI();
		saveGame();
	}

	// Покупка улучшения клика
	function buyClickUpgrade() {
		const finalPrice = pendingDiscount ? toInt(upgradePrice * 0.5) : toInt(upgradePrice);
		if (coins < finalPrice) return;

			coins = toInt(coins - finalPrice);
			pendingDiscount = false;
			clickPower += 1;
			clickUpgradesCount += 1;

		// Плавный рост цены на 15%, но всегда минимум +1
		upgradePrice = Math.max(toInt(upgradePrice + 1), toInt(upgradePrice * 1.15));

		updateUI();
		saveGame();
	}

	// Кнопка "Улучшить клик"
	if (upgradeClickBtn) {
		upgradeClickBtn.addEventListener('click', buyClickUpgrade);
	}

	// Кнопка "Робот"
	if (autoBotBtn) {
		autoBotBtn.addEventListener('click', buyAutoBot);
	}
});