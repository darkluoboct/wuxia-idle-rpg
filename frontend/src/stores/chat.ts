import { computed, reactive, ref, watch, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { ChatChannel, ChatConversationDTO, ChatMessageDTO, ChatPrivateBoardDTO, WsServerEvent } from '@/network/protocol'
import { apiClient, ApiError, IS_MOCK_MODE } from '@/network/apiClient'
import { CHAT_RULES } from '../../../shared/chat.ts'
import { useGameUiStore } from './gameUiStore'
import { useOnlineStore } from './onlineStore'
import { usePlayerStore } from './playerStore'

/** 一行聊天：侠客说的话，或世界频道里的传闻（system） */
export type ChatLine = ChatMessageDTO & { system?: true }
type PublicChannel = Exclude<ChatChannel, 'PRIVATE'>
type Peer = { id: string; nickname: string }

const PUBLIC: PublicChannel[] = ['WORLD', 'SECT', 'MAP']

/** 试玩模式没有别的侠客，世界与门派频道放两句江湖闲话 */
function mockLines(channel: PublicChannel): ChatLine[] {
  if (!IS_MOCK_MODE) return []
  const say = (id: string, nickname: string, sectName: string, content: string): ChatLine =>
    ({ id, channel, sender: { id, nickname, sectName }, content, sentAt: Date.now() - 3_600_000 })
  if (channel === 'WORLD') {
    return [
      say('mock-1', '重阳首座·清风道长', '全真教', '松鹤楼结义秘境【少林金刚伏魔圈】2缺1高爆发少侠，来个会降龙掌的兄弟！'),
      say('mock-2', '桃花小师妹', '桃花岛', '哪位散人大哥鬼市淘到了《九阴残页》？诚心高价收！'),
    ]
  }
  return channel === 'SECT' ? [say('mock-3', '同门师兄', '本门', '今晚门派演武，记得把出战方案换好。')] : []
}

/**
 * 江湖传音（docs/23）：世界、门派、附近（同图）、私聊。
 * 连上江湖时取回各频道最近的话与私聊会话；之后经 /ws 收发。有面板开着、正看着的频道不记未读。
 */
export function useChat({ roomMapId }: { roomMapId: Ref<string | null> }) {
  const online = useOnlineStore()
  const { player } = storeToRefs(usePlayerStore())
  const ui = useGameUiStore()

  const channel = ref<ChatChannel>('WORLD')
  const lines = reactive<Record<PublicChannel, ChatLine[]>>({ WORLD: mockLines('WORLD'), SECT: mockLines('SECT'), MAP: [] })
  const unread = reactive<Record<PublicChannel, number>>({ WORLD: 0, SECT: 0, MAP: 0 })
  const conversations = ref<ChatConversationDTO[]>([])
  const blocked = ref<Peer[]>([])
  const peer = ref<Peer | null>(null)
  const thread = ref<ChatMessageDTO[]>([])
  /** 开着的聊天面板数：桌面左栏常驻一块，手机打开传音时一块 */
  const viewers = ref(0)
  const blockedIds = computed(() => new Set(blocked.value.map(({ id }) => id)))
  const privateUnread = computed(() => conversations.value.reduce((sum, { unread: count }) => sum + count, 0))
  const publicUnread = computed(() => unread.WORLD + unread.SECT + unread.MAP)
  const watching = (target: ChatChannel) => viewers.value > 0 && channel.value === target

  const keep = (list: ChatLine[]) => list.length > CHAT_RULES.keepLimit ? list.slice(-CHAT_RULES.keepLimit) : list
  const visible = (target: PublicChannel) => lines[target].filter((line) => line.system || !blockedIds.value.has(line.sender.id))

  async function loadChannel(target: PublicChannel) {
    if (IS_MOCK_MODE || !online.roomConnected) return
    try {
      const history = await apiClient.request<ChatMessageDTO[]>('GET', `/chat?channel=${target}`)
      // 传闻只在本地，按时刻插回去
      const system = lines[target].filter((line) => line.system)
      lines[target] = keep([...history, ...system].sort((a, b) => a.sentAt - b.sentAt))
    } catch {
      // 取不到时保留已有的
    }
  }

  async function loadPrivate() {
    if (IS_MOCK_MODE || !online.roomConnected) return
    try {
      const board = await apiClient.request<ChatPrivateBoardDTO>('GET', '/chat/private')
      conversations.value = board.conversations
      blocked.value = board.blocked
    } catch {
      // 取不到时保留已有的
    }
  }

  function markRead(target: Peer) {
    conversations.value = conversations.value.map((entry) => entry.peer.id === target.id ? { ...entry, unread: 0 } : entry)
    void apiClient.request('POST', `/chat/private/${target.id}/read`).catch(() => undefined)
  }

  function selectChannel(target: ChatChannel) {
    channel.value = target
    if (target !== 'PRIVATE') unread[target] = 0
  }

  /** 打开与某人的私聊；手机上顺带打开传音面板 */
  async function openThread(target: Peer) {
    selectChannel('PRIVATE')
    peer.value = target
    thread.value = []
    if (window.matchMedia('(max-width: 767px)').matches) ui.mobileDrawer = 'CHAT'
    if (IS_MOCK_MODE) return
    try {
      thread.value = await apiClient.request<ChatMessageDTO[]>('GET', `/chat/private/${target.id}`)
      if (conversations.value.some((entry) => entry.peer.id === target.id && entry.unread)) markRead(target)
    } catch (error) {
      showError(error, '私聊记录暂时读不到')
    }
  }

  function closeThread() {
    peer.value = null
    thread.value = []
  }

  function showError(error: unknown, fallback: string) {
    ui.showToast(error instanceof ApiError ? error.message : fallback, 'danger')
  }

  /** 发出一句；成功送出（或本地记下）时返回 true，输入框可以清空 */
  function send(content: string) {
    const text = content.trim()
    if (!text) return false
    const target = channel.value
    if (IS_MOCK_MODE) {
      if (target !== 'WORLD' && target !== 'SECT') {
        ui.showToast('试玩模式没有别的侠客，附近与私聊要在联机版里用', 'info')
        return false
      }
      lines[target] = keep([...lines[target], {
        id: `local-${Date.now()}`, channel: target, content: text, sentAt: Date.now(),
        sender: { id: player.value.id, nickname: player.value.nickname, sectName: '本门' },
      }])
      return true
    }
    if (target === 'WORLD' && player.value.level < CHAT_RULES.worldMinLevel) {
      ui.showToast(`${CHAT_RULES.worldMinLevel} 级之后才能在世界频道说话`, 'info')
      return false
    }
    if (target === 'SECT' && !player.value.currentSectId) {
      ui.showToast('拜入门派后才能在门派频道说话', 'info')
      return false
    }
    if (target === 'PRIVATE' && !peer.value) return false
    if (apiClient.sendChat({ channel: target, content: text, ...(target === 'PRIVATE' ? { to: peer.value!.id } : {}) })) return true
    ui.showToast('正在重连，连上后再发', 'info')
    return false
  }

  function receive(message: ChatMessageDTO) {
    if (message.channel !== 'PRIVATE') {
      const target = message.channel
      lines[target] = keep([...lines[target], message])
      if (!watching(target) && message.sender.id !== player.value.id && !blockedIds.value.has(message.sender.id)) unread[target]++
      return
    }
    const mine = message.sender.id === player.value.id
    const other: Peer = mine ? message.to! : { id: message.sender.id, nickname: message.sender.nickname }
    const reading = watching('PRIVATE') && peer.value?.id === other.id
    if (peer.value?.id === other.id) thread.value = [...thread.value, message]
    const previous = conversations.value.find((entry) => entry.peer.id === other.id)
    const unreadCount = mine || reading ? previous?.unread ?? 0 : (previous?.unread ?? 0) + 1
    conversations.value = [{ peer: other, last: message, unread: unreadCount }, ...conversations.value.filter((entry) => entry.peer.id !== other.id)]
    if (reading && !mine) markRead(other)
    if (!mine && !reading) ui.showToast(`「${message.sender.nickname}」私聊你：${message.content}`, 'gold')
  }

  function handleEvent(event: WsServerEvent) {
    if (event.event === 'CHAT_MESSAGE') receive(event.data)
    else if (event.event === 'CHAT_REMOVED') {
      for (const target of PUBLIC) lines[target] = lines[target].filter(({ id }) => id !== event.data.id)
      thread.value = thread.value.filter(({ id }) => id !== event.data.id)
    } else if (event.event === 'CHAT_REJECTED') ui.showToast(event.data.message, 'danger')
  }

  /** 传闻：兵器谱易主、叛门悬赏等，写进世界频道 */
  function postRumor(sender: string, content: string) {
    lines.WORLD = keep([...lines.WORLD, { id: `rumor-${Date.now()}-${lines.WORLD.length}`, channel: 'WORLD', system: true, sender: { id: '', nickname: sender, sectName: '传闻' }, content, sentAt: Date.now() }])
  }
  const latestRumor = computed(() => [...lines.WORLD].reverse().find((line) => line.system))

  async function setBlocked(target: Peer, value: boolean) {
    try {
      await apiClient.request('POST', '/chat/block', { playerId: target.id, blocked: value })
      blocked.value = value ? [target, ...blocked.value.filter(({ id }) => id !== target.id)] : blocked.value.filter(({ id }) => id !== target.id)
      ui.showToast(value ? `已屏蔽「${target.nickname}」：他的话不再显示，私聊也发不过来` : `已解除对「${target.nickname}」的屏蔽`, 'info')
      if (value && peer.value?.id === target.id) closeThread()
    } catch (error) {
      showError(error, '没能改屏蔽名单，稍后再试')
    }
  }

  // 连上江湖取回各频道；换图、换门派各自重取
  watch(() => online.roomConnected, (connected) => {
    if (!connected) return
    for (const target of PUBLIC) void loadChannel(target)
    void loadPrivate()
  })
  watch(roomMapId, (mapId, previous) => {
    if (mapId && previous && mapId !== previous) {
      lines.MAP = []
      unread.MAP = 0
      void loadChannel('MAP')
    }
  })
  watch(() => player.value.currentSectId, (sectId, previous) => {
    if (sectId === previous) return
    lines.SECT = []
    unread.SECT = 0
    void loadChannel('SECT')
  })
  // 正看着的频道不记未读
  watch([viewers, channel], () => {
    if (viewers.value > 0 && channel.value !== 'PRIVATE') unread[channel.value] = 0
  })

  function reset() {
    for (const target of PUBLIC) {
      lines[target] = mockLines(target)
      unread[target] = 0
    }
    conversations.value = []
    blocked.value = []
    closeThread()
    channel.value = 'WORLD'
  }

  return {
    chatChannel: channel, chatUnread: unread, chatConversations: conversations, chatBlocked: blocked, chatPeer: peer, chatThread: thread,
    chatViewers: viewers, chatPrivateUnread: privateUnread, chatPublicUnread: publicUnread, chatBlockedIds: blockedIds, latestRumor,
    chatLines: visible, selectChatChannel: selectChannel, openChatThread: openThread, closeChatThread: closeThread, sendChat: send,
    handleChatEvent: handleEvent, postRumor, setChatBlocked: setBlocked, resetChat: reset,
  }
}
