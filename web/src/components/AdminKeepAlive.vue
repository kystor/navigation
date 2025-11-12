<template>
  <div style="display:none"></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
import { setupSilentAutoRefresh } from '../hooks/useSilentRefresh';
import { setAccessToken } from '../api';

let removeHandlers = null;

onMounted(async () => {
  const setToken = (token) => {
    if (token) setAccessToken(token);
    else setAccessToken(null);
  };

  const { immediateRefresh, attachVisibilityHandlers } = setupSilentAutoRefresh(setToken);
  await immediateRefresh();
  removeHandlers = attachVisibilityHandlers();
});

onBeforeUnmount(() => {
  if (removeHandlers) removeHandlers();
});
</script>