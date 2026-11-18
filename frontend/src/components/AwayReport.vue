<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { COMPANIONS, SKILLS } from '@/config/gameData'
import { IDLE_CAP_MS } from '../../../shared/trialStages.ts'
import { xiangyangRewardText } from '../../../shared/xiangyang.ts'

/** 江湖邸报（docs/21）：收功后汇总上次收功以来、你不在场时发生的事 */
const store = useGameStore()
const report = computed(() => store.awayReport!)
const gain = computed(() => report.value.gain)
const away = computed(() => gain.value.away!)
const n = (value: number) => value.toLocaleString()

const span = computed(() => {
  const minutes = Math.max(0, Math.floor((report.value.at - away.value.since) / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor(minutes % 1440 / 60)
  return [days ? `${days} 天` : '', hours ? `${hours} 小时` : '', days ? '' : `${minutes % 60} 分`].filter(Boolean).join(' ')
})
const capped = computed(() => report.value.at - away.value.since > IDLE_CAP_MS)

/** 每段一行标题加若干句，没发生的不列 */
const sections = computed(() => {
  const { gainedQi, gainedSilver, drops = [], forgeMaterials, patrolCache, xiangyang = [], defenseNotices = [], contestIngot, reunionClues = {}, feastIngredient } = gain.value
  const { xiangyang: guard, stallSales, dividends = [], raidLends } = away.value
  const list: { title: string; lines: string[] }[] = []
  if (gainedQi || gainedSilver) list.push({ title: '修行', lines: [`真气 +${n(gainedQi)} · 纹银 +${n(gainedSilver)}${capped.value ? '（按最多 24 小时计）' : ''}`] })
  const counts = new Map<string, number>()
  for (const { name } of drops) counts.set(name, (counts.get(name) ?? 0) + 1)
  const named = [...counts].map(([name, count]) => `【${name}】${count > 1 ? `×${count}` : ''}`)
  const patrol = [
    ...(forgeMaterials ? [`遭遇 ${forgeMaterials} 次，百炼玄铁、淬火石各 +${forgeMaterials}`] : []),
    ...(drops.length ? [`掉落 ${drops.length} 件：${named.slice(0, 6).join('')}${named.length > 6 ? '……' : ''}`] : []),
    ...(patrolCache ? [`宝箱 ${patrolCache.count} 个：纹银 +${n(patrolCache.silver)}${patrolCache.ingot ? `，元宝 +${patrolCache.ingot}` : ''}`] : []),
  ]
  if (patrol.length) list.push({ title: '巡历', lines: patrol })
  const war = [
    ...(guard ? [`值守镜像代打 ${guard.sorties} 次，战功 +${n(guard.merit)}`] : []),
    ...xiangyang.map(({ reward, skillId }) => `论功行赏：${xiangyangRewardText(reward, skillId ? SKILLS[skillId]?.name : undefined)}`),
  ]
  if (war.length) list.push({ title: '襄阳', lines: war })
  if (defenseNotices.length) {
    list.push({
      title: '镖车与通缉',
      lines: defenseNotices.map(({ kind, attacker, held, silver }) => `「${attacker}」${kind === 'ESCORT' ? '劫镖' : '追捕'}：${
        held ? '镜像把人打退了' : kind === 'ESCORT' ? `镖银被劫走 ${n(silver ?? 0)} 两` : '镜像落败，通缉了结'}`),
    })
  }
  const market = [
    ...(stallSales ? [`摊位卖出 ${stallSales.count} 份，纹银 +${n(stallSales.silver)}（下次操作时入账）`] : []),
    ...dividends.map(({ ingot }) => ingot ? `暗拍红封：元宝 +${ingot}` : '暗拍红封：这一回没抽中'),
  ]
  if (market.length) list.push({ title: '鬼市', lines: market })
  if (raidLends) list.push({ title: '结义', lines: [`结义镜像随人破阵 ${raidLends.count} 次，助战真气 +${n(raidLends.qiExp)}`] })
  const sect = contestIngot ? [`门派演武论功：元宝 +${contestIngot}`] : []
  if (sect.length) list.push({ title: '门派', lines: sect })
  const errands = [
    ...Object.entries(reunionClues).map(([id, count]) => `${COMPANIONS[id]?.name ?? id}的寻访线索 +${count}`),
    ...(feastIngredient ? ['十道绝味：寻得一味食材'] : []),
  ]
  if (errands.length) list.push({ title: '杂事', lines: errands })
  return list
})

const vFocus = { mounted: (el: HTMLElement) => el.focus() }
</script>

<template>
  <div class="fixed inset-0 z-[72] flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-[2px]">
    <article
      class="panel anim-modal flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-hidden p-5" role="dialog" aria-modal="true"
      aria-labelledby="away-report-title" @keydown.esc="store.closeAwayReport()"
    >
      <div class="flex items-center gap-2">
        <span class="seal h-7 w-7 shrink-0 text-base">报</span>
        <div class="min-w-0">
          <h4 id="away-report-title" class="font-brush text-2xl leading-tight text-gold">江湖邸报</h4>
          <p class="hint">距上次收功 {{ span }}，江湖上与你有关的事都在这里。</p>
        </div>
      </div>
      <dl class="min-h-0 space-y-2.5 overflow-y-auto border-t border-line pt-3 text-sm">
        <div v-for="section in sections" :key="section.title" class="flex gap-3">
          <dt class="font-brush w-10 shrink-0 text-base text-ink2">{{ section.title }}</dt>
          <dd class="min-w-0 flex-1 space-y-0.5">
            <p v-for="line in section.lines" :key="line" class="leading-relaxed">{{ line }}</p>
          </dd>
        </div>
        <p v-if="!sections.length" class="text-ink3">一切如常，没有新事。</p>
      </dl>
      <button v-focus class="btn btn-seal self-end" @click="store.closeAwayReport()">收下</button>
    </article>
  </div>
</template>
