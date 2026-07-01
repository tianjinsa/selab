<template>
  <Teleport to="body">
    <div class="app-overlay-scrollbar-layer" aria-hidden="true">
      <div
        v-for="bar in bars"
        :key="bar.key"
        class="app-overlay-scrollbar"
        :class="[
          bar.axis === 'y' ? 'app-overlay-scrollbar-y' : 'app-overlay-scrollbar-x',
          { active: bar.active, dragging: bar.dragging }
        ]"
        :style="bar.trackStyle"
        @pointerenter="setHover(bar.targetId, bar.axis, true)"
        @pointerleave="setHover(bar.targetId, bar.axis, false)"
        @pointerdown.prevent.stop="startTrackDrag($event, bar)"
      >
        <div
          class="app-overlay-scrollbar-thumb"
          :style="bar.thumbStyle"
          @pointerdown.prevent.stop="startThumbDrag($event, bar)"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const bars = ref([]);

const HIDE_CLASS = 'app-scrollbar-native-hidden';
const ROOT_CLASS = 'app-scrollbar-root';
const MIN_THUMB_SIZE = 34;
const TRACK_PADDING = 6;
const BAR_SIZE = 12;
const VIEWPORT_MARGIN = 4;
const ACTIVE_MS = 900;
const SCAN_DELAY_MS = 80;

let targetIndex = 0;
let animationFrame = 0;
let scanTimer = 0;
let activeTimer = 0;
let mutationObserver = null;
let resizeObserver = null;
let dragging = null;
const targets = new Map();
const elementIds = new WeakMap();

function createPageTarget() {
  targets.set('page', {
    id: 'page',
    element: document.scrollingElement || document.documentElement,
    page: true,
    activeUntil: 0,
    hover: { x: false, y: false }
  });
}

function scheduleUpdate() {
  if (animationFrame) return;
  animationFrame = window.requestAnimationFrame(() => {
    animationFrame = 0;
    updateBars();
  });
}

function scheduleScan() {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(async () => {
    await nextTick();
    scanTargets();
    scheduleUpdate();
  }, SCAN_DELAY_MS);
}

function scanTargets() {
  const seen = new Set(['page']);
  const nodes = document.body ? Array.from(document.body.querySelectorAll('*')) : [];

  for (const element of nodes) {
    if (!(element instanceof HTMLElement)) continue;
    if (element.closest('.app-overlay-scrollbar-layer')) continue;
    if (shouldSkipElement(element)) continue;

    const axes = getScrollableAxes(element);
    if (!axes.x && !axes.y) continue;

    let id = elementIds.get(element);
    if (!id) {
      id = `el-${targetIndex += 1}`;
      elementIds.set(element, id);
    }
    if (!targets.has(id)) {
      targets.set(id, {
        id,
        element,
        page: false,
        activeUntil: 0,
        hover: { x: false, y: false }
      });
      resizeObserver?.observe(element);
    }
    element.classList.add(HIDE_CLASS);
    seen.add(id);
  }

  for (const [id, target] of targets) {
    if (target.page || seen.has(id)) continue;
    target.element.classList.remove(HIDE_CLASS);
    resizeObserver?.unobserve(target.element);
    targets.delete(id);
  }
}

function shouldSkipElement(element) {
  if (['SCRIPT', 'STYLE', 'LINK', 'META'].includes(element.tagName)) return true;
  if (element.isContentEditable) return true;
  if (['INPUT', 'SELECT'].includes(element.tagName)) return true;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 18 || rect.height <= 18) return true;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return true;
  return false;
}

function getScrollableAxes(element) {
  const style = window.getComputedStyle(element);
  const yMode = style.overflowY;
  const xMode = style.overflowX;
  return {
    y: canScrollMode(yMode) && element.scrollHeight > element.clientHeight + 1,
    x: canScrollMode(xMode) && element.scrollWidth > element.clientWidth + 1
  };
}

function canScrollMode(value) {
  return value === 'auto' || value === 'scroll' || value === 'overlay';
}

function updateBars() {
  const nextBars = [];
  const now = Date.now();

  for (const target of targets.values()) {
    const axes = target.page ? getPageAxes() : getScrollableAxes(target.element);
    if (axes.y) {
      const bar = createBar(target, 'y', now);
      if (bar) nextBars.push(bar);
    }
    if (axes.x) {
      const bar = createBar(target, 'x', now);
      if (bar) nextBars.push(bar);
    }
  }

  bars.value = nextBars;
}

function getPageAxes() {
  const element = document.scrollingElement || document.documentElement;
  return {
    y: element.scrollHeight > window.innerHeight + 1,
    x: element.scrollWidth > window.innerWidth + 1
  };
}

function createBar(target, axis, now) {
  const metrics = getMetrics(target, axis);
  const rect = getTrackRect(target, axis);
  if (!metrics || !rect) return null;

  const trackLength = axis === 'y' ? rect.height : rect.width;
  if (trackLength < MIN_THUMB_SIZE) return null;

  const thumbLength = clamp((metrics.clientSize / metrics.scrollSize) * trackLength, MIN_THUMB_SIZE, trackLength);
  const maxThumbOffset = Math.max(0, trackLength - thumbLength);
  const maxScroll = Math.max(1, metrics.scrollSize - metrics.clientSize);
  const thumbOffset = clamp((metrics.scrollPosition / maxScroll) * maxThumbOffset, 0, maxThumbOffset);
  const key = `${target.id}-${axis}`;
  const isDragging = dragging?.targetId === target.id && dragging?.axis === axis;
  const active = isDragging || target.hover[axis] || target.activeUntil > now;

  return {
    key,
    targetId: target.id,
    axis,
    active,
    dragging: isDragging,
    trackLength,
    thumbLength,
    thumbOffset,
    trackStyle: {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    },
    thumbStyle: axis === 'y'
      ? { height: `${thumbLength}px`, transform: `translateY(${thumbOffset}px)` }
      : { width: `${thumbLength}px`, transform: `translateX(${thumbOffset}px)` }
  };
}

function getMetrics(target, axis) {
  const element = target.page ? document.scrollingElement || document.documentElement : target.element;
  if (!element) return null;
  if (axis === 'y') {
    return {
      scrollPosition: target.page ? window.scrollY : element.scrollTop,
      scrollSize: target.page ? element.scrollHeight : element.scrollHeight,
      clientSize: target.page ? window.innerHeight : element.clientHeight
    };
  }
  return {
    scrollPosition: target.page ? window.scrollX : element.scrollLeft,
    scrollSize: target.page ? element.scrollWidth : element.scrollWidth,
    clientSize: target.page ? window.innerWidth : element.clientWidth
  };
}

function getTrackRect(target, axis) {
  const rect = target.page
    ? { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight }
    : target.element.getBoundingClientRect();

  if (rect.width <= 18 || rect.height <= 18) return null;
  if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) return null;

  const top = clamp(rect.top + TRACK_PADDING, VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN);
  const bottom = clamp(rect.bottom - TRACK_PADDING, VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN);
  const left = clamp(rect.left + TRACK_PADDING, VIEWPORT_MARGIN, window.innerWidth - VIEWPORT_MARGIN);
  const right = clamp(rect.right - TRACK_PADDING, VIEWPORT_MARGIN, window.innerWidth - VIEWPORT_MARGIN);

  if (axis === 'y') {
    const height = bottom - top;
    if (height <= MIN_THUMB_SIZE) return null;
    return {
      left: clamp(right - BAR_SIZE, VIEWPORT_MARGIN, window.innerWidth - BAR_SIZE - VIEWPORT_MARGIN),
      top,
      width: BAR_SIZE,
      height
    };
  }

  const width = right - left;
  if (width <= MIN_THUMB_SIZE) return null;
  return {
    left,
    top: clamp(bottom - BAR_SIZE, VIEWPORT_MARGIN, window.innerHeight - BAR_SIZE - VIEWPORT_MARGIN),
    width,
    height: BAR_SIZE
  };
}

function setHover(targetId, axis, value) {
  const target = targets.get(targetId);
  if (!target) return;
  target.hover[axis] = value;
  markActive(target);
  scheduleUpdate();
}

function markActive(target) {
  target.activeUntil = Date.now() + ACTIVE_MS;
  window.clearTimeout(activeTimer);
  activeTimer = window.setTimeout(scheduleUpdate, ACTIVE_MS + 40);
}

function startThumbDrag(event, bar) {
  const target = targets.get(bar.targetId);
  if (!target) return;
  const metrics = getMetrics(target, bar.axis);
  if (!metrics) return;
  markActive(target);
  dragging = {
    targetId: target.id,
    axis: bar.axis,
    startPointer: pointerPosition(event, bar.axis),
    startScroll: metrics.scrollPosition,
    trackLength: bar.trackLength,
    thumbLength: bar.thumbLength,
    maxScroll: Math.max(1, metrics.scrollSize - metrics.clientSize)
  };
  beginDocumentDrag();
  scheduleUpdate();
}

function startTrackDrag(event, bar) {
  const target = targets.get(bar.targetId);
  if (!target) return;
  const metrics = getMetrics(target, bar.axis);
  if (!metrics) return;

  const trackStart = bar.axis === 'y' ? event.currentTarget.getBoundingClientRect().top : event.currentTarget.getBoundingClientRect().left;
  const clickOffset = pointerPosition(event, bar.axis) - trackStart;
  const maxThumbOffset = Math.max(1, bar.trackLength - bar.thumbLength);
  const nextScroll = ((clickOffset - bar.thumbLength / 2) / maxThumbOffset) * Math.max(1, metrics.scrollSize - metrics.clientSize);
  setScrollPosition(target, bar.axis, nextScroll);

  markActive(target);
  dragging = {
    targetId: target.id,
    axis: bar.axis,
    startPointer: pointerPosition(event, bar.axis),
    startScroll: getMetrics(target, bar.axis)?.scrollPosition || 0,
    trackLength: bar.trackLength,
    thumbLength: bar.thumbLength,
    maxScroll: Math.max(1, metrics.scrollSize - metrics.clientSize)
  };
  beginDocumentDrag();
  scheduleUpdate();
}

function beginDocumentDrag() {
  document.body.classList.add('app-scrollbar-dragging');
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', endDrag, { once: true });
  window.addEventListener('pointercancel', endDrag, { once: true });
}

function onPointerMove(event) {
  if (!dragging) return;
  event.preventDefault();
  const target = targets.get(dragging.targetId);
  if (!target) return;
  const delta = pointerPosition(event, dragging.axis) - dragging.startPointer;
  const maxThumbOffset = Math.max(1, dragging.trackLength - dragging.thumbLength);
  const scrollDelta = (delta / maxThumbOffset) * dragging.maxScroll;
  setScrollPosition(target, dragging.axis, dragging.startScroll + scrollDelta);
  markActive(target);
  scheduleUpdate();
}

function endDrag() {
  dragging = null;
  document.body.classList.remove('app-scrollbar-dragging');
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', endDrag);
  window.removeEventListener('pointercancel', endDrag);
  scheduleUpdate();
}

function pointerPosition(event, axis) {
  return axis === 'y' ? event.clientY : event.clientX;
}

function setScrollPosition(target, axis, value) {
  const element = target.page ? document.scrollingElement || document.documentElement : target.element;
  if (!element) return;
  const metrics = getMetrics(target, axis);
  const nextValue = clamp(value, 0, Math.max(0, (metrics?.scrollSize || 0) - (metrics?.clientSize || 0)));
  if (target.page) {
    window.scrollTo({
      top: axis === 'y' ? nextValue : window.scrollY,
      left: axis === 'x' ? nextValue : window.scrollX,
      behavior: 'auto'
    });
  } else if (axis === 'y') {
    element.scrollTop = nextValue;
  } else {
    element.scrollLeft = nextValue;
  }
}

function onAnyScroll(event) {
  const targetElement = event.target === document ? document.scrollingElement || document.documentElement : event.target;
  const id = targetElement === document.scrollingElement || targetElement === document.documentElement
    ? 'page'
    : elementIds.get(targetElement);
  const target = targets.get(id);
  if (target) markActive(target);
  scheduleUpdate();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

onMounted(async () => {
  document.documentElement.classList.add(ROOT_CLASS);
  document.body.classList.add(ROOT_CLASS);
  createPageTarget();
  await nextTick();
  scanTargets();
  updateBars();

  mutationObserver = new MutationObserver((mutations) => {
    const overlayOnly = mutations.every((mutation) => (
      mutation.target instanceof Element
      && mutation.target.closest('.app-overlay-scrollbar-layer')
    ));
    if (!overlayOnly) scheduleScan();
  });
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'open']
  });

  resizeObserver = new ResizeObserver(scheduleScan);
  resizeObserver.observe(document.documentElement);
  resizeObserver.observe(document.body);
  for (const target of targets.values()) {
    if (!target.page) resizeObserver.observe(target.element);
  }

  window.addEventListener('scroll', onAnyScroll, true);
  window.addEventListener('resize', scheduleScan);
});

watch(() => route.fullPath, scheduleScan);

onBeforeUnmount(() => {
  window.clearTimeout(scanTimer);
  window.clearTimeout(activeTimer);
  if (animationFrame) window.cancelAnimationFrame(animationFrame);
  mutationObserver?.disconnect();
  resizeObserver?.disconnect();
  window.removeEventListener('scroll', onAnyScroll, true);
  window.removeEventListener('resize', scheduleScan);
  window.removeEventListener('pointermove', onPointerMove);
  document.documentElement.classList.remove(ROOT_CLASS);
  document.body.classList.remove(ROOT_CLASS, 'app-scrollbar-dragging');
  for (const target of targets.values()) {
    if (!target.page) target.element.classList.remove(HIDE_CLASS);
  }
  targets.clear();
});
</script>
