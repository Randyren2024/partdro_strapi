<script setup lang="ts">
import { antdTheme } from '~/theme/antd'
</script>

<template>
  <a-config-provider :theme="antdTheme">
    <a-extract-style>
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </a-extract-style>
  </a-config-provider>
</template>