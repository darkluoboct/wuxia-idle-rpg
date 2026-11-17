<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { SKILLS } from '@/config/gameData'
import { STANCE_META } from '@/config/uiMeta'
import type { XiangyangGateId } from '@/network/protocol'
import { XIANGYANG_GATE_BY_ID, XIANGYANG_GATES, XIANGYANG_ORDERS, XIANGYANG_WAVES, xiangyangRewardText } from '../../../shared/xiangyang.ts'

/** 襄阳守卫战（docs/20）：三门战况、出战与演练、城头战报、战后领赏 */
const store = useGameStore()
const board = computed(() => store.xiangyangBoard)
const now = ref(Date.now())
const drillWave = ref(1)
const busy = computed(() => store.isBattlePlaying || store.onlineActionBusy)
const time = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })
const clock = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })
const gateName = (id: XiangyangGateId) => XIANGYANG_GATE_BY_ID[id].name.split(' · ')[0]

const war = computed(() => board.value?.war)
const self = computed(() => board.value?.self)
const ordersLeft = computed(() => XIANGYANG_ORDERS - (self.value?.sorties ?? 0))
/** 倒计时：开战中显示剩余，未开战显示距离开战 */
const countdown = computed(() => {
  if (!war.value) return ''
  const ms = Math.max(0, (war.value.active ? war.value.closesAt : war.value.opensAt) - now.value)
  const minutes = Math.floor(ms / 60_000)
  if (minutes >= 24 * 60) return `${Math.floor(minutes / 1440)} 天 ${Math.floor(minutes % 1440 / 60)} 小时`
  if (minutes >= 60) return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
  return `${minutes} 分 ${Math.floor(ms % 60_000 / 1000)} 秒`
})

function sortieBlock(id: XiangyangGateId) {
  if (!war.value?.active) return '未开战'
  if (self.value && self.value.gate !== id) return `本场守${gateName(self.value.gate)}`
  if (ordersLeft.value <= 0) return '军令已用完'
}
const outerSkill = computed(() => SKILLS[store.currentLoadout.outerSkillId ?? '']?.name)

// 开战中每 15 秒、平日每分钟刷新一次战况；开战或收兵那一刻也刷新
let poll: ReturnType<typeof setInterval> | undefined
const tick = setInterval(() => { now.value = Date.now() }, 1000)
watch(() => war.value?.active, (active) => {
  if (poll) clearInterval(poll)
  poll = setInterval(() => void store.refreshXiangyang(), active ? 15_000 : 60_000)
}, { immediate: true })
watch(() => war.value && now.value >= (war.value.active ? war.value.closesAt : war.value.opensAt), (flipped) => {
  if (flipped) void store.refreshXiangyang()
})
void store.refreshXiangyang()
onScopeDispose(() => {
  clearInterval(tick)
  if (poll) clearInterval(poll)
})
</script>

<template>
  <section class="view-scroll -mr-1 space-y-3 pr-1" aria-label="襄阳守卫战">
    <p v-if="store.xiangyangError" class="well p-3 text-sm text-cinnabar" role="alert">{{ store.xiangyangError }}</p>

    <header v-if="war" class="well flex flex-wrap items-center justify-between gap-3 p-3">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <h3 class="font-brush text-2xl leading-none">襄阳守卫战</h3>
          <span class="chip" :class="war.active ? 'chip-red' : 'chip-gold'">{{ war.active ? '鏖战中' : '城头未擂鼓' }}</span>
        </div>
        <p class="hint">
          <template v-if="war.active">{{ clock.format(war.closesAt) }} 收兵，还剩 <b class="tabular-nums text-ink">{{ countdown }}</b></template>
          <template v-else>下一场 {{ time.format(war.opensAt) }} 开战（北京时间），还有 <b class="tabular-nums text-ink">{{ countdown }}</b></template>
        </p>
      </div>
      <div class="text-right text-sm">
        <p v-if="self">本场守<b class="text-gold">{{ gateName(self.gate) }}</b> · 战功 <b class="tabular-nums">{{ self.merit }}</b></p>
        <p class="hint">军令 <b class="tabular-nums text-ink">{{ ordersLeft }}</b> / {{ XIANGYANG_ORDERS }} · 每周三、周日 20:00 起半个时辰</p>
      </div>
    </header>

    <!-- 战后领赏 -->
    <article v-for="award in board?.awards ?? []" :key="award.warId" class="well space-y-2 p-3 !border-gold">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h4 class="font-brush text-xl">襄阳论功 · {{ gateName(award.gate) }}</h4>
        <span class="chip" :class="award.wavesCleared >= XIANGYANG_WAVES ? 'chip-gold' : ''">
          {{ award.wavesCleared >= XIANGYANG_WAVES ? '大捷' : `击退 ${award.wavesCleared} 波` }}
        </span>
      </div>
      <p class="text-sm">出战 {{ award.sorties }} 次，战功 {{ award.merit }}<span v-if="award.topThree" class="text-gold"> · 本门前三，加赏</span></p>
      <p class="hint">{{ xiangyangRewardText(award.reward, award.skillId ? SKILLS[award.skillId]?.name : undefined) }}</p>
      <button class="btn btn-sm btn-seal" :disabled="busy" @click="store.xiangyangAction({ action: 'claim', warId: award.warId })">领赏</button>
    </article>

    <!-- 三门 -->
    <div v-if="board" class="grid gap-3 lg:grid-cols-3">
      <article
        v-for="gate in board.gates" :key="gate.id" class="well flex flex-col gap-2 p-3"
        :class="self?.gate === gate.id ? '!border-gold' : ''"
      >
        <div class="flex items-start justify-between gap-2">
          <div>
            <h4 class="font-brush text-xl leading-tight">{{ gateName(gate.id) }}</h4>
            <p class="text-xs text-ink3">{{ XIANGYANG_GATE_BY_ID[gate.id].name.split(' · ')[1] }}</p>
          </div>
          <span class="chip" :class="gate.wave > XIANGYANG_WAVES ? 'chip-gold' : ''">
            {{ gate.wave > XIANGYANG_WAVES ? '大捷' : `第 ${gate.wave} / ${XIANGYANG_WAVES} 波` }}
          </span>
        </div>
        <p class="text-xs leading-relaxed text-ink2">{{ XIANGYANG_GATE_BY_ID[gate.id].blurb }}</p>
        <p class="text-xs text-ink3">
          敌军走{{ STANCE_META[XIANGYANG_GATE_BY_ID[gate.id].stance].name }}，{{ STANCE_META[XIANGYANG_GATE_BY_ID[gate.id].counter].name }}克之 ·
          <span class="whitespace-nowrap">守军 {{ gate.defenders }} 人</span>
        </p>
        <div v-if="gate.wave <= XIANGYANG_WAVES" class="space-y-1">
          <div class="bar bar-thin bar-gold" role="progressbar" :aria-label="`${gateName(gate.id)}本波战功`" :aria-valuenow="gate.progress" :aria-valuemax="gate.need">
            <i :style="{ width: `${Math.min(100, gate.progress / gate.need * 100)}%` }" />
          </div>
          <p class="text-right text-[0.7rem] tabular-nums text-ink3">本波 {{ gate.progress }} / {{ gate.need }}</p>
        </div>
        <div class="mt-auto">
          <button
            v-if="war?.active" class="btn btn-sm w-full" :class="sortieBlock(gate.id) ? '' : 'btn-seal'" :disabled="busy || !!sortieBlock(gate.id)"
            @click="store.xiangyangAction({ action: 'sortie', warId: war.id, gate: gate.id })"
          >
            {{ sortieBlock(gate.id) ?? (self ? '再出战' : '守此门') }}
          </button>
          <button v-else class="btn btn-sm w-full" :disabled="busy" @click="store.xiangyangAction({ action: 'drill', gate: gate.id, wave: drillWave })">
            演练第 {{ drillWave }} 波
          </button>
        </div>
      </article>
    </div>

    <div v-if="board && !war?.active" class="well flex flex-wrap items-center gap-3 p-3 text-sm">
      <label class="flex items-center gap-2">演练波次
        <select v-model.number="drillWave" class="field">
          <option v-for="wave in XIANGYANG_WAVES" :key="wave" :value="wave">第 {{ wave }} 波</option>
        </select>
      </label>
      <span class="hint">平日可上城演练，敌军与开战时相同，不耗军令、不记战功。</span>
    </div>

    <p v-if="board" class="hint">
      第一次出战时选定城门，本场不能换。战功按打掉的敌军气血折算（首领三份、兵卒各一份，打赢再加 5）；全门战功攒够一波所需就击退一波，所需随守军人数增加。
      敌军强弱随你的等级。战后凭战功领元宝、百炼玄铁与淬火石，残页落在出战时装着的外功上<template v-if="outerSkill">（现在是《{{ outerSkill }}》）</template>。
    </p>

    <section v-if="board?.feed.length" class="well space-y-1 p-3" aria-label="城头战报">
      <h4 class="font-brush text-lg">城头战报</h4>
      <ul class="space-y-1 text-xs">
        <li v-for="entry in board.feed" :key="`${entry.at}-${entry.nickname}-${entry.gate}`" class="flex flex-wrap gap-x-2">
          <span class="tabular-nums text-ink3">{{ clock.format(entry.at) }}</span>
          <span>【{{ gateName(entry.gate) }}】<b>{{ entry.nickname }}</b> 战第 {{ entry.wave }} 波，战功 +{{ entry.merit }}</span>
          <span v-if="entry.repelled" class="text-gold">击退第 {{ entry.repelled }} 波！</span>
        </li>
      </ul>
    </section>

    <p v-if="board?.last" class="hint">
      上一场：{{ board.last.gates.map((gate) => `${gateName(gate.id)}${gate.wavesCleared >= XIANGYANG_WAVES ? '大捷' : `击退 ${gate.wavesCleared} 波`}`).join('，') }}
    </p>
  </section>
</template>
