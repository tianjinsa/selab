import { computed, ref } from 'vue';
import { darkTheme } from 'naive-ui';

const STORAGE_KEY = 'campus-life-theme-mode';
const validModes = new Set(['system', 'light', 'dark']);
const themeMode = ref(readStoredMode());
const systemDark = ref(false);
let mediaQuery = null;
let initialized = false;

const fontFamily = 'Inter, "MiSans", "HarmonyOS Sans SC", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif';

const sharedThemeOverrides = {
  Button: {
    borderRadiusMedium: '999px',
    borderRadiusLarge: '999px',
    fontWeight: '760',
    heightMedium: '38px',
    heightLarge: '44px',
    paddingMedium: '0 16px',
    paddingLarge: '0 20px'
  },
  Input: {
    borderRadius: '8px',
    heightMedium: '38px',
    heightLarge: '44px'
  },
  Select: {
    peers: {
      InternalSelection: {
        borderRadius: '8px',
        heightMedium: '38px',
        heightLarge: '44px'
      }
    }
  },
  Tag: {
    borderRadius: '999px',
    fontWeightStrong: '760'
  },
  Tabs: {
    tabFontWeightActive: '760'
  }
};

const lightThemeOverrides = {
  common: {
    borderRadius: '8px',
    borderRadiusSmall: '6px',
    fontFamily,
    fontWeightStrong: '760',
    primaryColor: '#0f766e',
    primaryColorHover: '#12877e',
    primaryColorPressed: '#0b5f59',
    primaryColorSuppl: '#12877e',
    infoColor: '#2f67b1',
    warningColor: '#b7791f',
    errorColor: '#b42318',
    bodyColor: '#f2f7f5',
    cardColor: '#fffffc',
    modalColor: '#fffffc',
    tableColor: '#fffffc',
    popoverColor: '#fffffc',
    borderColor: '#d6e2de',
    textColor1: '#14202b',
    textColor2: '#46566a',
    textColor3: '#647184'
  },
  ...sharedThemeOverrides,
  DataTable: {
    thColor: '#f4f8f7',
    tdColorHover: 'rgba(15, 118, 110, 0.06)',
    borderColor: '#d6e2de'
  }
};

const darkThemeOverrides = {
  common: {
    borderRadius: '8px',
    borderRadiusSmall: '6px',
    fontFamily,
    fontWeightStrong: '760',
    primaryColor: '#5eead4',
    primaryColorHover: '#7cf3df',
    primaryColorPressed: '#2dd4bf',
    primaryColorSuppl: '#7cf3df',
    infoColor: '#93b4ff',
    warningColor: '#f2bd63',
    errorColor: '#ff837a',
    bodyColor: '#0a1013',
    cardColor: '#131b20',
    modalColor: '#131b20',
    tableColor: '#131b20',
    popoverColor: '#182226',
    borderColor: '#2a3940',
    textColor1: '#eef7f4',
    textColor2: '#c4d0d3',
    textColor3: '#91a2a8'
  },
  ...sharedThemeOverrides,
  DataTable: {
    thColor: '#182226',
    tdColorHover: 'rgba(94, 234, 212, 0.08)',
    borderColor: '#2a3940'
  }
};

const resolvedThemeMode = computed(() => (
  themeMode.value === 'system'
    ? (systemDark.value ? 'dark' : 'light')
    : themeMode.value
));

const isDark = computed(() => resolvedThemeMode.value === 'dark');
const naiveTheme = computed(() => (isDark.value ? darkTheme : null));
const naiveThemeOverrides = computed(() => (isDark.value ? darkThemeOverrides : lightThemeOverrides));

export const themeModeOptions = [
  { label: '跟随系统', key: 'system' },
  { label: '浅色模式', key: 'light' },
  { label: '深色模式', key: 'dark' }
];

export function initializeThemeMode() {
  if (!canUseDom()) return;
  if (!initialized) {
    mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)') || null;
    systemDark.value = Boolean(mediaQuery?.matches);
    mediaQuery?.addEventListener?.('change', handleSystemThemeChange);
    window.addEventListener('storage', handleStorageChange);
    initialized = true;
  }
  applyTheme();
}

export function useThemeMode() {
  initializeThemeMode();
  return {
    themeMode,
    resolvedThemeMode,
    isDark,
    naiveTheme,
    naiveThemeOverrides,
    themeModeOptions,
    setThemeMode,
    toggleDarkMode
  };
}

export function setThemeMode(mode) {
  const nextMode = validModes.has(mode) ? mode : 'system';
  themeMode.value = nextMode;
  if (canUseDom()) {
    localStorage.setItem(STORAGE_KEY, nextMode);
  }
  applyTheme();
}

export function toggleDarkMode() {
  setThemeMode(isDark.value ? 'light' : 'dark');
}

function readStoredMode() {
  if (!canUseDom()) return 'system';
  const stored = localStorage.getItem(STORAGE_KEY);
  return validModes.has(stored) ? stored : 'system';
}

function handleSystemThemeChange(event) {
  systemDark.value = Boolean(event.matches);
  applyTheme();
}

function handleStorageChange(event) {
  if (event.key !== STORAGE_KEY) return;
  themeMode.value = validModes.has(event.newValue) ? event.newValue : 'system';
  applyTheme();
}

function applyTheme() {
  if (!canUseDom()) return;
  const resolved = resolvedThemeMode.value;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = themeMode.value;
  document.documentElement.style.colorScheme = resolved;
  window.dispatchEvent(new CustomEvent('campus-theme-change', {
    detail: { mode: themeMode.value, theme: resolved }
  }));
}

function canUseDom() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}
