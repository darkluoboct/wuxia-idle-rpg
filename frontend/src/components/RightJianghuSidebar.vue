<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronRight, Circle, CircleCheck, Diamond, Store, Swords } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { isMapUnlocked, MAPS, ONLINE_STORY_CHAPTERS, STORY_CHAPTERS } from '@/config/gameData'
import { IS_MOCK_MODE } from '@/network/apiClient'
import RichLogStream from './RichLogStream.vue'

const store = useGameStore()
const panes = [
  { key: 'TASKS', label: '任务' }, { key: 'EVENTS', label: '活动' }, { key: 'SOCIAL', label: '附近' },
] as const
const pane = ref<(typeof panes)[number]['key']>(IS_MOCK_MODE ? 'TASKS' : 'SOCIAL')
const chapters = IS_MOCK_MODE ? STORY_CHAPTERS : ONLINE_STORY_CHAPTERS
const chapter = computed(() => chapters.find((ch) => ch.id === store.player.maxChapterId))
const cleared = computed(() => Math.min(chapters.length, store.player.maxChapterId - 1))
const lastCleared = computed(() => chapters[cleared.value - 1])
const news = computed(() => {
  const groups = new Map<string, string[]>()
  for (const full of store.marqueeBulletin.split('　　·　　')) {
    const end = full.indexOf('】')
    const tag = full.slice(1, end)
    const entries = groups.get(tag) ?? []
    entries.push(full.slice(end + 1))
    groups.set(tag, entries)
  }
  return [...groups]
})

const tab = ref<'NEARBY' | 'CHAT'>('NEARBY')
const chatInput = ref('')
const chatFilter = ref<'ALL' | 'RUMOR' | 'WORLD'>('ALL')
const unread = ref(false)

type Dir = '北' | '西' | '东' | '南' | '西北' | '东北' | '东南'
const COMPASS: { id: string; dir: Dir; cls: string }[] = [
  { id: 'zhongnan_forest', dir: '北', cls: 'col-start-2 row-start-1' },
  { id: 'damo_caravan', dir: '西', cls: 'col-start-1 row-start-2' },
  { id: 'jiaxing_suburb', dir: '东', cls: 'col-start-3 row-start-2' },
  { id: 'heizhao_swamp', dir: '南', cls: 'col-start-2 row-start-3' },
  { id: 'huashan_peak', dir: '西北', cls: 'col-start-1 row-start-1' },
  { id: 'guiyun_lake', dir: '东北', cls: 'col-start-3 row-start-1' },
  { id: 'taohua_isle', dir: '东南', cls: 'col-start-3 row-start-3' },
]
const nodes = computed(() =>
  COMPASS.map((c) => {
    const map = MAPS.find((m) => m.id === c.id)!
    return { ...c, map, locked: !isMapUnlocked(map, store.player.maxChapterId) }
  }).filter(({ map }) => IS_MOCK_MODE || map.reqCleared === undefined)
)
const SHORT: Record<string, string> = {
  zhongnan_forest: '终南后山', damo_caravan: '大漠商道', jiaxing_suburb: '嘉兴烟雨', heizhao_swamp: '湘西黑沼',
  huashan_peak: '华山绝顶', guiyun_lake: '太湖归云', taohua_isle: '桃花岛',
}

const channels = [
  { k: 'ALL', l: '全部' },
  { k: 'RUMOR', l: '传闻' },
  { k: 'WORLD', l: '聊天' },
] as const

const messages = computed(() =>
  chatFilter.value === 'ALL' ? store.worldMessages : store.worldMessages.filter((m) => m.channel === chatFilter.value)
)

watch(
  () => store.worldMessages[0]?.id,
  () => {
    if (pane.value !== 'SOCIAL' || tab.value !== 'CHAT') unread.value = true
  }
)
watch([pane, tab], ([p, t]) => {
  if (p === 'SOCIAL' && t === 'CHAT') unread.value = false
})
watch(() => store.activeBattle?.battleId, (id) => { if (id) pane.value = 'TASKS' })

function send() {
  if (!chatInput.value.trim()) return
  if (store.sendChatMessage(chatInput.value, 'WORLD')) chatInput.value = ''
}

/** 对方战力 / 我方战力，用于判断切磋、劫掠是否划算 */
const myPower = computed(() => Math.max(1, store.derivedStats.combatPower))
const ratio = (power: number) => power / myPower.value
const inviteForMe = computed(() => store.coCultivationInvite?.invitee.id === store.player.id)
const canInviteRaid = computed(() => {
  const { team, invitation } = store.raidLobby
  return !invitation && (!team || (team.leaderId === store.player.id && team.members.length + team.invited.length < 3))
})
const coCultivationTimeLeft = computed(() => {
  const until = store.activeCoCultivation?.endsAt ?? store.coCultivationInvite?.expiresAt ?? store.onlineTime
  const seconds = Math.ceil(Math.max(0, until - store.onlineTime) / 1_000)
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor(seconds % 3_600 / 60)
  if (hours) return `${hours} 小时 ${minutes} 分`
  return minutes ? `${minutes} 分 ${seconds % 60} 秒` : `${seconds} 秒`
})
</script>

<template>
  <div class="world-sheet">
    <div class="rail-tabs world-tabs" role="tablist" aria-label="江湖卷栏目">
      <button
        v-for="item in panes" :key="item.key" role="tab" :aria-selected="pane === item.key" @click="pane = item.key"
      >{{ item.label }}<i v-if="item.key === 'SOCIAL' && unread" class="world-unread" aria-hidden="true" /></button>
    </div>

    <section v-if="store.activeCoCultivation || store.coCultivationInvite" class="well shrink-0 space-y-1.5 px-3 py-2.5" aria-label="双人共修">
      <template v-if="store.activeCoCultivation">
        <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm">
          <strong class="text-jade">与「{{ store.activeCoCultivation.partner.nickname }}」共修中</strong>
          <span class="chip chip-jade">真气 +15%</span>
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs tabular-nums text-ink2" :title="new Date(store.activeCoCultivation.endsAt).toLocaleString()">还剩 {{ coCultivationTimeLeft }}</span>
          <button class="btn btn-sm" :disabled="store.onlineActionBusy" @click="store.endCoCultivation()">结束共修</button>
        </div>
      </template>
      <template v-else-if="store.coCultivationInvite">
        <strong v-if="inviteForMe" class="text-sm text-gold">「{{ store.coCultivationInvite.inviter.nickname }}」邀你共修</strong>
        <strong v-else class="text-sm text-gold">已邀「{{ store.coCultivationInvite.invitee.nickname }}」共修</strong>
        <p class="text-xs text-ink2">{{ inviteForMe ? '同意后一起修行 4 小时，真气收益 +15%。' : '等对方答复。' }} 还剩 {{ coCultivationTimeLeft }}</p>
        <div v-if="inviteForMe" class="flex gap-2">
          <button class="btn btn-sm btn-gold" :disabled="store.onlineActionBusy || !store.roomConnected" @click="store.replyCoCultivation(true)">同意共修</button>
          <button class="btn btn-sm" :disabled="store.onlineActionBusy" @click="store.replyCoCultivation(false)">婉拒</button>
        </div>
      </template>
    </section>

    <section v-if="store.raidLobby.invitation" class="well shrink-0 space-y-1.5 px-3 py-2.5" aria-label="组队邀请">
      <strong class="text-sm text-gold">「{{ store.raidLobby.invitation.leaderNickname }}」邀你组队</strong>
      <p class="text-xs text-ink2">少室山 · 金刚伏魔圈，三位侠客一起破阵。</p>
      <div class="flex gap-2">
        <button class="btn btn-sm btn-gold" :disabled="store.raidLobbyBusy || !store.roomConnected" @click="store.raidTeamAction({ action: 'accept', invitationId: store.raidLobby.invitation.id })">接受组队</button>
        <button class="btn btn-sm" :disabled="store.raidLobbyBusy || !store.roomConnected" @click="store.raidTeamAction({ action: 'decline', invitationId: store.raidLobby.invitation.id })">婉拒组队</button>
      </div>
    </section>
    <button v-else-if="store.raidLobby.team" class="quest-link shrink-0 px-3 py-1.5 text-left" @click="store.openRaidLobby()">
      少室山队伍 {{ store.raidLobby.team.members.length }} / 3 · 查看准备
    </button>

    <div v-if="pane === 'TASKS'" class="world-tasks">
      <button v-if="chapter" class="quest-row quest-main" @click="store.selectTab('JIANGHU')">
        <span class="quest-mark"><Diamond :size="18" aria-hidden="true" /></span>
        <span class="quest-copy">
          <strong><em>主线</em> {{ chapter.title }}</strong>
          <small>第 {{ chapter.code }} 关 · 推荐 {{ chapter.recLevel }} 级</small>
        </span>
        <ChevronRight class="quest-arrow" aria-hidden="true" />
      </button>

      <details v-if="IS_MOCK_MODE && store.pendingAdventure" :key="store.pendingAdventure.id" class="quest-detail">
        <summary class="quest-row quest-adventure">
          <span class="quest-mark"><Circle :size="16" aria-hidden="true" /></span>
          <span class="quest-copy">
            <strong><em>奇遇</em> {{ store.pendingAdventure.title }}</strong>
            <small>{{ store.pendingAdventure.location }} · 等你选择</small>
          </span>
          <ChevronRight class="quest-arrow" aria-hidden="true" />
        </summary>
        <div class="quest-options">
          <p>{{ store.pendingAdventure.description }}</p>
          <button v-for="opt in store.pendingAdventure.options" :key="opt.key" class="btn" :disabled="!opt.canSelect" @click="store.resolveAdventure(opt.key)">
            {{ opt.label }}<small v-if="opt.requirementText">{{ opt.requirementText }}</small>
          </button>
          <button class="quest-link" @click="store.triggerRandomAdventure()">换个奇遇</button>
        </div>
      </details>
      <button v-else-if="IS_MOCK_MODE" class="quest-row quest-adventure" @click="store.triggerRandomAdventure()">
        <span class="quest-mark"><Circle :size="16" aria-hidden="true" /></span>
        <span class="quest-copy"><strong><em>奇遇</em> 寻找新奇遇</strong><small>游历江湖，看看会遇到什么</small></span>
        <ChevronRight class="quest-arrow" aria-hidden="true" />
      </button>

      <div v-if="lastCleared" class="quest-row quest-done">
        <span class="quest-mark"><CircleCheck :size="18" aria-hidden="true" /></span>
        <span class="quest-copy"><strong><em>已通关</em> {{ lastCleared.title }}</strong><small>射雕主线已过 {{ cleared }} / {{ chapters.length }} 关</small></span>
      </div>
    </div>

    <div v-else-if="pane === 'EVENTS'" class="world-tasks">
      <button v-if="!IS_MOCK_MODE" class="quest-row quest-main" @click="store.openRaidLobby()">
        <span class="quest-mark"><Swords :size="18" aria-hidden="true" /></span>
        <span class="quest-copy"><strong><em>副本</em> 少室山 · 金刚伏魔圈</strong><small>同图邀请两位侠客，一起破阵</small></span>
        <ChevronRight class="quest-arrow" aria-hidden="true" />
      </button>
      <button v-if="IS_MOCK_MODE" class="quest-row quest-main" :disabled="store.isBattlePlaying" @click="store.startThreePlayerCoopRaid()">
        <span class="quest-mark"><Swords :size="18" aria-hidden="true" /></span>
        <span class="quest-copy">
          <strong><em>副本</em> 少室山 · 金刚伏魔圈</strong>
          <small>{{ store.nextRaidRelic ? `打赢可得《${store.nextRaidRelic.name}》` : '和两位队友一起挑战' }}</small>
        </span>
        <ChevronRight class="quest-arrow" aria-hidden="true" />
      </button>
      <button v-if="IS_MOCK_MODE" class="quest-row quest-adventure" @click="store.selectTab('MARKET')">
        <span class="quest-mark"><Store :size="18" aria-hidden="true" /></span>
        <span class="quest-copy"><strong><em>市井</em> 醉仙客栈与鬼市</strong><small>结交伙伴，买装备和秘籍</small></span>
        <ChevronRight class="quest-arrow" aria-hidden="true" />
      </button>
    </div>

    <div v-else class="world-social flex min-h-0 flex-1 flex-col gap-3">
      <!-- 九州驿路 -->
      <div class="shrink-0">
        <div class="sec-title mb-2 text-base">
          江湖地图
          <span class="chip" :class="store.currentMap.safety === 'PEACE' ? 'chip-jade' : 'chip-red'">
            {{ store.currentMap.safety === 'PEACE' ? '和平区' : IS_MOCK_MODE ? '可劫镖' : '纷争区' }}
          </span>
          <span v-if="!IS_MOCK_MODE && store.roomConnected" class="ml-auto text-xs text-ink3">{{ store.roomCount }} 人在这里</span>
        </div>

        <div class="relative grid grid-cols-3 grid-rows-3 gap-1.5">
          <!-- 十字连线 + 罗盘环 -->
          <svg viewBox="0 0 3 3" preserveAspectRatio="none" class="pointer-events-none absolute inset-0 h-full w-full">
            <path d="M1.5,0.45 V2.55 M0.45,1.5 H2.55" stroke="var(--gold)" stroke-opacity="0.45" stroke-width="0.014" stroke-dasharray="0.04 0.05" fill="none" />
          </svg>

          <button
            v-for="n in nodes" :key="n.id"
            class="well well-hover relative z-10 flex min-w-0 flex-col items-center justify-center px-1 py-1.5 text-center"
            :class="[n.cls, store.player.currentMapId === n.id ? '!border-gold bg-[var(--gold-soft)]' : '']"
            :title="n.locked ? n.map.unlockHint : `前往「${n.map.name}」，每小时基础收益 ${n.map.baseQiPerHour.toLocaleString()} 真气${IS_MOCK_MODE ? `，${n.map.onlineCount} 人在线` : ''}`"
            :disabled="store.onlineActionBusy"
            @click="store.currentMap.id !== n.id && store.moveMap(n.id)"
          >
            <span class="absolute left-1 top-0.5 text-[0.68rem] leading-none text-ink3">{{ n.dir }}</span>
            <span v-if="n.map.safety === 'CONTESTED'" class="absolute right-1 top-0.5 text-[0.68rem] leading-none text-cinnabar">争</span>
            <span class="mt-1 truncate text-sm font-semibold leading-tight" :class="store.player.currentMapId === n.id ? 'text-gold' : ''">{{ SHORT[n.id] }}</span>
            <span class="text-[0.7rem] tabular-nums leading-tight text-ink3">{{ n.map.baseQiPerHour.toLocaleString() }}/时</span>
          </button>

          <!-- 中心：当前 -->
          <div class="relative z-10 col-start-2 row-start-2 flex items-center justify-center">
            <div class="relative flex h-[3.6rem] w-[3.6rem] items-center justify-center rounded-full border border-gold bg-raised">
              <svg viewBox="0 0 60 60" class="absolute inset-0 h-full w-full">
                <circle cx="30" cy="30" r="26" fill="none" stroke="var(--gold)" stroke-width="0.8" stroke-dasharray="1 3" opacity="0.7" />
                <path d="M30,5 L33,13 L27,13 Z" fill="var(--cinnabar)" />
              </svg>
              <span class="font-brush relative text-xs leading-tight text-gold">当前</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 页签 -->
      <div class="tabs shrink-0" role="tablist">
        <button class="tab" role="tab" :aria-selected="tab === 'NEARBY'" @click="tab = 'NEARBY'">
          附近侠客 <span class="text-xs opacity-60 tabular-nums">{{ store.nearbyPlayers.length }}</span>
        </button>
        <button class="tab" role="tab" :aria-selected="tab === 'CHAT'" @click="tab = 'CHAT'">
          {{ IS_MOCK_MODE ? '江湖聊天' : '同图聊天' }}<i v-if="unread" class="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-seal align-middle" />
        </button>
      </div>

      <!-- 同图侠客 -->
      <ul v-if="tab === 'NEARBY'" class="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
        <li v-if="!IS_MOCK_MODE && !store.roomConnected" class="py-8 text-center text-sm text-ink3">正在连接附近侠客…</li>
        <li v-else-if="!store.nearbyPlayers.length" class="py-8 text-center text-sm text-ink3">附近还没有其他侠客。</li>
        <li v-for="pl in store.nearbyPlayers" :key="pl.id" class="well space-y-2 p-2.5">
          <div class="flex items-start gap-2.5">
            <span class="seal h-9 w-9 text-xl" :class="pl.isBetrayerBounty ? '' : 'seal-gold'">{{ pl.nickname.replace(/^[^一-龥]*·?/, '').slice(0, 1) || pl.nickname.slice(0, 1) }}</span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <b class="truncate text-sm" :class="pl.isBetrayerBounty ? 'text-cinnabar' : ''">{{ pl.nickname }}</b>
                <span v-if="pl.isBetrayerBounty" class="chip chip-red !py-0 !text-[0.68rem]">被通缉</span>
                <span v-if="pl.isEscortingDart" class="chip chip-gold !py-0 !text-[0.68rem]">押镖</span>
              </div>
              <div class="truncate text-xs text-ink3">{{ pl.sectName }} · {{ pl.realmName }}</div>
            </div>
            <div class="shrink-0 text-right text-xs tabular-nums">
              <div class="text-ink3">Lv.{{ pl.level }}</div>
              <div class="font-bold text-gold">{{ pl.combatPower.toLocaleString() }}</div>
            </div>
          </div>

          <div class="flex items-center justify-between gap-2 text-xs">
            <span class="tabular-nums" :class="ratio(pl.combatPower) > 1.2 ? 'text-cinnabar' : ratio(pl.combatPower) < 0.85 ? 'text-jade' : 'text-ink3'">
              战力约是你的 {{ ratio(pl.combatPower).toFixed(1) }} 倍{{ ratio(pl.combatPower) > 1.2 ? ' · 强敌' : '' }}
            </span>
          </div>
          <div v-if="pl.holdingUniqueArtifact" class="chip tier-chip t-red glow-border w-full !justify-start truncate">持有「{{ pl.holdingUniqueArtifact }}」</div>

          <div v-if="IS_MOCK_MODE" class="flex gap-1.5">
            <button class="btn btn-sm flex-1" @click="store.interactNearbyPlayer(pl, 'CO_CULT')">一起修行</button>
            <button class="btn btn-sm flex-1" @click="store.interactNearbyPlayer(pl, 'SPAR')">切磋</button>
            <button
              v-if="store.currentMap.safety === 'CONTESTED' || pl.isBetrayerBounty"
              class="btn btn-sm btn-danger flex-1" @click="store.interactNearbyPlayer(pl, 'AMBUSH')"
            >
              {{ pl.isBetrayerBounty ? '追捕' : '劫镖' }}
            </button>
          </div>
          <div v-else class="flex flex-wrap gap-1.5">
            <button
              v-if="store.currentMap.safety === 'PEACE'" class="btn btn-sm flex-1"
              :aria-label="`邀请${pl.nickname}共修`"
              :disabled="store.onlineActionBusy || !store.roomConnected || !!store.activeCoCultivation || !!store.coCultivationInvite"
              @click="store.interactNearbyPlayer(pl, 'CO_CULT')"
            >邀请共修</button>
            <button
              v-if="canInviteRaid && !store.raidLobby.team?.members.some((entry) => entry.id === pl.id) && !store.raidLobby.team?.invited.some((entry) => entry.id === pl.id)"
              class="btn btn-sm flex-1" :aria-label="`邀请${pl.nickname}组队`" :disabled="store.raidLobbyBusy || !store.roomConnected"
              @click="store.raidTeamAction({ action: 'invite', targetPlayerId: pl.id })"
            >邀请组队</button>
          </div>
        </li>
      </ul>

      <!-- 飞鸽传书 -->
      <template v-else>
        <div v-if="IS_MOCK_MODE" class="flex shrink-0 items-center gap-1.5 text-xs">
          <button
            v-for="c in channels" :key="c.k" class="chip" :class="chatFilter === c.k ? 'chip-gold' : 'opacity-75 hover:opacity-100'"
            @click="chatFilter = c.k"
          >
            {{ c.l }}
          </button>
        </div>
        <p v-else class="text-xs text-ink3">{{ store.roomConnected ? '这里的话，同一张地图的侠客都能看见。' : '正在重连聊天…' }}</p>
        <ul class="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5" aria-live="polite">
          <li v-for="m in messages" :key="m.id" class="border-b border-line pb-2 text-sm leading-relaxed last:border-b-0">
            <div class="mb-0.5 flex items-center gap-1.5 text-xs">
              <span class="chip !py-0" :class="m.channel === 'RUMOR' ? 'chip-gold' : ''">{{ m.channel === 'RUMOR' ? '天机' : m.sect }}</span>
              <b class="truncate text-ink">{{ m.sender }}</b>
              <span class="ml-auto shrink-0 text-ink3">{{ m.time }}</span>
            </div>
            <p class="text-ink2">{{ m.content }}</p>
          </li>
        </ul>
        <form class="flex shrink-0 gap-1.5" @submit.prevent="send">
          <input
            v-model="chatInput" type="text" maxlength="80" placeholder="说点什么（回车发送）" aria-label="聊天内容"
            class="min-w-0 flex-1 rounded-sm border border-linestrong bg-transparent px-2.5 py-1.5 text-sm placeholder:text-ink3 focus:border-gold focus:outline-none"
          />
          <button type="submit" class="btn btn-gold shrink-0" :disabled="!IS_MOCK_MODE && !store.roomConnected">发送</button>
        </form>
      </template>
    </div>

    <template v-if="pane !== 'SOCIAL'">
      <section class="world-bulletins">
        <h2 class="rail-heading"><span>江湖快报</span></h2>
        <div class="news-list">
          <details v-for="[tag, entries] in news" :key="tag">
            <summary class="news-line" :data-kind="tag">
              <strong>【{{ tag }}】</strong>
              <span>{{ entries[0] }}</span>
            </summary>
            <ul v-if="entries.length > 1" class="news-more">
              <li v-for="entry in entries.slice(1)" :key="entry">{{ entry }}</li>
            </ul>
          </details>
        </div>
      </section>
      <RichLogStream />
    </template>
  </div>
</template>
