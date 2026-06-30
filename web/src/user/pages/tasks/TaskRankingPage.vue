<template>
  <section class="surface panel">
    <n-space justify="space-between" align="center">
      <div>
        <h2 style="margin: 0;">接单者排行榜</h2>
        <p class="muted">综合完成量、好评和信用分，帮助发布者选择更可靠的接单者。</p>
      </div>
      <n-tabs v-model:value="range" type="segment" @update:value="load">
        <n-tab name="week" tab="周榜" />
        <n-tab name="month" tab="月榜" />
      </n-tabs>
    </n-space>
    <n-list v-if="ranking.length" style="margin-top: 14px;">
      <n-list-item v-for="(item, index) in ranking" :key="item.userId">
        <n-space justify="space-between" align="center">
          <div>
            <strong>#{{ index + 1 }} {{ item.user?.nickname }}</strong>
            <p class="muted" style="margin: 4px 0 0;">完成 {{ item.completed }} 单 · 好评率 {{ item.positiveRate }}% · 信用分 {{ item.user?.creditScore }}</p>
          </div>
          <n-tag type="success">综合分 {{ item.score }}</n-tag>
        </n-space>
      </n-list-item>
    </n-list>
    <div v-else class="empty-state">暂无完成任务，排行榜会在任务完成后生成</div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { request } from '../../../shared/http.js';

const range = ref('week');
const ranking = ref([]);

onMounted(load);

async function load() {
  ranking.value = (await request(`/api/tasks/ranking?range=${range.value}`)).ranking;
}
</script>
