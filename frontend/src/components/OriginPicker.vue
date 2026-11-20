<script setup lang="ts">
import { computed } from 'vue'
import type { OriginId } from '@/network/protocol'
import { COMPANIONS } from '@/config/gameData'
import { ORIGIN_IDS, ORIGINS, originStatsText } from '../../../shared/origins.ts'
import InkFigure from './InkFigure.vue'

/**
 * 开局家世四选一（docs/17 §七）：联机创角与本地「新游戏」共用。
 * 颜色取自所在页面的 --origin-* 变量，默认跟随主题；创角页是固定的暗色，自己覆盖。
 */
const model = defineModel<OriginId>()
defineProps<{ disabled?: boolean }>()
const chosen = computed(() => model.value && ORIGINS[model.value])
const kin = computed(() => chosen.value && COMPANIONS[chosen.value.companionId])
</script>

<template>
  <fieldset class="origin-picker" :disabled="disabled">
    <legend>家世</legend>
    <div class="origin-options">
      <label v-for="id in ORIGIN_IDS" :key="id" class="origin-option" :class="{ 'is-selected': model === id }">
        <input v-model="model" type="radio" name="character-origin" :value="id" />
        <span class="origin-glyph font-brush" aria-hidden="true">{{ ORIGINS[id].glyph }}</span>
        <span class="origin-name"><b class="font-brush">{{ ORIGINS[id].name }}</b><small>{{ ORIGINS[id].house }}</small></span>
      </label>
    </div>
    <div class="origin-detail" aria-live="polite">
      <template v-if="chosen && kin">
        <div class="origin-kin" aria-hidden="true"><InkFigure :style-type="kin.portraitStyle" :portrait-id="kin.id" /></div>
        <div class="min-w-0">
          <p>{{ chosen.blurb }}</p>
          <dl>
            <div><dt>六维</dt><dd>{{ originStatsText(chosen) }}</dd></div>
            <div><dt>家学</dt><dd>{{ chosen.perk.text }}</dd></div>
            <div><dt>{{ chosen.kin }}</dt><dd><b>{{ kin.name }}</b> · {{ chosen.school }}</dd></div>
          </dl>
          <p class="origin-assist">「{{ kin.assistSkillName }}」{{ kin.assistDesc }}</p>
        </div>
      </template>
      <p v-else class="origin-empty">选一个出身。家人会陪你走出第一步；家世选定后不能更改。</p>
    </div>
  </fieldset>
</template>

<style scoped>
.origin-picker {
  --o-line: var(--origin-line, var(--line-strong));
  --o-fill: var(--origin-fill, var(--bg-1));
  --o-active: var(--origin-active, var(--gold));
  --o-active-fill: var(--origin-active-fill, var(--gold-faint));
  --o-text: var(--origin-text, var(--ink));
  --o-muted: var(--origin-muted, var(--ink-3));
  min-width: 0; margin: 0; padding: 0; border: 0; color: var(--o-text);
}
.origin-picker legend { margin-bottom: .5rem; font-size: .85rem; color: var(--o-muted); }
.origin-options { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .5rem; }
.origin-option {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: .2rem; padding: .55rem .25rem .45rem;
  border: 1px solid var(--o-line); border-radius: 3px 10px; background: var(--o-fill); cursor: pointer; text-align: center;
  transition: border-color .2s, background .2s;
}
.origin-option.is-selected { border-color: var(--o-active); background: var(--o-active-fill); }
.origin-option:focus-within { outline: 2px solid var(--o-active); outline-offset: 2px; }
.origin-option input { position: absolute; opacity: 0; pointer-events: none; }
.origin-glyph { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: 45%; background: #9a2c2d; color: #f6e6c8; font-size: 1.15rem; line-height: 1; }
.origin-option:not(.is-selected) .origin-glyph { filter: saturate(.35) brightness(.85); }
.origin-name { display: flex; flex-direction: column; line-height: 1.2; }
.origin-name b { font-size: 1.15rem; font-weight: 400; }
.origin-name small { font-size: .68rem; color: var(--o-muted); white-space: nowrap; }
.origin-picker:disabled .origin-option { cursor: not-allowed; opacity: .6; }

.origin-detail { display: flex; gap: .75rem; min-height: 8.2rem; margin-top: .6rem; padding: .6rem .7rem; border: 1px solid var(--o-line); border-radius: 2px; background: var(--o-fill); }
.origin-kin { flex: none; width: 4.4rem; height: 6.2rem; overflow: hidden; }
.origin-detail p { margin: 0; font-size: .8rem; line-height: 1.6; }
.origin-detail dl { display: grid; gap: .1rem; margin: .35rem 0; font-size: .8rem; }
.origin-detail dl div { display: flex; gap: .5rem; }
.origin-detail dt { flex: none; width: 2.2rem; color: var(--o-muted); }
.origin-detail dd { margin: 0; min-width: 0; }
.origin-detail dd b { color: var(--o-active); font-weight: 600; }
.origin-assist { color: var(--o-muted); }
.origin-empty { align-self: center; color: var(--o-muted); }

@media (max-width: 420px) {
  .origin-options { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .origin-kin { display: none; }
}
</style>
