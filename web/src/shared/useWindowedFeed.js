import { computed, nextTick, ref } from 'vue';

export function useWindowedFeed(options) {
  const pageSize = options.pageSize || 12;
  const maxItems = options.maxItems || 48;
  const getId = options.getId || ((item) => item.id);
  const items = ref([]);
  const loading = ref(false);
  const refreshing = ref(false);
  const finished = ref(false);
  const offset = ref(0);
  const total = ref(0);
  const seed = ref(createFeedSeed());

  const isEmpty = computed(() => !loading.value && !items.value.length);
  const windowStart = computed(() => Math.max(0, offset.value - items.value.length));

  async function loadMore() {
    if (loading.value || finished.value) return;
    const requestOffset = offset.value;
    loading.value = true;
    try {
      const data = await options.loadPage({
        limit: pageSize,
        offset: requestOffset,
        seed: seed.value
      });
      const nextItems = Array.isArray(data.items) ? data.items : [];
      const currentIds = new Set(items.value.map(getId));
      const uniqueItems = nextItems.filter((item) => !currentIds.has(getId(item)));
      offset.value = Number(data.pageInfo?.nextOffset ?? requestOffset + nextItems.length);
      total.value = Number(data.pageInfo?.total ?? total.value ?? 0);
      const merged = [...items.value, ...uniqueItems];
      items.value = merged.length > maxItems ? merged.slice(merged.length - maxItems) : merged;
      finished.value = data.pageInfo?.hasMore === false || nextItems.length < pageSize;
    } finally {
      loading.value = false;
    }
    await nextTick();
    if (!finished.value && document.documentElement.scrollHeight <= window.innerHeight + 80) {
      await loadMore();
    }
  }

  async function refresh() {
    refreshing.value = true;
    seed.value = createFeedSeed();
    items.value = [];
    offset.value = 0;
    total.value = 0;
    finished.value = false;
    try {
      await loadMore();
      await nextTick();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      refreshing.value = false;
    }
  }

  function handleWindowScroll() {
    if (loading.value || finished.value) return;
    const bottom = window.innerHeight + window.scrollY;
    const height = document.documentElement.scrollHeight;
    if (bottom >= height - 520) loadMore();
  }

  function reset() {
    seed.value = createFeedSeed();
    items.value = [];
    offset.value = 0;
    total.value = 0;
    finished.value = false;
  }

  return {
    items,
    loading,
    refreshing,
    finished,
    offset,
    total,
    seed,
    isEmpty,
    windowStart,
    loadMore,
    refresh,
    handleWindowScroll,
    reset
  };
}

function createFeedSeed() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
