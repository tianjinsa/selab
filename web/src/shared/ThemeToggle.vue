<template>
  <n-dropdown trigger="click" :options="options" @select="setThemeMode">
    <n-button class="theme-toggle-button" secondary circle :title="themeTitle" :aria-label="themeTitle">
      <template #icon>
        <component :is="themeIcon" :size="16" />
      </template>
    </n-button>
  </n-dropdown>
</template>

<script setup>
import { computed } from 'vue';
import { Monitor, Moon, Sun } from '@lucide/vue';
import { themeModeOptions, useThemeMode } from './theme.js';

const { themeMode, resolvedThemeMode, setThemeMode } = useThemeMode();

const options = computed(() => themeModeOptions.map((item) => ({
  ...item,
  props: {
    class: item.key === themeMode.value ? 'theme-option-active' : ''
  }
})));

const themeIcon = computed(() => {
  if (themeMode.value === 'system') return Monitor;
  return resolvedThemeMode.value === 'dark' ? Moon : Sun;
});

const themeTitle = computed(() => {
  const current = themeModeOptions.find((item) => item.key === themeMode.value)?.label || '主题设置';
  return `主题：${current}`;
});
</script>
