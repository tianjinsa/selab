import { computed, ref } from 'vue';
import { darkTheme } from 'naive-ui';

const STORAGE_KEY = 'campus-life-theme-mode';
const validModes = new Set(['system', 'light', 'dark']);
const themeMode = ref(readStoredMode());
const systemDark = ref(false);
let mediaQuery = null;
let initialized = false;

const lightThemeOverrides = {
  common: {
    borderRadius: '8px',
    primaryColor: '#146c60',
    primaryColorHover: '#1a8173',
    primaryColorPressed: '#0b4f47',
    primaryColorSuppl: '#1a8173'
  }
};

const darkThemeOverrides = {
  common: {
    borderRadius: '8px',
    primaryColor: '#4dd7c0',
    primaryColorHover: '#79e4d2',
    primaryColorPressed: '#2aa992',
    primaryColorSuppl: '#79e4d2'
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
