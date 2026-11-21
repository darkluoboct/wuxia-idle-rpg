<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import WorkbenchDialog from './WorkbenchDialog.vue'
import { SKILLS } from '@/config/gameData'
import { STANCE_META } from '@/config/uiMeta'
import type { XiangyangGateId } from '@/network/protocol'
import {
  XIANGYANG_DRUM_BONUS, XIANGYANG_GATE_BY_ID, XIANGYANG_GATES, XIANGYANG_ORDER_CAP, XIANGYANG_ORDER_MS, XIANGYANG_WAVES, xiangyangRewardText,
} from '../../../shared/xiangyang.ts'

/** 襄阳守卫战（docs/20）：本周战况、军令与值守、出战与演练、城头战报、收兵后领赏 */
const store = useGameStore()
const board = computed(() => store.xiangyangBoard)
const now = ref(Date.now())
const drillGate = ref<XiangyangGateId>('EAST')
const drillWave = ref(1)
const busy = computed(() => store.isBattlePlaying || store.onlineActionBusy)
const time = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })
const clock = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })
const gateName = (id: XiangyangGateId) => XIANGYANG_GATE_BY_ID[id].name.split(' · ')[0]
const drumPercent = XIANGYANG_DRUM_BONUS * 100
const orderHours = XIANGYANG_ORDER_MS / 3_600_000

function span(until: number) {
  const minutes = Math.floor(Math.max(0, until - now.value) / 60_000)
  if (minutes >= 24 * 60) return `${Math.floor(minutes / 1440)} 天 ${Math.floor(minutes % 1440 / 60)} 小时`
  if (minutes >= 60) return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
  return `${minutes} 分`
}

const war = computed(() => board.value?.war)
const drum = computed(() => board.value?.drum)
const self = computed(() => board.value?.self)
const orders = computed(() => board.value?.orders)
const post = computed(() => board.value?.post)

function sortieBlock(id: XiangyangGateId) {
  if (self.value && self.value.gate !== id) return `本场守${gateName(self.value.gate)}`
  if (!orders.value?.count) return '军令未到'
}
const outerSkill = computed(() => SKILLS[store.currentLoadout.outerSkillId ?? '']?.name)

// 每半分钟刷新一次战况；擂鼓起落、军令送到、值守出战的时刻也刷新
const poll = setInterval(() => void store.refreshXiangyang(), 30_000)
const tick = setInterval(() => { now.value = Date.now() }, 1000)
const nextFlip = computed(() => Math.min(...[drum.value?.active ? drum.value.closesAt : drum.value?.opensAt, orders.value?.nextAt, post.value?.nextAutoAt, war.value?.closesAt]
  .filter((at): at is number => typeof at === 'number')))
watch(() => now.value >= nextFlip.value, (flipped) => {
  if (flipped) void store.refreshXiangyang()
})
void store.refreshXiangyang()
onScopeDispose(() => {
  clearInterval(tick)
  clearInterval(poll)
})
</script>

<template>
  <section class="view-scroll -mr-1 space-y-3 pr-1" aria-label="襄阳守卫战">
    <p v-if="store.xiangyangError" class="well p-3 text-sm text-cinnabar" role="alert">{{ store.xiangyangError }}</p>

    <header v-if="war && drum && orders" class="workbench-toolbar justify-between border-b border-line pb-2">
      <div class="flex items-center gap-2">
        <h3 class="font-brush text-2xl leading-none">襄阳守卫战</h3>
        <WorkbenchDialog title="襄阳守城规则"><p class="hint">军令每 {{ orderHours }} 小时回一道、最多攒 {{ XIANGYANG_ORDER_CAP }} 道。攒满还没用时，每回一道就由镜像替你出战一次；收兵时把余下的打完。挂机不吃亏，在线可以自己挑时机、换配装出战。</p>
<p v-if="board" class="hint">
      第一次出战（或值守出战）时定下本场的城门，本场不能换；改值守从下一场起算。战功按打掉的敌军气血折算（首领三份、兵卒各一份，打赢再加 5）；全门战功攒够一波所需就击退一波，所需随守军人数增加。
      敌军强弱随出战者的等级。收兵后凭战功领元宝、百炼玄铁与淬火石，残页落在最近一次出战时装着的外功上<template v-if="outerSkill">（现在是《{{ outerSkill }}》）</template>；收功时也会顺带领。
    </p></WorkbenchDialog>
        <span class="chip" :class="drum.active ? 'chip-red' : 'chip-gold'">{{ drum.active ? '城头擂鼓' : '鏖战中' }}</span>
      </div>
      <p class="hint">本周之围 {{ time.format(war.closesAt) }} 收兵，还剩 <b class="tabular-nums text-ink">{{ span(war.closesAt) }}</b></p>
      <p class="hint">
        <template v-if="drum.active">正在擂鼓：亲自出战战功加 {{ drumPercent }}%，还剩 <b class="tabular-nums text-ink">{{ span(drum.closesAt) }}</b></template>
        <template v-else>下次擂鼓 {{ time.format(drum.opensAt) }}，一个时辰内亲自出战战功加 {{ drumPercent }}%</template>
      </p>
      <p class="text-sm"><span class="chip">值守 · {{ post ? gateName(post.gate) : '未登记' }}</span>
        军令 <b class="tabular-nums" :class="orders.count ? 'text-gold' : ''">{{ orders.count }}</b> / {{ XIANGYANG_ORDER_CAP }}
        <span class="text-ink3">· {{ orders.nextAt ? `下一道 ${clock.format(orders.nextAt)}` : '已攒满' }}</span>
        <template v-if="self">
          <span class="text-ink3"> ｜ </span>本场守<b class="text-gold">{{ gateName(self.gate) }}</b> · 出战 <b class="tabular-nums">{{ self.sorties }}</b> 次<template v-if="self.autoSorties">（值守 {{ self.autoSorties }}）</template>
          · 战功 <b class="tabular-nums">{{ self.merit }}</b>
        </template>
      </p>
    </header>

    <!-- 值守 -->
    <article v-if="board" class="well flex flex-wrap items-center justify-between gap-3 p-3" aria-label="值守">
      <div class="min-w-0 space-y-1 text-sm">
        <template v-if="post">
          <p>值守<b class="text-gold">{{ gateName(post.gate) }}</b><span v-if="self && self.gate !== post.gate" class="hint">（本场仍守{{ gateName(self.gate) }}，下一场起改守）</span></p>
          <p class="hint">镜像按 {{ time.format(post.mirrorAt) }} 的配装 · 下一次替你出战 {{ time.format(post.nextAutoAt) }}</p>
        </template>
        <p v-else>还没值守：在下面选一门「值守此门」，下线时由你的镜像替你出战。</p>

      </div>
      <button v-if="post" class="btn btn-sm shrink-0" :disabled="busy" @click="store.xiangyangAction({ action: 'post', gate: post.gate })">按当前配装更新镜像</button>
    </article>

    <!-- 收兵后领赏（收功时也会顺带领） -->
    <article v-for="award in board?.awards ?? []" :key="award.warId" class="well space-y-2 p-3 border-gold">
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
    <div v-if="board && war" class="grid gap-3 lg:grid-cols-3">
      <article
        v-for="gate in board.gates" :key="gate.id" class="well flex flex-col gap-2 p-3"
        :class="(self?.gate ?? post?.gate) === gate.id ? 'border-gold' : ''"
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
          <p class="text-right text-[0.75rem] tabular-nums text-ink3">本波 {{ gate.progress }} / {{ gate.need }}</p>
        </div>
        <div class="mt-auto flex gap-2">
          <button
            class="btn btn-sm flex-1" :class="sortieBlock(gate.id) ? '' : 'btn-seal'" :disabled="busy || !!sortieBlock(gate.id)"
            @click="store.xiangyangAction({ action: 'sortie', warId: war.id, gate: gate.id })"
          >
            {{ sortieBlock(gate.id) ?? (drum?.active ? '擂鼓出战' : '出战') }}
          </button>
          <span v-if="post?.gate === gate.id" class="chip chip-gold shrink-0 self-center">值守中</span>
          <button v-else class="btn btn-sm shrink-0" :disabled="busy" @click="store.xiangyangAction({ action: 'post', gate: gate.id })">值守此门</button>
        </div>
      </article>
    </div>

    <div v-if="board" class="well flex flex-wrap items-center gap-3 p-3 text-sm">
      <label class="flex items-center gap-2">演练
        <select v-model="drillGate" class="field" aria-label="演练城门">
          <option v-for="gate in XIANGYANG_GATES" :key="gate.id" :value="gate.id">{{ gateName(gate.id) }}</option>
        </select>
        <select v-model.number="drillWave" class="field" aria-label="演练波次">
          <option v-for="wave in XIANGYANG_WAVES" :key="wave" :value="wave">第 {{ wave }} 波</option>
        </select>
      </label>
      <button class="btn btn-sm" :disabled="busy" @click="store.xiangyangAction({ action: 'drill', gate: drillGate, wave: drillWave })">上城演练</button>
      <span class="hint">敌军与实战相同，不耗军令、不记战功。</span>
    </div>



    <section v-if="board?.feed.length" class="well space-y-1 p-3" aria-label="城头战报">
      <h4 class="font-brush text-lg">城头战报</h4>
      <ul class="max-h-52 space-y-1 overflow-auto text-xs">
        <li v-for="entry in board.feed" :key="`${entry.at}-${entry.nickname}-${entry.gate}-${entry.merit}`" class="flex flex-wrap gap-x-2">
          <span class="tabular-nums text-ink3">{{ time.format(entry.at) }}</span>
          <span>
            【{{ gateName(entry.gate) }}】<b>{{ entry.nickname }}</b><span v-if="entry.auto" class="text-ink3">（值守）</span>
            战第 {{ entry.wave }} 波，战功 +{{ entry.merit }}<span v-if="entry.drum" class="text-cinnabar">（擂鼓）</span>
          </span>
          <span v-if="entry.repelled" class="text-gold">击退第 {{ entry.repelled }} 波！</span>
        </li>
      </ul>
    </section>

    <p v-if="board?.last" class="hint">
      上一场：{{ board.last.gates.map((gate) => `${gateName(gate.id)}${gate.wavesCleared >= XIANGYANG_WAVES ? '大捷' : `击退 ${gate.wavesCleared} 波`}`).join('，') }}
    </p>
  </section>
</template>
