<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ChevronLeft, Maximize2, Minimize2, X } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { usePlayerStore } from '@/stores/playerStore'
import { useOnlineStore } from '@/stores/onlineStore'
import type { ChatChannel, ChatMessageDTO } from '@/network/protocol'
import { CHAT_CHANNEL_LABEL, CHAT_RULES } from '../../../shared/chat.ts'

/** 江湖传音（docs/23）：世界、门派、附近、私聊；桌面在左栏人物卷下，手机从顶栏打开 */
const props = defineProps<{ closable?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const store = useGameStore()
const player = usePlayerStore()
const online = useOnlineStore()
const { supportsRealChat } = store.modeCapabilities

const CHANNELS: ChatChannel[] = ['WORLD', 'SECT', 'MAP', 'PRIVATE']
const time = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })
const day = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' })
const stamp = (at: number) => Date.now() - at > 20 * 3_600_000 ? day.format(at) : time.format(at)

const draft = ref('')
/** 左栏只放得下五六句，展开成浮在舞台上的大窗 */
const expanded = ref(false)
const panel = ref<HTMLElement>()
const expandButton = ref<HTMLButtonElement>()
const menuFor = ref<string | null>(null)
const showBlocked = ref(false)
const list = ref<HTMLElement | null>(null)

const channel = computed(() => store.chatChannel)
const lines = computed<(ChatMessageDTO & { system?: true })[]>(() => channel.value === 'PRIVATE' ? store.chatThread : store.chatLines(channel.value))
const badge = (target: ChatChannel) => target === 'PRIVATE' ? store.chatPrivateUnread : store.chatUnread[target]
const hint = computed(() => {
  if (channel.value === 'WORLD') return `全服都能看到 · ${CHAT_RULES.worldMinLevel} 级起可说，${CHAT_RULES.cooldownMs.WORLD / 1000} 秒一句`
  if (channel.value === 'SECT') return player.player.currentSectId ? `只有${player.currentSect?.name ?? '同门'}弟子能看到` : '拜入门派后才能在这里说话'
  if (channel.value === 'MAP') return `只有同在「${player.currentMap.name}」的侠客能看到`
  return store.chatPeer ? `只有你和「${store.chatPeer.nickname}」能看到；不在线也能收到` : '点别人的名字或附近侠客的「私聊」开始'
})
const canType = computed(() => channel.value !== 'PRIVATE' || !!store.chatPeer)

function send() {
  if (store.sendChat(draft.value)) draft.value = ''
}
function whisper(message: ChatMessageDTO) {
  menuFor.value = null
  void store.openChatThread({ id: message.sender.id, nickname: message.sender.nickname })
}
function block(message: ChatMessageDTO) {
  menuFor.value = null
  void store.setChatBlocked({ id: message.sender.id, nickname: message.sender.nickname }, true)
}
const mine = (message: ChatMessageDTO) => message.sender.id === player.player.id

// 停在底部时，来了新话就跟着滚到底
let pinned = true
function onScroll() {
  const el = list.value
  if (el) pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 40
}
watch(() => [lines.value.length, channel.value, store.chatPeer?.id], async () => {
  if (!pinned) return
  await nextTick()
  list.value?.scrollTo({ top: list.value.scrollHeight })
}, { immediate: true })
watch(channel, () => { pinned = true; menuFor.value = null })

watch(expanded, (active, _, onCleanup) => {
  if (!active) return
  function dismissOutside(event: PointerEvent) {
    if (panel.value && !event.composedPath().includes(panel.value)) expanded.value = false
  }
  function dismissEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || document.querySelector('dialog[open], .item-popover')) return
    event.stopPropagation()
    expanded.value = false
    expandButton.value?.focus()
  }
  document.addEventListener('pointerdown', dismissOutside)
  document.addEventListener('keydown', dismissEscape)
  onCleanup(() => {
    document.removeEventListener('pointerdown', dismissOutside)
    document.removeEventListener('keydown', dismissEscape)
  })
})

onMounted(() => { store.chatViewers++ })
onUnmounted(() => { store.chatViewers-- })
</script>

<template>
  <section ref="panel" class="chat-panel" :class="{ 'chat-expanded': expanded }" aria-label="江湖传音">
    <header class="chat-head">
      <h2 class="rail-heading"><span>江湖传音</span></h2>
      <button v-if="props.closable" class="wuxia-icon" aria-label="关上传音" @click="emit('close')"><X /></button>
      <button v-else ref="expandButton" class="wuxia-icon" :aria-label="expanded ? '收起传音' : '展开传音'" :aria-expanded="expanded" :title="expanded ? '收起' : '展开'" @click="expanded = !expanded">
        <Minimize2 v-if="expanded" /><Maximize2 v-else />
      </button>
    </header>
    <div class="chat-tabs" role="tablist" aria-label="频道">
      <button
        v-for="target in CHANNELS" :key="target" role="tab" :aria-selected="channel === target"
        :aria-label="badge(target) ? `${CHAT_CHANNEL_LABEL[target]}，${badge(target)} 条未读` : CHAT_CHANNEL_LABEL[target]"
        @click="store.selectChatChannel(target)"
      >
        {{ CHAT_CHANNEL_LABEL[target] }}<b v-if="badge(target)" class="chat-badge">{{ badge(target) > 99 ? '99+' : badge(target) }}</b>
      </button>
    </div>

    <!-- 私聊：会话列表 -->
    <div v-if="channel === 'PRIVATE' && !store.chatPeer" class="chat-scroll">
      <p v-if="!supportsRealChat" class="chat-empty">试玩模式没有别的侠客，私聊要在联机版里用。</p>
      <p v-else-if="!store.chatConversations.length" class="chat-empty">还没有私聊。点世界、门派里别人的名字，或附近侠客的「私聊」开始。</p>
      <ul v-else class="chat-conversations" aria-label="私聊会话">
        <li v-for="entry in store.chatConversations" :key="entry.peer.id">
          <button @click="store.openChatThread(entry.peer)">
            <span class="chat-conversation-name"><b>{{ entry.peer.nickname }}</b><time>{{ stamp(entry.last.sentAt) }}</time></span>
            <span class="chat-conversation-last">{{ entry.last.sender.id === player.player.id ? '你：' : '' }}{{ entry.last.content }}</span>
            <b v-if="entry.unread" class="chat-badge">{{ entry.unread }}</b>
          </button>
        </li>
      </ul>
      <div v-if="store.chatBlocked.length" class="chat-blocked">
        <button class="text-xs text-ink3 underline-offset-2 hover:underline" @click="showBlocked = !showBlocked">已屏蔽 {{ store.chatBlocked.length }} 人</button>
        <ul v-if="showBlocked">
          <li v-for="target in store.chatBlocked" :key="target.id">
            <span>{{ target.nickname }}</span>
            <button class="btn btn-sm" @click="store.setChatBlocked(target, false)">解除屏蔽</button>
          </li>
        </ul>
      </div>
    </div>

    <!-- 频道消息与私聊对话 -->
    <template v-else>
      <div v-if="channel === 'PRIVATE' && store.chatPeer" class="chat-thread-head">
        <button class="btn btn-sm" aria-label="回到私聊列表" @click="store.closeChatThread()"><ChevronLeft :size="14" />会话</button>
        <b class="truncate">{{ store.chatPeer.nickname }}</b>
        <button class="btn btn-sm ml-auto" @click="store.setChatBlocked(store.chatPeer, true)">屏蔽</button>
      </div>
      <ol ref="list" class="chat-scroll chat-lines" aria-live="polite" @scroll="onScroll">
        <li v-if="!lines.length" class="chat-empty">{{ channel === 'SECT' && !player.player.currentSectId && supportsRealChat ? '拜入门派后，同门的话会出现在这里。' : '还没有人说话。' }}</li>
        <li v-for="line in lines" :key="line.id" class="chat-line" :class="{ 'chat-system': line.system, 'chat-mine': mine(line) }">
          <time>{{ stamp(line.sentAt) }}</time>
          <span v-if="line.system" class="chat-tag">传闻</span>
          <span v-else-if="channel !== 'PRIVATE'" class="chat-tag">{{ line.sender.sectName }}</span>
          <button
            v-if="!line.system && !mine(line) && supportsRealChat" class="chat-name" :aria-expanded="menuFor === line.id"
            @click="menuFor = menuFor === line.id ? null : line.id"
          >{{ line.sender.nickname }}</button>
          <b v-else class="chat-name">{{ mine(line) ? '你' : line.sender.nickname }}</b><span class="chat-colon">：</span>
          <span class="chat-text">{{ line.content }}</span>
          <span v-if="menuFor === line.id" class="chat-menu">
            <button class="btn btn-sm" @click="whisper(line)">私聊</button>
            <button class="btn btn-sm" @click="block(line)">屏蔽</button>
          </span>
        </li>
      </ol>
    </template>

    <form class="chat-input" @submit.prevent="send">
      <p class="chat-hint">{{ !supportsRealChat ? '试玩模式：说的话只有你自己看得到' : !online.roomConnected ? '正在重连传音…' : hint }}</p>
      <div>
        <input
          v-model="draft" type="text" :maxlength="CHAT_RULES.maxLength" :disabled="!canType" aria-label="聊天内容"
          :placeholder="canType ? `在${CHAT_CHANNEL_LABEL[channel]}说点什么（回车发送）` : '先选一个私聊对象'"
        />
        <button type="submit" class="btn btn-gold" :disabled="!canType || !draft.trim() || (supportsRealChat && !online.roomConnected)">发送</button>
      </div>
    </form>
  </section>
</template>
