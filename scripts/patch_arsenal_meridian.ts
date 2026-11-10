import fs from 'fs'

let view = fs.readFileSync('./frontend/src/views/ArsenalView.vue', 'utf8')
view = view.replace(/\r\n/g, '\n')

// 1. Add ACUPOINTS, ACUPOINT_PILLS, REALMS to imports
const oldImport = `import { COMPANIONS, SKILLS, TRIO_SYNERGIES, type SkillConfig } from '@/config/gameData'`
const newImport = `import { ACUPOINTS, ACUPOINT_PILLS, COMPANIONS, REALMS, SKILLS, TRIO_SYNERGIES, type SkillConfig } from '@/config/gameData'`

if (view.includes(oldImport)) {
  view = view.replace(oldImport, newImport)
}

// 2. Add Meridian script helpers before </script>
const scriptMarker = `function applySynergy(s: (typeof TRIO_SYNERGIES)[number]) {
  store.updateLoadout({ leftCompanionId: s.leftId, rightCompanionId: s.rightId })
}`

const meridianScript = `function applySynergy(s: (typeof TRIO_SYNERGIES)[number]) {
  store.updateLoadout({ leftCompanionId: s.leftId, rightCompanionId: s.rightId })
}

/* ---------- 经脉冲穴与冲穴灵丹 ---------- */
const currentMeridianRealm = computed(() => {
  return REALMS.find((r) => r.tier === store.player.realmTier) ?? REALMS[0]
})

const realmAcupoints = computed(() => {
  return ACUPOINTS.filter((ap) => ap.realmTier === store.player.realmTier).sort((a, b) => a.order - b.order)
})

const piercedCount = computed(() => {
  return realmAcupoints.value.filter((ap) => store.openedAcupointIds.includes(ap.id)).length
})

const isMeridianCompleted = computed(() => {
  return piercedCount.value >= realmAcupoints.value.length
})

const acupointPillsList = computed(() => {
  return Object.values(ACUPOINT_PILLS).map((pill) => ({
    ...pill,
    count: store.pillInventory[pill.id] ?? 0,
  }))
})

function getAcupointCost(cost: number) {
  const intDiscount = store.player.stats.intStat / (store.player.stats.intStat + 250)
  return Math.max(100, Math.round(cost * (1 - intDiscount * 0.28)))
}

function canPierce(apId: string, order: number) {
  if (store.openedAcupointIds.includes(apId)) return false
  const prev = realmAcupoints.value.filter((a) => a.order < order)
  return prev.every((a) => store.openedAcupointIds.includes(a.id))
}`

if (view.includes(scriptMarker)) {
  view = view.replace(scriptMarker, meridianScript)
}

// 3. Add Tab in Template
const oldTabs = `<button class="tab" role="tab" :aria-selected="sub === 'EQUIP'" @click="sub = 'EQUIP'">装备</button>`
const newTabs = `<button class="tab" role="tab" :aria-selected="sub === 'EQUIP'" @click="sub = 'EQUIP'">装备</button>
          <button class="tab" role="tab" :aria-selected="sub === 'MERIDIAN'" @click="sub = 'MERIDIAN'">经脉冲穴</button>`

if (view.includes(oldTabs)) {
  view = view.replace(oldTabs, newTabs)
}

// 4. Update Qi display
const oldQi = `<span v-if="sub === 'SKILLS'" class="text-xs tabular-nums text-jade">现有真气 {{ store.player.qiExp.toLocaleString() }}</span>`
const newQi = `<span v-if="sub === 'SKILLS' || sub === 'MERIDIAN'" class="text-xs tabular-nums text-jade font-brush">现有真气 {{ store.player.qiExp.toLocaleString() }}</span>`

if (view.includes(oldQi)) {
  view = view.replace(oldQi, newQi)
}

// 5. Update template content for EQUIP and MERIDIAN
const oldEnd = `<EquipmentPanel v-else class="view-scroll -mr-1 pr-1" />
    </section>
  </div>
</template>`

const newEnd = `<EquipmentPanel v-else-if="sub === 'EQUIP'" class="view-scroll -mr-1 pr-1" />

      <!-- 经脉冲穴与冲穴灵丹 -->
      <div v-else-if="sub === 'MERIDIAN'" class="view-scroll -mr-1 space-y-4 pr-1">
        <!-- 经脉总览卡片 -->
        <div class="well space-y-2 p-3">
          <div class="flex items-center justify-between">
            <div>
              <span class="chip tier-chip !text-xs font-brush">{{ currentMeridianRealm.name }} · 第 {{ currentMeridianRealm.tier }} 重</span>
              <h3 class="text-base font-brush text-gold mt-1">贯通经脉：{{ currentMeridianRealm.meridian }}</h3>
            </div>
            <div class="text-right">
              <span class="text-xs text-ink3">冲穴进度</span>
              <div class="text-sm font-brush" :class="isMeridianCompleted ? 'text-jade' : 'text-gold'">
                {{ piercedCount }} / {{ realmAcupoints.length }} 穴
              </div>
            </div>
          </div>
          <p class="text-xs text-ink2 leading-relaxed">
            每 10 级大境界须打通当前经脉全部核心穴道，方可凝聚纯阳真气破关晋阶。冲穴可永久提升主角基础属性。
          </p>
          <div v-if="isMeridianCompleted" class="rounded border border-jade/30 bg-jade/10 p-2 text-xs text-jade flex items-center justify-between">
            <span>✨ 本阶经脉已全线贯通！可前往「修行」使用【纯阳·通脉破障丹】冲击大境界玄关！</span>
            <button class="btn btn-sm btn-gold font-brush text-xs" @click="store.selectTab('CULTIVATE')">去突破</button>
          </div>
        </div>

        <!-- 冲穴专属灵丹展示区 -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <h3 class="sec-title flex items-center gap-1.5">
              <span>冲穴专属灵丹</span>
              <span class="text-xs font-normal text-ink3">(用于减免真气消耗、大幅提升突破率或免除走火入魔)</span>
            </h3>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            <div
              v-for="pill in acupointPillsList" :key="pill.id"
              class="well p-2.5 space-y-1.5 flex flex-col justify-between border"
              :class="TIER_META[pill.tier].cls"
            >
              <div>
                <div class="flex items-center justify-between">
                  <b class="text-sm font-brush" :class="TIER_META[pill.tier].textCls">{{ pill.name }}</b>
                  <span class="chip !text-[0.68rem]" :class="pill.count > 0 ? 'bg-gold/20 text-gold font-bold' : 'text-ink3'">
                    存量: {{ pill.count }}
                  </span>
                </div>
                <p class="text-xs text-ink2 mt-1 leading-snug">{{ pill.effectDesc }}</p>
                <span class="block text-[0.68rem] text-ink3 mt-0.5">来源: {{ pill.source }}</span>
              </div>
              <button
                class="btn btn-xs w-full font-brush mt-1"
                :class="pill.count > 0 ? 'btn-gold' : 'opacity-40 cursor-not-allowed'"
                :disabled="pill.count <= 0 || store.onlineActionBusy"
                @click="store.useAcupointPill(pill.id)"
              >
                {{ pill.count > 0 ? (pill.id === 'tongmai_dan' ? '使用通脉丹冲穴' : pill.id === 'shaolin_xiaohuan_dan' ? '服用贯通三穴' : pill.id === 'jiuzhuan_tongqiao_dan' ? '服下瞬通整脉' : '备入突破心脉') : '尚未获得' }}
              </button>
            </div>
          </div>
        </div>

        <!-- 核心穴位循行图谱 -->
        <div>
          <h3 class="sec-title mb-2">核心穴位循行流注</h3>
          <div class="space-y-2">
            <div
              v-for="ap in realmAcupoints" :key="ap.id"
              class="well p-3 flex flex-wrap items-center justify-between gap-3 border"
              :class="store.openedAcupointIds.includes(ap.id) ? 'border-jade/40 bg-jade/5' : canPierce(ap.id, ap.order) ? 'border-gold/50 bg-[var(--gold-soft)]' : 'border-line opacity-65'"
            >
              <div class="flex items-center gap-3 min-w-[12rem]">
                <div
                  class="h-9 w-9 rounded-full flex items-center justify-center font-brush text-sm border"
                  :class="store.openedAcupointIds.includes(ap.id) ? 'border-jade bg-jade text-raised' : canPierce(ap.id, ap.order) ? 'border-gold bg-gold/20 text-gold animate-pulse' : 'border-line text-ink3'"
                >
                  {{ ap.order }}
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <b class="text-sm font-brush" :class="store.openedAcupointIds.includes(ap.id) ? 'text-jade' : 'text-ink1'">{{ ap.name }}</b>
                    <span class="chip !text-[0.65rem] !py-0" :class="store.openedAcupointIds.includes(ap.id) ? 'text-jade bg-jade/10' : 'text-gold bg-gold/10'">
                      {{ ap.statBonus.label }} +{{ ap.statBonus.value }}
                    </span>
                  </div>
                  <p class="text-xs text-ink3 mt-0.5 leading-snug">{{ ap.narrative }}</p>
                </div>
              </div>

              <div class="flex items-center gap-2 ml-auto">
                <span v-if="store.openedAcupointIds.includes(ap.id)" class="text-xs text-jade font-brush flex items-center gap-1">
                  <Check :size="14" /> 已贯通
                </span>
                <template v-else-if="canPierce(ap.id, ap.order)">
                  <button
                    class="btn btn-sm btn-gold font-brush text-xs"
                    :disabled="store.player.qiExp < getAcupointCost(ap.costQi) || store.onlineActionBusy"
                    :title="\`消耗 \${getAcupointCost(ap.costQi).toLocaleString()} 真气（悟性已减免）\`"
                    @click="store.pierceAcupoint(ap.id)"
                  >
                    运功冲穴 <small class="opacity-80">({{ getAcupointCost(ap.costQi).toLocaleString() }}气)</small>
                  </button>
                  <button
                    v-if="(store.pillInventory.tongmai_dan ?? 0) > 0"
                    class="btn btn-sm btn-jade font-brush text-xs"
                    :disabled="store.onlineActionBusy"
                    title="使用【玄门·聚气通脉丹】免真气直接冲通"
                    @click="store.pierceAcupoint(ap.id, 'tongmai_dan')"
                  >
                    用通脉丹 <small class="opacity-80">(余{{ store.pillInventory.tongmai_dan }})</small>
                  </button>
                </template>
                <span v-else class="text-xs text-ink3">
                  须先通前置穴位
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>`

if (view.includes(oldEnd)) {
  view = view.replace(oldEnd, newEnd)
  fs.writeFileSync('./frontend/src/views/ArsenalView.vue', view, 'utf8')
  console.log('Successfully patched frontend/src/views/ArsenalView.vue with Meridian tab and Acupoint Pills UI!')
} else {
  console.warn('oldEnd marker not found in ArsenalView.vue')
}
