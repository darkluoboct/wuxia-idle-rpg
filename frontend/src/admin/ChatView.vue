<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import type { AdminChatMessageDTO, AdminPermission } from '../../../shared/admin.ts'
import { CHAT_CHANNEL_LABEL } from '../../../shared/chat.ts'
import { MAPS, SECTS } from '../../../shared/gameData.ts'
import type { ChatChannel } from '../../../shared/protocol.ts'
import { adminApi, errorText, formatTime } from './api'

/** 聊天监控（docs/23）：按频道或侠客查最近的话、删除违规发言、维护屏蔽词；私聊只在按侠客查时列出 */
const props = defineProps<{ can: (permission: AdminPermission) => boolean; target: { id: string; nickname: string } | null }>()
const emit = defineEmits<{ clearTarget: [] }>()

const filter = reactive({ channel: '' as ChatChannel | '', playerId: '' })
const messages = ref<AdminChatMessageDTO[]>([])
const more = ref(false)
const error = ref('')
const notice = ref('')
const words = ref('')
const wordCount = ref(0)

const scopeName = (message: AdminChatMessageDTO) => message.channel === 'SECT'
  ? SECTS.find(({ id }) => id === message.scope)?.name ?? message.scope
  : message.channel === 'MAP' ? MAPS.find(({ id }) => id === message.scope)?.name ?? message.scope : ''

async function load(append = false) {
  error.value = ''
  const query = new URLSearchParams()
  if (filter.channel) query.set('channel', filter.channel)
  if (filter.playerId.trim()) query.set('playerId', filter.playerId.trim())
  if (append && messages.value.length) query.set('before', messages.value.at(-1)!.id)
  try {
    const page = await adminApi<AdminChatMessageDTO[]>('GET', `/chat?${query}`)
    messages.value = append ? [...messages.value, ...page] : page
    more.value = page.length === 100
  } catch (cause) {
    error.value = errorText(cause)
  }
}

async function loadWords() {
  try {
    const list = await adminApi<string[]>('GET', '/chat/words')
    words.value = list.join('\n')
    wordCount.value = list.length
  } catch (cause) {
    error.value = errorText(cause)
  }
}

watch(() => props.target, (target) => {
  filter.playerId = target?.id ?? filter.playerId
  void load()
}, { immediate: true })
void loadWords()

async function hide(message: AdminChatMessageDTO) {
  if (!window.confirm(`删除「${message.sender.nickname}」的这句话？\n${message.content}\n各频道里会立刻撤掉。`)) return
  try {
    await adminApi('POST', `/chat/${message.id}/hide`)
    messages.value = messages.value.map((entry) => entry.id === message.id ? { ...entry, hidden: true } : entry)
  } catch (cause) {
    error.value = errorText(cause)
  }
}

async function saveWords() {
  notice.value = ''
  error.value = ''
  try {
    const { count } = await adminApi<{ count: number }>('POST', '/chat/words', { words: words.value.split('\n') })
    wordCount.value = count
    notice.value = `屏蔽词已更新，共 ${count} 个，之后的发言按新表过滤`
  } catch (cause) {
    error.value = errorText(cause)
  }
}

function byPlayer(id: string) {
  filter.playerId = id
  void load()
}
function clearPlayer() {
  filter.playerId = ''
  emit('clearTarget')
  void load()
}
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-lg font-semibold">聊天</h2>
    <p v-if="error" class="danger text-sm" role="alert">{{ error }}</p>
    <p v-if="notice" class="ok text-sm" role="status">{{ notice }}</p>

    <form class="card flex flex-wrap items-center gap-2 p-3 text-sm" @submit.prevent="load()">
      <select v-model="filter.channel" class="input" aria-label="频道">
        <option value="">全部频道</option>
        <option v-for="(label, channel) in CHAT_CHANNEL_LABEL" :key="channel" :value="channel">{{ label }}</option>
      </select>
      <input v-model="filter.playerId" class="input w-80 max-w-full font-mono text-xs" placeholder="角色 ID（查某人发的与收到的，含私聊）" aria-label="角色 ID">
      <span v-if="props.target && props.target.id === filter.playerId" class="tag">{{ props.target.nickname }}</span>
      <button class="btn btn-primary btn-sm">查询</button>
      <button v-if="filter.playerId" type="button" class="btn btn-sm" @click="clearPlayer">清除</button>
      <span class="muted w-full text-xs">不填角色 ID 时只列世界、门派、附近；私聊只在按侠客查时列出，用于处理举报。</span>
    </form>

    <div class="card overflow-x-auto">
      <table class="table text-sm">
        <thead><tr><th>时间</th><th>频道</th><th>发言人</th><th>内容</th><th /></tr></thead>
        <tbody>
          <tr v-if="!messages.length"><td colspan="5" class="muted">没有聊天记录。</td></tr>
          <tr v-for="message in messages" :key="message.id" :class="message.hidden ? 'muted' : ''">
            <td class="whitespace-nowrap text-xs tabular-nums">{{ formatTime(message.sentAt) }}</td>
            <td class="whitespace-nowrap">{{ CHAT_CHANNEL_LABEL[message.channel] }}<div v-if="scopeName(message)" class="muted text-xs">{{ scopeName(message) }}</div></td>
            <td class="whitespace-nowrap">
              <button class="underline-offset-2 hover:underline" :title="message.sender.id" @click="byPlayer(message.sender.id)">{{ message.sender.nickname }}</button>
              <div class="muted text-xs">{{ message.sender.sectName }}</div>
              <div v-if="message.to" class="muted text-xs">→ <button class="underline-offset-2 hover:underline" @click="byPlayer(message.to.id)">{{ message.to.nickname }}</button></div>
            </td>
            <td class="max-w-md">{{ message.content }}</td>
            <td>
              <span v-if="message.hidden" class="tag">已删</span>
              <button v-else-if="props.can('mute')" class="btn btn-sm btn-danger" @click="hide(message)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="more" class="p-3"><button class="btn btn-sm" @click="load(true)">更早的</button></div>
    </div>

    <section class="card space-y-2 p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="font-semibold">屏蔽词 <span class="muted text-sm font-normal">共 {{ wordCount }} 个</span></h3>
        <span class="muted text-xs">每行一个，1~20 字，不分大小写；命中的字样换成 ＊</span>
      </div>
      <textarea v-model="words" class="input w-full font-mono" rows="8" :disabled="!props.can('chatWords')" aria-label="屏蔽词（每行一个）" />
      <button v-if="props.can('chatWords')" class="btn btn-primary" @click="saveWords">保存屏蔽词</button>
      <p v-else class="muted text-xs">修改屏蔽词需运营权限。</p>
    </section>
  </div>
</template>
