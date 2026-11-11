<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, X } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { COMPANIONS, ITEMS, SKILLS, TRIO_SYNERGIES } from '@/config/gameData'
import { EQUIP_SLOT_META, SKILL_SLOT_META, STANCE_META, TIER_META } from '@/config/uiMeta'
import type { SkillSlotType, StanceType } from '@/network/protocol'
import InkFigure from '@/components/InkFigure.vue'

const store = useGameStore()
const sub = ref<'SKILLS' | 'SQUAD' | 'EQUIP'>('SKILLS')

const intDiscountPct = computed(() => Math.round((store.player.stats.intStat / (store.player.stats.intStat + 180)) * 100))

/* ---------- 武学 ---------- */
const stances = Object.keys(STANCE_META) as StanceType[]
const slotKeys: { slot: SkillSlotType; key: 'innerSkillId' | 'outerSkillId' | 'lightSkillId' | 'ultSkillId' }[] = [
  { slot: 'INNER', key: 'innerSkillId' },
  { slot: 'OUTER', key: 'outerSkillId' },
  { slot: 'LIGHT', key: 'lightSkillId' },
  { slot: 'ULT', key: 'ultSkillId' },
]
const learnedBySlot = (slot: SkillSlotType) =>
  Object.values(SKILLS).filter((s) => s.slot === slot && (store.learnedSkills[s.id] ?? 0) > 0)

function skillStats(id: string) {
  const s = SKILLS[id]
  const out: string[] = [`威力 ×${s.powerRatio.toFixed(2)}`]
  if (s.qiDamageRatio) out.push(`内劲穿透 ${Math.round(s.qiDamageRatio * 100)}%`)
  if (s.speedBonus) out.push(`出手 +${s.speedBonus}`)
  if (s.dodgeBonus) out.push(`闪避 +${s.dodgeBonus}%`)
  if (s.critBonus) out.push(`暴击 +${s.critBonus}%`)
  if (s.idleQiBonus) out.push(`吐纳 +${s.idleQiBonus}%`)
  return out
}

/* ---------- 编队 ---------- */
const recruited = (role: 'LEFT' | 'RIGHT') =>
  Object.values(COMPANIONS)
    .filter((c) => (c.role === role || c.role === 'EITHER') && store.companionAffinity[c.id]?.recruited)
    .map((c) => ({ ...c, ...store.companionOf(c.id)! }))
const isRecruited = (id: string) => !!store.companionAffinity[id]?.recruited
const isActive = (s: (typeof TRIO_SYNERGIES)[number]) => store.activeTrioSynergy?.id === s.id
/** 选择伙伴；周伯通等「左右皆可」的伙伴若已在另一翼，则自动让位 */
function pickCompanion(side: 'leftCompanionId' | 'rightCompanionId', id: string) {
  const other = side === 'leftCompanionId' ? 'rightCompanionId' : 'leftCompanionId'
  if (store.currentLoadout[other] === id) store.currentLoadout[other] = null
  store.currentLoadout[side] = id
}
function applySynergy(s: (typeof TRIO_SYNERGIES)[number]) {
  store.currentLoadout.leftCompanionId = s.leftId
  store.currentLoadout.rightCompanionId = s.rightId
}

/* ---------- 行囊 ---------- */
const ownedItems = computed(() =>
  store.ownedItemIds
    .map((id) => ITEMS[id])
    .filter(Boolean)
    .sort((a, b) => TIER_META[b.tier].rank - TIER_META[a.tier].rank)
)
const isEquipped = (id: string) => {
  const l = store.currentLoadout
  return l.weaponId === id || l.armorId === id || l.accId === id || l.relicBookId === id
}
const meetsReq = (it: (typeof ITEMS)[string]) => !it.reqStat || store.player.stats[it.reqStat.key] >= it.reqStat.val
function itemStats(it: (typeof ITEMS)[string]) {
  const out: string[] = []
  if (it.atkBonus) out.push(`外攻 +${it.atkBonus}`)
  if (it.defBonus) out.push(`护体 +${it.defBonus}`)
  if (it.hpBonus) out.push(`气血 +${it.hpBonus}`)
  if (it.critBonus) out.push(`暴击 +${it.critBonus}%`)
  if (it.idleBonus) out.push(`吐纳 +${it.idleBonus}%`)
  return out
}
</script>

<template>
  <div class="view">
    <section class="panel flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4">
      <div class="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div class="tabs flex-1" role="tablist">
          <button class="tab" role="tab" :aria-selected="sub === 'SKILLS'" @click="sub = 'SKILLS'">武学 · 架势</button>
          <button class="tab" role="tab" :aria-selected="sub === 'SQUAD'" @click="sub = 'SQUAD'">三人行编队</button>
          <button class="tab" role="tab" :aria-selected="sub === 'EQUIP'" @click="sub = 'EQUIP'">神兵行囊 <span class="text-xs opacity-60">{{ ownedItems.length }}</span></button>
        </div>
        <span class="text-xs text-jade" title="悟性越高，参悟升重所需真气越少">悟性减免参悟消耗 −{{ intDiscountPct }}%</span>
      </div>

      <!-- ============ 武学 + 三才架势 ============ -->
      <div v-if="sub === 'SKILLS'" class="view-scroll -mr-1 space-y-4 pr-1">
        <div>
          <div class="sec-title mb-2">三才架势 <span class="text-xs font-sans tracking-normal text-ink3">刚猛 → 奇门 → 太极 → 刚猛，循环相克</span></div>
          <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="三才架势">
            <button
              v-for="st in stances" :key="st" role="radio" :aria-checked="store.currentLoadout.stance === st"
              class="well well-hover relative p-2.5 text-left"
              :class="store.currentLoadout.stance === st ? '!border-gold bg-[var(--gold-soft)]' : ''"
              @click="store.currentLoadout.stance = st"
            >
              <div class="flex items-center justify-between gap-1">
                <b class="text-sm" :class="store.currentLoadout.stance === st ? 'text-gold' : ''">{{ STANCE_META[st].short }}势</b>
                <Check v-if="store.currentLoadout.stance === st" :size="14" class="text-gold" />
              </div>
              <div class="mt-0.5 text-xs text-jade">克「{{ STANCE_META[STANCE_META[st].beats].short }}」</div>
              <div class="mt-1 hidden text-xs leading-snug text-ink3 sm:block">{{ STANCE_META[st].hint }}</div>
            </button>
          </div>
        </div>

        <div class="grid gap-3 lg:grid-cols-2">
          <article v-for="sl in slotKeys" :key="sl.slot" class="well flex flex-col gap-2.5 p-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="seal-gold seal h-6 w-6 text-sm">{{ SKILL_SLOT_META[sl.slot].glyph }}</span>
                <b class="text-sm">{{ SKILL_SLOT_META[sl.slot].label }}</b>
              </div>
              <span class="text-xs text-ink3">已习 {{ learnedBySlot(sl.slot).length }} 门</span>
            </div>

            <!-- 当前装配 -->
            <div
              v-if="store.currentLoadout[sl.key] && SKILLS[store.currentLoadout[sl.key]!]"
              class="space-y-2 bg-[var(--bg-1)] p-2.5"
              :class="[TIER_META[SKILLS[store.currentLoadout[sl.key]!].tier].cls, 'tier-edge', SKILLS[store.currentLoadout[sl.key]!].tier === 'red' ? 'glow-border' : '']"
            >
              <div class="flex flex-wrap items-center gap-2">
                <h4 class="font-brush tier-text text-xl leading-none">《{{ SKILLS[store.currentLoadout[sl.key]!].name }}》</h4>
                <span class="chip tier-chip">{{ TIER_META[SKILLS[store.currentLoadout[sl.key]!].tier].label }}</span>
              </div>
              <p class="hint">{{ SKILLS[store.currentLoadout[sl.key]!].desc }}</p>
              <div class="flex flex-wrap gap-1">
                <span v-for="s in skillStats(store.currentLoadout[sl.key]!)" :key="s" class="chip">{{ s }}</span>
              </div>
              <!-- 火候：10 重刻度 -->
              <div class="flex items-center gap-2 text-xs text-ink3">
                火候
                <div class="flex gap-[0.2rem]" :aria-label="`第 ${store.learnedSkills[store.currentLoadout[sl.key]!]} / 10 重`">
                  <i
                    v-for="n in 10" :key="n" class="block h-2 w-2 rotate-45 border"
                    :class="n <= (store.learnedSkills[store.currentLoadout[sl.key]!] ?? 0) ? 'border-[var(--tc)] bg-[var(--tc)]' : 'border-linestrong'"
                  />
                </div>
                <span class="tabular-nums">{{ store.learnedSkills[store.currentLoadout[sl.key]!] }} / 10</span>
              </div>
            </div>
            <div v-else class="border border-dashed border-linestrong p-4 text-center text-sm text-ink3">此槽尚未装配武学</div>

            <!-- 切换 / 参悟 -->
            <div class="mt-auto flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="sk in learnedBySlot(sl.slot)" :key="sk.id" class="chip transition-colors"
                  :class="[TIER_META[sk.tier].cls, store.currentLoadout[sl.key] === sk.id ? 'tier-chip font-bold' : 'opacity-75 hover:opacity-100']"
                  :aria-pressed="store.currentLoadout[sl.key] === sk.id" @click="store.currentLoadout[sl.key] = sk.id"
                >
                  {{ sk.name }}
                </button>
              </div>
              <button
                v-if="store.currentLoadout[sl.key]" class="btn btn-sm btn-gold"
                :disabled="(store.learnedSkills[store.currentLoadout[sl.key]!] ?? 0) >= 10 || store.player.qiExp < store.getSkillUpgradeCost(store.currentLoadout[sl.key]!)"
                :title="`参悟需真气 ${store.getSkillUpgradeCost(store.currentLoadout[sl.key]!).toLocaleString()}（现有 ${store.player.qiExp.toLocaleString()}）`"
                @click="store.upgradeSkillMastery(store.currentLoadout[sl.key]!)"
              >
                <template v-if="(store.learnedSkills[store.currentLoadout[sl.key]!] ?? 0) >= 10">已臻圆满</template>
                <template v-else>
                  参悟升重 · <span class="tabular-nums" :class="store.player.qiExp < store.getSkillUpgradeCost(store.currentLoadout[sl.key]!) ? 'text-cinnabar' : ''">{{ store.getSkillUpgradeCost(store.currentLoadout[sl.key]!).toLocaleString() }}</span>
                </template>
              </button>
            </div>
          </article>
        </div>
      </div>

      <!-- ============ 编队 ============ -->
      <div v-else-if="sub === 'SQUAD'" class="view-scroll -mr-1 space-y-4 pr-1">
        <div>
          <div class="sec-title mb-2">三人行羁绊</div>
          <div class="grid gap-2 md:grid-cols-3">
            <article
              v-for="s in TRIO_SYNERGIES" :key="s.id" class="well flex flex-col gap-1.5 p-3"
              :class="isActive(s) ? '!border-gold bg-[var(--gold-soft)]' : ''"
            >
              <div class="flex items-center justify-between gap-2">
                <b class="font-brush text-lg" :class="isActive(s) ? 'text-gold' : ''">{{ s.name }}</b>
                <span v-if="isActive(s)" class="chip chip-gold">已激活</span>
              </div>
              <p class="hint flex-1">{{ s.bonusText }}</p>
              <button
                v-if="!isActive(s)" class="btn btn-sm" :disabled="!isRecruited(s.leftId) || !isRecruited(s.rightId)"
                @click="applySynergy(s)"
              >
                {{ isRecruited(s.leftId) && isRecruited(s.rightId) ? '一键编成' : `需结交 ${[s.leftId, s.rightId].filter((i) => !isRecruited(i)).map((i) => COMPANIONS[i].name).join('、')}` }}
              </button>
            </article>
          </div>
        </div>

        <!-- 收集羁绊：已入队成员数达标即获全局加成 -->
        <div>
          <div class="sec-title mb-2">收集羁绊 <span class="text-xs font-sans tracking-normal text-ink3">拥有（已入队）成员越多，加成越高，无需同队</span></div>
          <div class="grid gap-2 md:grid-cols-3">
            <article v-for="b in store.setBonusStates" :key="b.set.id" class="well flex flex-col gap-2 p-3" :class="b.tier ? '!border-gold' : ''">
              <div class="flex items-center justify-between gap-2">
                <b class="font-brush text-lg" :class="b.tier ? 'text-gold' : ''">{{ b.set.name }}</b>
                <span class="chip tabular-nums" :class="b.tier ? 'chip-gold' : ''">{{ b.owned }} / {{ b.set.memberIds.length + (b.set.plannedMembers?.length ?? 0) }}</span>
              </div>
              <p class="hint">{{ b.set.desc }}</p>
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="id in b.set.memberIds" :key="id" class="chip !py-0 !text-[0.68rem]"
                  :class="isRecruited(id) ? 'chip-jade' : 'opacity-60'"
                >{{ COMPANIONS[id].name }}</span>
                <span v-for="n in b.set.plannedMembers ?? []" :key="n" class="chip !py-0 !text-[0.68rem] opacity-40" title="后续版本登场">{{ n }}</span>
              </div>
              <ul class="space-y-0.5 text-xs">
                <li v-for="t in b.set.tiers" :key="t.count" :class="b.owned >= t.count ? 'text-jade' : 'text-ink3'">
                  {{ b.owned >= t.count ? '✓' : '·' }} {{ t.count }} 位「{{ t.label }}」：{{ [t.hpPct && `气血 +${t.hpPct}%`, t.atkPct && `攻击 +${t.atkPct}%`, t.idleQiPct && `打坐 +${t.idleQiPct}%`].filter(Boolean).join('，') }}
                </li>
              </ul>
            </article>
          </div>
        </div>

        <div class="grid gap-3 lg:grid-cols-2">
          <div v-for="side in ([{ role: 'LEFT', title: '左翼 · 破阵护卫位', sub: '挡刀 / 合击', key: 'leftCompanionId' }, { role: 'RIGHT', title: '右翼 · 奇策辅助位', sub: '控场 / 卸劲', key: 'rightCompanionId' }] as const)" :key="side.role" class="well space-y-2 p-3">
            <div class="flex items-baseline justify-between">
              <b :class="side.role === 'LEFT' ? 'text-gold' : 'text-jade'">{{ side.title }}</b>
              <span class="text-xs text-ink3">{{ side.sub }}</span>
            </div>
            <div class="space-y-1.5" role="radiogroup" :aria-label="side.title">
              <button
                v-for="c in recruited(side.role)" :key="c.id" role="radio" :aria-checked="store.currentLoadout[side.key] === c.id"
                class="well-hover flex w-full items-center gap-3 border p-2 text-left"
                :class="[TIER_META[c.tier].cls, store.currentLoadout[side.key] === c.id ? 'border-gold bg-[var(--gold-soft)]' : 'border-line bg-[var(--bg-1)]']"
                @click="pickCompanion(side.key, c.id)"
              >
                <span class="relative h-[3.6rem] w-[3rem] shrink-0 overflow-hidden bg-raised"><InkFigure :style-type="c.portraitStyle" /></span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-1.5"><b class="text-sm">{{ c.name }}</b><span class="chip tier-chip !py-0 !text-[0.68rem]">{{ c.title }}</span></span>
                  <span class="block text-xs text-gold">{{ c.assistSkillName }}</span>
                  <span class="block text-xs leading-snug text-ink3">{{ c.assistDesc }}</span>
                </span>
                <Check v-if="store.currentLoadout[side.key] === c.id" :size="16" class="shrink-0 text-gold" />
              </button>
              <p v-if="!recruited(side.role).length" class="py-4 text-center text-sm text-ink3">尚无可编入的伙伴，前往市井·醉仙客栈结交。</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ============ 行囊 ============ -->
      <div v-else class="view-scroll -mr-1 grid content-start gap-2.5 pr-1 sm:grid-cols-2">
        <article
          v-for="it in ownedItems" :key="it.id" class="well flex flex-col gap-2 p-3"
          :class="[TIER_META[it.tier].cls, 'tier-edge', isEquipped(it.id) ? '!border-r-gold' : '', it.tier === 'red' || it.isTrueUnique ? 'glow-border' : '']"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <h4 class="font-brush tier-text text-xl leading-tight">{{ it.name }}</h4>
              <div class="mt-1 flex flex-wrap gap-1">
                <span class="chip tier-chip">{{ TIER_META[it.tier].label }}</span>
                <span class="chip">{{ EQUIP_SLOT_META[it.slot].label }}</span>
                <span v-if="it.isTrueUnique" class="chip chip-red">全服孤品</span>
              </div>
            </div>
            <span class="seal-gold seal h-7 w-7 shrink-0 text-base">{{ EQUIP_SLOT_META[it.slot].glyph }}</span>
          </div>
          <p class="hint">{{ it.desc }}</p>
          <div v-if="itemStats(it).length" class="flex flex-wrap gap-1">
            <span v-for="s in itemStats(it)" :key="s" class="chip chip-jade">{{ s }}</span>
          </div>
          <div v-if="it.signatureEffect" class="text-xs leading-snug text-cinnabar">名器择主：{{ it.signatureEffect }}</div>
          <div class="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2">
            <span v-if="it.reqStat" class="flex items-center gap-1 text-xs" :class="meetsReq(it) ? 'text-jade' : 'text-cinnabar'">
              <Check v-if="meetsReq(it)" :size="13" /><X v-else :size="13" />
              门槛 {{ it.reqStat.label }}
            </span>
            <span v-else class="text-xs text-ink3">无穿戴门槛</span>
            <span v-if="isEquipped(it.id)" class="chip chip-gold">当前披挂</span>
            <button v-else class="btn btn-sm" :disabled="!meetsReq(it)" @click="store.equipItem(it.id)">佩带</button>
          </div>
        </article>
        <p v-if="!ownedItems.length" class="col-span-full py-10 text-center text-sm text-ink3">行囊空空，去闯荡江湖或逛逛鬼市吧。</p>
      </div>
    </section>
  </div>
</template>
