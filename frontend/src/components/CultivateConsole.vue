<script setup lang="ts">
import { computed, onDeactivated, ref } from 'vue'
import { LockKeyhole, Sparkles, Wind } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { SKILLS } from '@/config/gameData'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { boostPctOver, realmBreakChance } from '../../../shared/player.ts'
import { boostLabel } from '../../../shared/admin.ts'
import type { RateBoostKind } from '@/network/protocol'
import ItemIcon from './ItemIcon.vue'
import InfoTip from './ui/InfoTip.vue'
import { useGrowthReadiness } from '@/composables/useGrowthReadiness'
import { useGameClock } from '@/composables/useGameClock'

const store = useGameStore()
const usePill = ref(false)
onDeactivated(() => { usePill.value = false })
const usingPill = computed(() => usePill.value && store.pillCount > 0)

const p = computed(() => store.player)
/** 新角色、停止挂机后：打坐与巡历都不累计，点「开始挂机」才起算 */
const idleOff = computed(() => !!p.value.idleOff)
const partner = computed(() => IS_MOCK_MODE ? p.value.coCultivatePartner : store.activeCoCultivation?.partner.nickname)
const { nextRealm, atCap, canLevel, missingPoint, canBreak } = useGrowthReadiness(store)
const breakRate = computed(() => nextRealm.value
  ? realmBreakChance(p.value, store.currentLoadout, nextRealm.value.baseBreakRate, usingPill.value)
  : 100)

const expPct = computed(() => Math.min(100, Math.round(p.value.qiExp / Math.max(1, p.value.nextLevelQi) * 100)))
const breakHint = computed(() => !nextRealm.value ? '下一境界尚未开放'
  : !atCap.value ? `达到 ${store.currentRealm.maxLevel} 级方可冲关`
    : missingPoint.value ? `请先在武库冲通「${missingPoint.value.name}」` : `突破到「${nextRealm.value.name}」，成功率 ${breakRate.value}%`)
const levelHint = computed(() => atCap.value
  ? `已达到「${store.currentRealm.name}」的等级上限，先突破境界再升级。`
  : canLevel.value ? `升到 ${p.value.level + 1} 级，花费 ${p.value.nextLevelQi.toLocaleString()} 真气。`
    : `还差 ${(p.value.nextLevelQi - p.value.qiExp).toLocaleString()} 真气才能升级。`)

const clock = useGameClock()
const deviationMinutes = computed(() => Math.max(0, Math.ceil(((p.value.qiDeviationUntil ?? 0) - clock.now) / 60_000)))
const pending = computed(() => store.getIdleRewards(clock.now))

/** 运营的倍率活动（docs/22）：进行中的列在修行状态下，时薪按活动折算 */
const activeBoosts = computed(() => store.rateBoosts.filter((boost) => boost.startsAt <= store.worldTime && boost.endsAt > store.worldTime))
const boosted = (hourly: number, kind: RateBoostKind) =>
  Math.floor(hourly * (100 + boostPctOver(activeBoosts.value.filter((boost) => boost.kind === kind), store.worldTime, store.worldTime)) / 100)
const until = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

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
    <p class="cultivate-status font-brush" :class="{ 'is-off': idleOff }" :title="!idleOff && partner ? `与「${partner}」一起修行，真气收益 +15%` : undefined">
      <Wind aria-hidden="true" />
      <template v-if="idleOff">尚未挂机</template>
      <template v-else>{{ partner ? '双人共修中' : '正在修行' }}<span aria-hidden="true">…</span></template>
      <button
        v-if="!idleOff" class="idle-stop" title="先领取已攒的收益，再停止累计打坐与巡历"
        :disabled="store.onlineActionBusy" @click="store.setIdle(false)"
      >停止挂机</button>
    </p>
    <p v-if="activeBoosts.length" class="cultivate-boosts" aria-label="进行中的活动">
      <span v-for="boost in activeBoosts" :key="boost.id" :title="boost.title">{{ boostLabel(boost) }} · 至 {{ until.format(boost.endsAt) }}</span>
    </p>

    <section class="cultivate-income" aria-label="修行收益">
      <div class="cultivate-progress" :class="{ 'is-secondary': expPct < 85 && !canBreak }">
        <span>升级真气 <b>{{ p.qiExp.toLocaleString() }}</b> / {{ p.nextLevelQi.toLocaleString() }}</span>
        <span class="flex items-center gap-1">{{ expPct }}% <InfoTip label="修行门槛" :text="`${levelHint} ${breakHint}`" /></span>
        <div class="wuxia-meter qi-meter" role="progressbar" aria-label="角色升级进度" :aria-valuenow="expPct"><i :style="{ width: `${expPct}%` }" /></div>
      </div>

      <div class="income-tray">
        <span class="income-label font-brush">修行收益</span>
        <div class="income-resource">
          <i class="art art-coin" aria-hidden="true" />
          <div><b>{{ boosted(store.effectiveSilverPerHour, 'SILVER').toLocaleString() }}</b><small>纹银 / 小时</small></div>
        </div>
        <div class="income-resource">
          <i class="art art-inner" aria-hidden="true" />
          <div><b>{{ boosted(store.effectiveQiPerHour, 'QI').toLocaleString() }}</b><small>真气 / 小时</small></div>
        </div>
        <button
          v-if="idleOff" class="claim-reward is-start" title="打坐与巡历从此刻起算，下线也照常累计，最多攒 24 小时"
          :disabled="store.onlineActionBusy" @click="store.setIdle(true)"
        >
          <i class="art art-inner" aria-hidden="true" />
          <span><strong class="font-brush">开始挂机</strong><small>打坐 · 巡历</small></span>
        </button>
        <button
          v-else class="claim-reward" aria-label="领取修行收益" :title="`可领 ${pending.gainedQi.toLocaleString()} 真气和 ${pending.gainedSilver.toLocaleString()} 纹银`"
          :aria-busy="store.isSubmitting('/cultivate/settle')" :disabled="store.onlineActionBusy" @click="store.settleOfflineQi()"
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
          <ItemIcon item-id="pozhang_dan" />
          <b>{{ store.pillCount }}</b>
        </button>
        <button class="hotbar-command" :class="{ 'anim-pulse-glow': canLevel }" aria-label="升级角色" :aria-description="levelHint"
          :aria-busy="store.isSubmitting('/cultivate/progress', { action: 'level' })" :disabled="!canLevel || store.onlineActionBusy" @click="store.upgradeLevel()">
          <span class="font-brush">升级</span><small>{{ canLevel ? '可升级' : atCap ? '待突破' : `Lv.${p.level + 1}` }}</small>
        </button>
        <button
          class="hotbar-command hotbar-break" aria-label="突破境界"
          :class="{ 'anim-pulse-glow': canBreak }" :aria-description="breakHint"
          :aria-busy="store.isSubmitting('/cultivate/progress', { action: 'break' })" :disabled="!canBreak || store.onlineActionBusy"
          @click="store.attemptBreakthrough(usingPill)"
        >
          <span class="font-brush">突破</span><small><Sparkles :size="10" aria-hidden="true" /> {{ canBreak ? '可突破' : nextRealm ? `${breakRate}%` : '待开放' }}</small>
        </button>
      </div>
      <span v-if="deviationMinutes" class="chip text-cinnabar">气血微沸 · 出战气血 −10% · {{ deviationMinutes }} 分钟</span>
    </div>
  </div>
</template>
