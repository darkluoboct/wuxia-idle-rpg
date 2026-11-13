<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { LockKeyhole, Sparkles, Wind } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { ACUPOINTS, SKILLS } from '@/config/gameData'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { nextCultivationRealm, realmBreakChance } from '../../../shared/player.ts'

const store = useGameStore()
const usePill = ref(false)
const usingPill = computed(() => usePill.value && store.pillCount > 0)

const p = computed(() => store.player)
const partner = computed(() => IS_MOCK_MODE ? p.value.coCultivatePartner : store.activeCoCultivation?.partner.nickname)
const nextRealm = computed(() => nextCultivationRealm(p.value.realmTier))
const breakRate = computed(() => nextRealm.value
  ? realmBreakChance(p.value, store.currentLoadout, nextRealm.value.baseBreakRate, usingPill.value)
  : 100)

const expPct = computed(() => Math.min(100, Math.round(p.value.qiExp / Math.max(1, p.value.nextLevelQi) * 100)))
const atCap = computed(() => p.value.level >= store.currentRealm.maxLevel)
const canLevel = computed(() => !atCap.value && p.value.qiExp >= p.value.nextLevelQi)
const missingPoint = computed(() => ACUPOINTS.find((point) => point.realmTier === p.value.realmTier && !store.openedAcupointIds.includes(point.id)))
const canBreak = computed(() => !!nextRealm.value && atCap.value && !missingPoint.value)
const breakHint = computed(() => !nextRealm.value ? '下一境界尚未开放'
  : !atCap.value ? `达到 ${store.currentRealm.maxLevel} 级方可冲关`
    : missingPoint.value ? `请先在武库冲通「${missingPoint.value.name}」` : `突破到「${nextRealm.value.name}」，成功率 ${breakRate.value}%`)
const levelHint = computed(() => atCap.value
  ? `已达到「${store.currentRealm.name}」的等级上限，先突破境界再升级。`
  : canLevel.value ? `升到 ${p.value.level + 1} 级，花费 ${p.value.nextLevelQi.toLocaleString()} 真气。`
    : `还差 ${(p.value.nextLevelQi - p.value.qiExp).toLocaleString()} 真气才能升级。`)

const now = ref(Date.now())
const deviationMinutes = computed(() => Math.max(0, Math.ceil(((p.value.qiDeviationUntil ?? 0) - now.value) / 60_000)))
let timer: ReturnType<typeof setInterval>
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 5000) })
onUnmounted(() => clearInterval(timer))
const pending = computed(() => store.getIdleRewards(now.value))

const skills = computed(() => {
  const l = store.currentLoadout
  return [
    { label: '内功', art: 'inner', id: l.innerSkillId },
    { label: '外功', art: 'outer', id: l.outerSkillId },
    { label: '轻功', art: 'light', id: l.lightSkillId },
    { label: '绝技', art: 'ult', id: l.ultSkillId },
  ]
})

function openSkill(id: string | null) {
  if (id) store.inspectById('skill', id)
  else {
    store.arsenalTab = 'SKILLS'
    store.selectTab('ARSENAL')
  }
}
</script>

<template>
  <div class="cultivate-hud">
    <p class="cultivate-status font-brush" :title="partner ? `与「${partner}」一起修行，真气收益 +15%` : undefined">
      <Wind aria-hidden="true" />
      {{ partner ? '双人共修中' : '正在修行' }}<span aria-hidden="true">…</span>
    </p>

    <section class="cultivate-income" aria-label="修行收益">
      <div class="cultivate-progress" :title="levelHint">
        <span>升级真气 <b>{{ p.qiExp.toLocaleString() }}</b> / {{ p.nextLevelQi.toLocaleString() }}</span>
        <span>{{ expPct }}%</span>
        <div class="wuxia-meter qi-meter" role="progressbar" aria-label="角色升级进度" :aria-valuenow="expPct"><i :style="{ width: `${expPct}%` }" /></div>
      </div>

      <div class="income-tray">
        <span class="income-label font-brush">修行收益</span>
        <div class="income-resource">
          <i class="art art-coin" aria-hidden="true" />
          <div><b>{{ store.effectiveSilverPerHour.toLocaleString() }}</b><small>纹银 / 小时</small></div>
        </div>
        <div class="income-resource">
          <i class="art art-inner" aria-hidden="true" />
          <div><b>{{ store.effectiveQiPerHour.toLocaleString() }}</b><small>真气 / 小时</small></div>
        </div>
        <button
          class="claim-reward" aria-label="领取修行收益" :title="`可领 ${pending.gainedQi.toLocaleString()} 真气和 ${pending.gainedSilver.toLocaleString()} 纹银`"
          :disabled="store.onlineActionBusy" @click="store.settleOfflineQi()"
        >
          <i class="art art-chest" aria-hidden="true" />
          <span><strong class="font-brush">领取收益</strong><small>+{{ pending.gainedQi.toLocaleString() }} 真气</small></span>
        </button>
      </div>
    </section>

    <div class="wuxia-hotbar" role="group" aria-label="武学与修行">
      <div class="hotbar-skills">
        <button
          v-for="skill in skills" :key="skill.art" class="hotbar-skill"
          :title="skill.id ? SKILLS[skill.id]?.name : `去武库选${skill.label}`"
          :aria-label="skill.id ? `查看${SKILLS[skill.id]?.name}` : `去武库选${skill.label}`" @click="openSkill(skill.id)"
        >
          <i v-if="skill.id" class="art" :class="`art-${skill.art}`" aria-hidden="true" />
          <LockKeyhole v-else :size="20" aria-hidden="true" />
          <span>{{ skill.label }}</span>
        </button>
      </div>
      <div class="hotbar-actions">
        <button
          class="hotbar-pill" role="switch" aria-label="突破时服用通脉破障丹" :aria-checked="usingPill"
          :disabled="store.pillCount === 0 || !nextRealm" :title="`纯阳·通脉破障丹：专用于大境界关隘冲击，剩 ${store.pillCount} 枚（成功率 +35%）`"
          @click="usePill = !usingPill"
        >
          <i class="art art-potion" aria-hidden="true" />
          <b>{{ store.pillCount }}</b>
        </button>
        <button class="hotbar-command" aria-label="升级角色" :title="levelHint" :disabled="!canLevel || store.onlineActionBusy" @click="store.upgradeLevel()">
          <span class="font-brush">升级</span><small>{{ atCap ? '已达上限' : `Lv.${p.level + 1}` }}</small>
        </button>
        <button
          class="hotbar-command hotbar-break" aria-label="突破境界"
          :title="breakHint" :disabled="!canBreak || store.onlineActionBusy"
          @click="store.attemptBreakthrough(usingPill)"
        >
          <span class="font-brush">突破</span><small><Sparkles :size="10" aria-hidden="true" /> {{ nextRealm ? `${breakRate}%` : '待开放' }}</small>
        </button>
      </div>
      <span v-if="deviationMinutes" class="chip text-cinnabar">气血微沸 · 出战气血 −10% · {{ deviationMinutes }} 分钟</span>
    </div>
  </div>
</template>
