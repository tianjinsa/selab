<template>
  <section class="surface panel">
    <n-result status="info" :title="title" :description="`${phase} 将在独立分支完成，当前阶段已接入统一身份、私信和通知基础。`">
      <template #footer>
        <n-space justify="center">
          <n-button @click="$router.push('/')">返回工作台</n-button>
          <n-button type="primary" @click="$router.push('/messages')">打开私信</n-button>
        </n-space>
      </template>
    </n-result>
  </section>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  phase: { type: String, required: true }
});
</script>
