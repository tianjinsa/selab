<template>
  <span class="user-avatar" :style="avatarStyle" :aria-label="displayName">
    <img
      v-if="imageUrl && !imageFailed"
      :src="imageUrl"
      :alt="displayName"
      loading="lazy"
      @error="imageFailed = true"
    />
    <span v-else class="user-avatar-fallback">{{ fallbackText }}</span>
  </span>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { assetUrl } from './http.js';

const props = defineProps({
  src: {
    type: String,
    default: ''
  },
  name: {
    type: String,
    default: ''
  },
  size: {
    type: Number,
    default: 40
  }
});

const imageFailed = ref(false);
const imageUrl = computed(() => assetUrl(props.src));
const displayName = computed(() => props.name || '同学头像');
const fallbackText = computed(() => String(props.name || '同').slice(0, 1));
const avatarStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.max(12, Math.round(props.size * 0.42))}px`
}));

watch(imageUrl, () => {
  imageFailed.value = false;
});
</script>

<style scoped>
.user-avatar {
  position: relative;
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  overflow: hidden;
  border-radius: 999px;
  color: #ffffff;
  background:
    linear-gradient(135deg, rgba(20, 108, 96, 0.95), rgba(46, 95, 168, 0.9)),
    var(--brand);
  line-height: 1;
  vertical-align: middle;
}

.user-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-avatar-fallback {
  font-weight: 850;
}
</style>
