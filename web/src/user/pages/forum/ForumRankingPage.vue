<template>
  <section class="surface panel ranking-page">
    <div class="ranking-header">
      <div>
        <h2>社区热度榜</h2>
        <p class="muted">浏览、点赞、评论、收藏、分享共同计入热度，最新内容会获得一定优势。</p>
      </div>
      <n-tabs v-model:value="range" type="segment" @update:value="load">
        <n-tab name="day" tab="日榜" />
        <n-tab name="week" tab="周榜" />
        <n-tab name="all" tab="总榜" />
      </n-tabs>
    </div>

    <div class="word-cloud-panel">
      <div class="word-cloud-copy">
        <span class="status-pill">社区词云</span>
        <h3>大家正在讨论什么</h3>
        <p class="muted">词云来自帖子 Tag，字号根据出现频次计算，帮助你快速判断社区关注点。</p>
      </div>
      <div class="word-cloud-stage">
        <canvas ref="cloudRef" class="word-cloud-canvas" width="760" height="280" aria-label="社区词云"></canvas>
      </div>
    </div>

    <div v-if="posts.length" class="ranking-list">
      <button v-for="(post, index) in posts" :key="post.id" type="button" class="ranking-item" @click="$router.push(`/forum/${post.id}`)">
        <strong>#{{ index + 1 }} {{ post.title }}</strong>
        <span class="post-stat-row">
          <span class="post-stat" title="浏览"><Eye :size="14" />{{ post.viewCount }}</span>
          <span class="post-stat" title="点赞"><Heart :size="14" />{{ post.likeCount }}</span>
          <span class="post-stat" title="评论"><MessageCircle :size="14" />{{ post.commentCount }}</span>
          <span class="post-stat" title="收藏"><Star :size="14" />{{ post.favoriteCount }}</span>
          <span class="post-stat" title="分享"><Share2 :size="14" />{{ post.shareCount }}</span>
        </span>
      </button>
    </div>
    <div v-else class="empty-state">暂无热榜数据</div>
  </section>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Eye, Heart, MessageCircle, Share2, Star } from '@lucide/vue';
import { request } from '../../../shared/http.js';

const range = ref('day');
const posts = ref([]);
const words = ref([]);
const cloudRef = ref(null);
let resizeHandler = null;
let themeHandler = null;

onMounted(async () => {
  await load();
  resizeHandler = () => drawWordCloud();
  themeHandler = () => drawWordCloud();
  window.addEventListener('resize', resizeHandler);
  window.addEventListener('campus-theme-change', themeHandler);
});

onBeforeUnmount(() => {
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
  if (themeHandler) window.removeEventListener('campus-theme-change', themeHandler);
});

watch(words, () => {
  nextTick(drawWordCloud);
});

async function load() {
  const [rankingData, cloudData] = await Promise.all([
    request(`/api/forum/rankings?range=${range.value}`),
    request('/api/forum/word-cloud')
  ]);
  posts.value = rankingData.posts || [];
  words.value = cloudData.words || [];
  await nextTick();
  drawWordCloud();
}

function drawWordCloud() {
  const canvas = cloudRef.value;
  if (!canvas) return;
  const parent = canvas.parentElement;
  const width = Math.max(320, parent?.clientWidth || 760);
  const height = 280;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const theme = readCanvasTheme();
  paintCloudBackground(ctx, width, height, theme);

  const data = words.value
    .filter((item) => item.text && Number(item.value) > 0)
    .slice(0, 36);
  if (!data.length) {
    ctx.fillStyle = theme.muted;
    ctx.font = '600 15px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无 Tag 数据', width / 2, height / 2);
    return;
  }

  const max = Math.max(...data.map((item) => Number(item.value)));
  const min = Math.min(...data.map((item) => Number(item.value)));
  const palette = [theme.brand, theme.accent, theme.blue, theme.warning, theme.ink, theme.brandStrong];
  const placed = [];
  data.forEach((item, index) => {
    const value = Number(item.value);
    const ratio = max === min ? 1 : (value - min) / (max - min);
    const fontSize = Math.round(15 + ratio * 24 + (index < 3 ? 5 : 0));
    ctx.font = `${index < 5 ? 800 : 700} ${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    const textWidth = ctx.measureText(item.text).width;
    const textHeight = fontSize * 1.15;
    const box = placeWord(width, height, textWidth, textHeight, placed, index);
    if (!box) return;
    placed.push(box);
    ctx.fillStyle = palette[index % palette.length];
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(item.text, box.x, box.y + box.h / 2);
  });
}

function placeWord(width, height, textWidth, textHeight, placed, index) {
  const centerX = width / 2;
  const centerY = height / 2;
  for (let step = 0; step < 220; step += 1) {
    const angle = step * 0.48 + index;
    const radius = 4 + step * 1.9;
    const x = centerX + Math.cos(angle) * radius - textWidth / 2;
    const y = centerY + Math.sin(angle) * radius * 0.58 - textHeight / 2;
    const box = { x, y, w: textWidth, h: textHeight };
    if (box.x < 14 || box.y < 14 || box.x + box.w > width - 14 || box.y + box.h > height - 14) continue;
    if (!placed.some((item) => intersects(box, item))) return box;
  }
  return null;
}

function intersects(a, b) {
  const padding = 7;
  return !(
    a.x + a.w + padding < b.x
    || b.x + b.w + padding < a.x
    || a.y + a.h + padding < b.y
    || b.y + b.h + padding < a.y
  );
}

function paintCloudBackground(ctx, width, height, theme) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, theme.surface);
  gradient.addColorStop(1, theme.surface2);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = theme.line;
  for (let x = 0; x < width; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function readCanvasTheme() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  return {
    surface: read('--surface', '#fffdf8'),
    surface2: read('--surface-2', '#edf5f2'),
    ink: read('--ink', '#18202f'),
    muted: read('--muted', '#657084'),
    line: read('--line', '#ddd7cb'),
    brand: read('--brand', '#146c60'),
    brandStrong: read('--brand-strong', '#0b4f47'),
    accent: read('--accent', '#c9572b'),
    blue: read('--blue', '#2e5fa8'),
    warning: read('--warning', '#b7791f')
  };
}
</script>
