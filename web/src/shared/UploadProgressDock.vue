<template>
  <Teleport to="body">
    <transition name="upload-dock-flow">
      <section v-if="uploadState.items.length && uploadState.panelOpen" class="upload-dock" aria-live="polite">
        <header class="upload-dock-header">
          <div>
            <strong>上传进度</strong>
            <span>{{ summary.finished }}/{{ summary.total }}</span>
          </div>
          <div class="upload-dock-actions">
            <button
              v-if="summary.finished"
              type="button"
              class="upload-dock-text-button"
              @click="clearFinishedUploads"
            >
              清除已完成
            </button>
            <button type="button" class="upload-dock-icon-button" title="收起上传浮窗" @click="closeUploadPanel">
              <X :size="16" />
            </button>
          </div>
        </header>

        <div class="upload-dock-meter">
          <span :style="{ width: `${summary.percent}%` }"></span>
        </div>

        <div class="upload-dock-list">
          <article v-for="item in uploadState.items" :key="item.id" class="upload-dock-item" :class="item.status">
            <span class="upload-dock-status">
              <Loader2 v-if="item.status === 'uploading'" :size="16" />
              <Check v-else-if="item.status === 'done'" :size="16" />
              <AlertCircle v-else :size="16" />
            </span>
            <div>
              <strong>{{ item.name }}</strong>
              <small>{{ itemStatusText(item) }}</small>
            </div>
          </article>
        </div>
      </section>
    </transition>

    <transition name="upload-dock-flow">
      <button
        v-if="uploadState.items.length && !uploadState.panelOpen"
        type="button"
        class="upload-dock-compact"
        :style="compactStyle"
        title="查看上传进度"
        @click="openUploadPanel"
      >
        <UploadCloud :size="18" />
        <span>{{ summary.percent }}%</span>
      </button>
    </transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue';
import { AlertCircle, Check, Loader2, UploadCloud, X } from '@lucide/vue';
import {
  clearFinishedUploads,
  closeUploadPanel,
  openUploadPanel,
  uploadState,
  uploadSummary
} from './uploadManager.js';

const summary = uploadSummary;
const compactStyle = computed(() => ({
  '--upload-percent': `${summary.value.percent}%`
}));

function itemStatusText(item) {
  if (item.status === 'done') return '上传完成';
  if (item.status === 'error') return item.error || '上传失败';
  return '正在上传';
}
</script>

<style scoped>
.upload-dock,
.upload-dock-compact {
  position: fixed;
  left: 22px;
  z-index: 80;
  color: var(--ink);
}

.upload-dock {
  bottom: 22px;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  width: min(360px, calc(100vw - 32px));
  height: 260px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-soft);
  box-shadow: 0 22px 58px rgba(22, 33, 31, 0.18);
  backdrop-filter: blur(18px);
}

.upload-dock-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 12px 10px;
  border-bottom: 1px solid rgba(20, 108, 96, 0.12);
}

.upload-dock-header > div:first-child {
  display: grid;
  gap: 2px;
}

.upload-dock-header strong {
  font-size: 14px;
}

.upload-dock-header span,
.upload-dock-item small {
  color: var(--muted);
  font-size: 12px;
}

.upload-dock-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.upload-dock-text-button,
.upload-dock-icon-button,
.upload-dock-compact {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.upload-dock-text-button {
  padding: 5px 8px;
  border-radius: 999px;
  color: var(--brand);
  background: var(--brand-tint-soft);
  font-size: 12px;
  font-weight: 760;
}

.upload-dock-icon-button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  color: var(--muted);
  background: transparent;
}

.upload-dock-text-button:hover,
.upload-dock-icon-button:hover {
  transform: translateY(-1px);
  background: var(--brand-tint);
}

.upload-dock-meter {
  height: 3px;
  background: rgba(20, 108, 96, 0.12);
}

.upload-dock-meter span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--brand), var(--blue));
  transition: width var(--motion-mid) var(--motion-ease);
}

.upload-dock-list {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 8px;
}

.upload-dock-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  padding: 9px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  transition:
    transform var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.upload-dock-item:hover {
  transform: translateY(-1px);
  border-color: var(--line);
  background: var(--surface-muted);
}

.upload-dock-status {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  color: var(--brand);
  background: var(--brand-tint);
}

.upload-dock-item.uploading .upload-dock-status svg {
  animation: upload-spin 1s linear infinite;
}

.upload-dock-item.error .upload-dock-status {
  color: var(--danger);
  background: rgba(180, 35, 24, 0.1);
}

.upload-dock-item.done .upload-dock-status {
  color: var(--brand);
}

.upload-dock-item strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.upload-dock-item small {
  display: block;
  margin-top: 2px;
}

.upload-dock-compact {
  bottom: 24px;
  display: inline-grid;
  grid-template-columns: auto auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 8px 8px;
  border-radius: 999px;
  color: var(--ink);
  background:
    linear-gradient(var(--surface-soft), var(--surface-soft)) padding-box,
    conic-gradient(var(--brand) var(--upload-percent), rgba(20, 108, 96, 0.14) 0) border-box;
  border: 3px solid transparent;
  box-shadow: 0 18px 44px rgba(22, 33, 31, 0.16);
  backdrop-filter: blur(16px);
}

.upload-dock-compact:hover {
  transform: translateY(-2px);
}

.upload-dock-compact span {
  min-width: 34px;
  font-size: 12px;
  font-weight: 850;
}

.upload-dock-flow-enter-active,
.upload-dock-flow-leave-active {
  transition:
    opacity var(--motion-mid) var(--motion-ease),
    transform var(--motion-mid) var(--motion-ease),
    filter var(--motion-mid) var(--motion-ease);
}

.upload-dock-flow-enter-from,
.upload-dock-flow-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
  filter: blur(2px);
}

@keyframes upload-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 560px) {
  .upload-dock,
  .upload-dock-compact {
    left: 14px;
  }

  .upload-dock {
    bottom: 14px;
    height: 238px;
    width: calc(100vw - 28px);
  }
}
</style>
