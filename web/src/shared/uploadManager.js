import { computed, reactive } from 'vue';
import { request } from './http.js';

let nextUploadId = 1;

export const uploadState = reactive({
  items: [],
  panelOpen: true,
  userClosed: false
});

export const uploadSummary = computed(() => {
  const total = uploadState.items.length;
  const finished = uploadState.items.filter((item) => ['done', 'error'].includes(item.status)).length;
  const success = uploadState.items.filter((item) => item.status === 'done').length;
  const failed = uploadState.items.filter((item) => item.status === 'error').length;
  const uploading = uploadState.items.filter((item) => item.status === 'uploading').length;
  return {
    total,
    finished,
    success,
    failed,
    uploading,
    percent: total ? Math.round((finished / total) * 100) : 0
  };
});

export async function uploadFile(path, rawFile, options = {}) {
  if (!rawFile) throw new Error('没有选择文件');
  const item = addUploadItem(rawFile, options);
  try {
    const body = new FormData();
    body.append(options.fieldName || 'file', rawFile);
    const data = await request(path, { method: 'POST', body }, options.authKind || 'user');
    finishUploadItem(item.id, 'done');
    return data;
  } catch (error) {
    finishUploadItem(item.id, 'error', error.message || '上传失败');
    throw error;
  }
}

export function closeUploadPanel() {
  uploadState.panelOpen = false;
  uploadState.userClosed = true;
}

export function openUploadPanel() {
  if (!uploadState.items.length) return;
  uploadState.panelOpen = true;
  uploadState.userClosed = false;
}

export function clearFinishedUploads() {
  uploadState.items = uploadState.items.filter((item) => !['done', 'error'].includes(item.status));
  if (!uploadState.items.length) {
    uploadState.panelOpen = true;
    uploadState.userClosed = false;
  }
}

function addUploadItem(rawFile, options) {
  const item = {
    id: nextUploadId++,
    name: options.label || rawFile.name || '未命名文件',
    kind: options.type || rawFile.type || 'file',
    status: 'uploading',
    error: '',
    createdAt: Date.now()
  };
  uploadState.items.unshift(item);
  if (!uploadState.userClosed) {
    uploadState.panelOpen = true;
  }
  return item;
}

function finishUploadItem(id, status, error = '') {
  const item = uploadState.items.find((entry) => entry.id === id);
  if (!item) return;
  item.status = status;
  item.error = error;
  item.finishedAt = Date.now();
}
