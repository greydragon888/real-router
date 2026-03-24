<script lang="ts">
  import { editorState } from "../editor-state";

  let text = $state("");

  $effect(() => {
    editorState.hasUnsaved = text.length > 0;
  });

  $effect(() => {
    return () => {
      editorState.hasUnsaved = false;
    };
  });
</script>

<div>
  <h1>Editor</h1>
  <p>
    Type something below, then try navigating away. The
    <code>canDeactivate</code> guard will prompt you to confirm leaving with
    unsaved changes.
  </p>
  <div class="form-group" style="margin-top: 16px">
    <textarea
      value={text}
      oninput={(event) => { text = event.currentTarget.value; }}
      rows={6}
      style="width: 100%; resize: vertical"
      placeholder="Type here to create unsaved changes..."
    ></textarea>
  </div>
  {#if text.length > 0}
    <p style="color: #c62828; font-size: 13px">
      Unsaved changes — navigating away will trigger the confirm dialog.
    </p>
  {/if}
</div>
