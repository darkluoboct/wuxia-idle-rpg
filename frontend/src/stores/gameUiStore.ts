import { defineStore, storeToRefs } from 'pinia'
import { onScopeDispose, ref } from 'vue'
import type { GameLogEntry, RichSegment, TierColor } from '@/network/protocol'
import { ITEMS, SKILLS } from '@/config/gameData'
import { EQUIP_SLOT_META, itemBonusLabels, shichenIdxFromDate, SKILL_SLOT_META } from '@/config/uiMeta'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { formatBattleStatBonuses } from '../../../shared/combatMeta.ts'
import { temperedItem } from '../../../shared/equipmentForge.ts'
import { sectEquipmentSetOf } from '../../../shared/sectEquipment.ts'
import { trialAffixLabel, trialAffixQuality, trialSetOf } from '../../../shared/trialStages.ts'
import { usePlayerStore } from './playerStore'

export type MainTab = 'CULTIVATE' | 'JIANGHU' | 'ARSENAL' | 'SECT' | 'MARKET'

export type ToastTone = 'info' | 'gold' | 'danger'

export const SHICHEN_LABELS = ['子时·夜半', '寅时·平旦', '辰时·烟雨', '午时·日正', '申时·斜阳', '戌时·黄昏']

export const useGameUiStore = defineStore('wuxiaUi', () => {

  const playerStore = usePlayerStore()
  const { learnedSkills, player } = storeToRefs(playerStore)

  // 主题与响应式抽屉状态（默认启动采用燕云玄墨深色护眼主题）
  const isMidnightTheme = ref(true)
  const activeTab = ref<MainTab>('CULTIVATE')
  const jianghuTab = ref<'STORY' | 'TRIAL' | 'MAPS' | 'RAID' | 'BOUNTY'>('TRIAL')
  const bountyTargetId = ref<string>()
  const arsenalTab = ref<'SKILLS' | 'SQUAD' | 'EQUIP' | 'MERIDIAN'>('SKILLS')
  // 窄屏下左 / 右侧栏以抽屉形式呈现
  const mobileDrawer = ref<'NONE' | 'CHAR' | 'WORLD'>('NONE')
  // 时辰随真实时间流转（驱动场景昼夜与日志时间标签）
  const shichenIdx = ref(shichenIdxFromDate())
  const shichenClock = setInterval(() => {
    shichenIdx.value = shichenIdxFromDate()
  }, 60_000)
  onScopeDispose(() => clearInterval(shichenClock))
  const toasts = ref<{ id: number; text: string; tone: ToastTone }[]>([])
  let toastSeq = 0

  // 二次确认弹窗（叛师等不可逆操作）
  const confirmDialog = ref<{
    title: string
    body: string
    confirmText: string
    tone: 'danger' | 'gold'
    onConfirm: () => void
  } | null>(null)

  // 点击富文本词条弹出的详情浮窗
  const inspectModal = ref<{ title: string; subtitle: string; tier: TierColor; desc: string; extra?: string } | null>(null)
  const marketTab = ref<'INN' | 'GHOST' | 'ALCHEMY' | 'HUASHAN' | 'ARTIFACTS'>(IS_MOCK_MODE ? 'INN' : 'ALCHEMY')

  // 滚动富文本日志流
  const logs = ref<GameLogEntry[]>(IS_MOCK_MODE ? [
    {
      id: 'init_1',
      timeLabel: '辰时·入世',
      channel: 'JIANGHU',
      segments: [
        { type: 'tag', text: '初入江湖', tone: 'gold' },
        { type: 'text', text: ' 你带着忘机客留下的' },
        { type: 'item', id: 'iron_bagua', name: '【曲三铁八卦】', tier: 'blue' },
        { type: 'text', text: '来到嘉兴南湖。你还未拜师，是个' },
        { type: 'tag', text: '逍遥散人', tone: 'jade' },
        { type: 'text', text: '。' },
      ],
    },
    {
      id: 'init_2',
      timeLabel: '辰时·共鸣',
      channel: 'CULTIVATE',
      segments: [
        { type: 'text', text: ' ' },
        { type: 'actor', name: '黄蓉', isAlly: true },
        { type: 'text', text: '笑道：“靖哥哥，咱们一块儿闯江湖！”郭靖和黄蓉一起上阵，搭档' },
        { type: 'tag', text: '靖蓉同心', tone: 'purple' },
        { type: 'text', text: '已生效。' },
      ],
    },
  ] : [])

  function showToast(text: string, tone: ToastTone = 'info') {
    const id = ++toastSeq
    toasts.value.push({ id, text, tone })
    if (toasts.value.length > 3) toasts.value.shift()
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, 3600)
  }

  function askConfirm(opts: NonNullable<typeof confirmDialog.value>) {
    confirmDialog.value = opts
  }
  function resolveConfirm(accepted: boolean) {
    const d = confirmDialog.value
    confirmDialog.value = null
    if (accepted && d) d.onConfirm()
  }

  function appendLog(channel: GameLogEntry['channel'], segments: RichSegment[]) {
    logs.value.unshift({
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timeLabel: SHICHEN_LABELS[shichenIdx.value],
      channel,
      segments,
    })
    if (logs.value.length > 80) logs.value.pop()
  }

  function toggleTheme(forceMidnight?: boolean) {
    isMidnightTheme.value = forceMidnight !== undefined ? forceMidnight : !isMidnightTheme.value
    // 无 DOM 环境（测试 / 服务端渲染）下只更新状态
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('theme-midnight', isMidnightTheme.value)
  }

  function openInspect(payload: { title: string; subtitle: string; tier: TierColor; desc: string; extra?: string }) {
    inspectModal.value = payload
  }

  function inspectById(kind: 'skill' | 'item', id: string) {
    if (kind === 'skill' && SKILLS[id]) {
      const s = SKILLS[id]
      const lv = learnedSkills.value[id] ?? 1
      openInspect({
        title: `《${s.name}》`,
        subtitle: `${SKILL_SLOT_META[s.slot].label} · 第 ${lv} 重 · ${s.source}`,
        tier: s.tier,
        desc: s.desc,
        extra: s.castNarrative,
      })
    } else if (kind === 'item' && ITEMS[id]) {
      const it = ITEMS[id]
      const forged = player.value.equipmentForge?.items[id]
      const stars = forged?.stars ?? 0
      const details = itemBonusLabels(temperedItem(it, stars))
      const roll = player.value.equipmentAffixes?.[id]
      if (roll) details.push(`${trialAffixQuality(it, roll)} · ${trialAffixLabel(it, roll)}`)
      if (forged?.secondary) details.push(`副词条 · ${formatBattleStatBonuses({ [forged.secondary.stat]: forged.secondary.value })}`)
      if (it.signatureEffect) details.push(it.signatureEffect)
      const set = it.setId ? trialSetOf(it.setId) : undefined
      const sectSet = it.setId ? sectEquipmentSetOf(it.setId) : undefined
      if (sectSet) details.push(`${sectSet.name}（${sectSet.parts.length}件）${sectSet.bonus}`)
      if (set) {
        const tierKeys = { 2: 'two', 4: 'four', 6: 'six' } as const
        for (const bonus of set.battleBonuses ?? []) {
          details.push(`${set.name}（${bonus.pieces}件）${set.bonuses[tierKeys[bonus.pieces]]}`)
        }
      }
      openInspect({
        title: `【${it.name}】${stars ? ` +${stars} 星` : ''}`,
        subtitle: `${EQUIP_SLOT_META[it.slot].label}${it.isTrueUnique ? ' · 全服唯一' : ''}${it.reqStat ? ` · 需要${it.reqStat.label}` : ''}`,
        tier: it.tier,
        desc: it.desc,
        extra: details.join(' · '),
      })
    }
  }

  return {
    mobileDrawer,
    appendLog,
    showToast,
    activeTab,
    shichenIdx,
    jianghuTab,
    marketTab,
    bountyTargetId,
    inspectModal,
    confirmDialog,
    toasts,
    isMidnightTheme,
    logs,
    toggleTheme,
    arsenalTab,
    askConfirm,
    resolveConfirm,
    openInspect,
    inspectById,
  }
})
