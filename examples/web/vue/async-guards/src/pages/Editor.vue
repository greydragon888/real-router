<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { editorState } from "../editor-state";

const text = ref("");

watch(text, (val) => {
  editorState.hasUnsaved = val.length > 0;
});

onUnmounted(() => {
  editorState.hasUnsaved = false;
});
</script>

<template>
  <div>
    <h1>Editor</h1>
    <p>
      Type something below, then try navigating away. The
      <code>canDeactivate</code> guard will prompt you to confirm leaving with
      unsaved changes.
    </p>
    <div class="form-group" :style="{ marginTop: '16px' }">
      <textarea
        v-model="text"
        rows="6"
        :style="{ width: '100%', resize: 'vertical' }"
        placeholder="Type here to create unsaved changes..."
      />
    </div>
    <p v-if="text.length > 0" :style="{ color: '#c62828', fontSize: '13px' }">
      Unsaved changes — navigating away will trigger the confirm dialog.
    </p>
  </div>
</template>
