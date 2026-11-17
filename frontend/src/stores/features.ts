import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { FeatureId } from '@/network/protocol'
import type { GameActions } from '@/network/gameActions'
import { FEATURES, featureLockedText, featureUnlocked, markFeatureSeen, nextFeature, unseenFeature, type FeatureConfig } from '../../../shared/features.ts'
import { usePlayerStore } from './playerStore'
import { useGameUiStore, type MainTab } from './gameUiStore'

type UiStore = ReturnType<typeof useGameUiStore>
type JianghuTab = UiStore['jianghuTab']
type MarketTab = UiStore['marketTab']
type ArsenalTab = UiStore['arsenalTab']

/** 页签与玩法的对应；没列出的随时可用 */
const MAIN_TABS: Partial<Record<MainTab, FeatureId[]>> = { SECT: ['SECT'], MARKET: ['INN', 'MAPS', 'GHOST', 'HUASHAN'] }
const JIANGHU_TABS: Partial<Record<JianghuTab, FeatureId>> = { TRIAL: 'TRIAL', MAPS: 'MAPS', RAID: 'RAID', BOUNTY: 'HUASHAN' }
const MARKET_TABS: Record<MarketTab, FeatureId> = { INN: 'INN', GHOST: 'GHOST', ALCHEMY: 'MAPS', HUASHAN: 'HUASHAN', ARTIFACTS: 'HUASHAN' }
const ARSENAL_TABS: Partial<Record<ArsenalTab, FeatureId>> = { SQUAD: 'INN' }
const JIANGHU_ORDER: JianghuTab[] = ['TRIAL', 'STORY', 'MAPS', 'RAID', 'BOUNTY']
const MARKET_ORDER: MarketTab[] = ['INN', 'ALCHEMY', 'GHOST', 'HUASHAN', 'ARTIFACTS']

/** 玩法随剧情开放（shared/features.ts）：页签显隐、开放剧情卡与下一个机缘 */
export function useFeatures({ actions, selectTab }: { actions: GameActions; selectTab: (tab: MainTab) => void }) {
  const playerStore = usePlayerStore()
  const { player } = storeToRefs(playerStore)
  const uiStore = useGameUiStore()
  const { activeTab, jianghuTab, marketTab, arsenalTab } = storeToRefs(uiStore)
  const { showToast } = uiStore

  const featureOpen = (id: FeatureId) => featureUnlocked(player.value, id)
  const mainTabOpen = (tab: MainTab) => MAIN_TABS[tab]?.some(featureOpen) ?? true
  const jianghuTabOpen = (tab: JianghuTab) => { const id = JIANGHU_TABS[tab]; return !id || featureOpen(id) }
  const marketTabOpen = (tab: MarketTab) => featureOpen(MARKET_TABS[tab])
  const arsenalTabOpen = (tab: ArsenalTab) => { const id = ARSENAL_TABS[tab]; return !id || featureOpen(id) }

  /** 未开放时提示开放条件，返回 false */
  function guardFeature(id: FeatureId) {
    if (featureOpen(id)) return true
    showToast(featureLockedText(id), 'info')
    return false
  }

  // 页签落在未开放的玩法上（新角色的默认页签、换角色、跳转）时，改到第一个开放的
  const openSignature = computed(() => FEATURES.map(({ id }) => featureOpen(id) ? 1 : 0).join(''))
  watch([activeTab, jianghuTab, marketTab, arsenalTab, openSignature], () => {
    if (!mainTabOpen(activeTab.value)) activeTab.value = 'CULTIVATE'
    if (!jianghuTabOpen(jianghuTab.value)) jianghuTab.value = JIANGHU_ORDER.find(jianghuTabOpen) ?? 'STORY'
    if (!marketTabOpen(marketTab.value)) marketTab.value = MARKET_ORDER.find(marketTabOpen) ?? 'INN'
    if (!arsenalTabOpen(arsenalTab.value)) arsenalTab.value = 'SKILLS'
  }, { immediate: true, flush: 'sync' })

  // ==================== 开放剧情卡 ====================
  // 联机下「已看过」要等服务端回包才写进存档，先在本地记下，免得同一张卡再弹一次
  const dismissed = ref<{ playerId: string; ids: FeatureId[] }>({ playerId: '', ids: [] })
  const featureCard = computed<FeatureConfig | undefined>(() => {
    const local = dismissed.value.playerId === player.value.id ? dismissed.value.ids : []
    return unseenFeature({ ...player.value, featuresSeen: [...player.value.featuresSeen ?? [], ...local] })
  })

  function gotoFeature(feature: FeatureConfig) {
    const target = feature.goto
    if (!target) return
    selectTab(target.tab)
    if (target.tab === 'JIANGHU' && target.sub) jianghuTab.value = target.sub as JianghuTab
    if (target.tab === 'MARKET' && target.sub) marketTab.value = target.sub as MarketTab
  }

  /** 看完剧情卡：记下已读，go 时顺路前往 */
  function closeFeatureCard(go: boolean) {
    const feature = featureCard.value
    if (!feature) return
    const { id } = player.value
    dismissed.value = { playerId: id, ids: [...(dismissed.value.playerId === id ? dismissed.value.ids : []), feature.id] }
    void actions.run('featureSeen', { featureId: feature.id }, () => {}, () => {
      markFeatureSeen(player.value, feature.id)
      return { featureId: feature.id }
    })
    if (go) gotoFeature(feature)
  }

  /** 下一个将开放的玩法（预告用） */
  const upcomingFeature = computed(() => nextFeature(player.value))

  return {
    featureOpen,
    mainTabOpen,
    jianghuTabOpen,
    marketTabOpen,
    arsenalTabOpen,
    guardFeature,
    featureCard,
    closeFeatureCard,
    upcomingFeature,
  }
}
