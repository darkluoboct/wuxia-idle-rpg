<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ADMIN_ROLE_LABEL, adminCan, type AdminMeDTO, type AdminPermission } from '../../../shared/admin.ts'
import { adminApi, errorText } from './api'
import AdminsView from './AdminsView.vue'
import AnnouncementsView from './AnnouncementsView.vue'
import AuditView from './AuditView.vue'
import BoostsView from './BoostsView.vue'
import ChatView from './ChatView.vue'
import DashboardView from './DashboardView.vue'
import MailsView from './MailsView.vue'
import PlayersView from './PlayersView.vue'
import ReportsView from './ReportsView.vue'
import ShopView from './ShopView.vue'

/** 运营后台外壳（docs/22）：登录、按权限显示的导航 */
type Tab = 'dashboard' | 'reports' | 'players' | 'chat' | 'mails' | 'announcements' | 'shop' | 'boosts' | 'audit' | 'admins'

const me = ref<AdminMeDTO | null>(null)
const checking = ref(true)
const tab = ref<Tab>('dashboard')
const mailTarget = ref<{ id: string; nickname: string } | null>(null)
const chatTarget = ref<{ id: string; nickname: string } | null>(null)
const form = reactive({ loginName: '', password: '' })
const loginError = ref('')
const busy = ref(false)

const can = (permission: AdminPermission) => !!me.value && adminCan(me.value.role, permission)
const tabs = computed(() => [
  { id: 'dashboard' as const, label: '总览' },
  { id: 'reports' as const, label: '报表' },
  { id: 'players' as const, label: '玩家' },
  { id: 'chat' as const, label: '聊天' },
  { id: 'mails' as const, label: '系统邮件' },
  { id: 'announcements' as const, label: '全服公告' },
  { id: 'shop' as const, label: '商店' },
  { id: 'boosts' as const, label: '倍率活动' },
  { id: 'audit' as const, label: '审计日志' },
  ...(can('admins') ? [{ id: 'admins' as const, label: '后台账号' }] : []),
])

async function login() {
  busy.value = true
  loginError.value = ''
  try {
    me.value = await adminApi<AdminMeDTO>('POST', '/login', form)
    form.password = ''
    tab.value = 'dashboard'
  } catch (error) {
    loginError.value = errorText(error)
  } finally {
    busy.value = false
  }
}

async function logout() {
  await adminApi('POST', '/logout').catch(() => undefined)
  me.value = null
}

function writeTo(player: { id: string; nickname: string }) {
  mailTarget.value = player
  tab.value = 'mails'
}

function chatOf(player: { id: string; nickname: string }) {
  chatTarget.value = player
  tab.value = 'chat'
}

const expired = () => { me.value = null }
onMounted(async () => {
  window.addEventListener('admin-expired', expired)
  try {
    me.value = await adminApi<AdminMeDTO>('GET', '/me')
  } catch {
    me.value = null
  } finally {
    checking.value = false
  }
})
onUnmounted(() => window.removeEventListener('admin-expired', expired))
</script>

<template>
  <div v-if="checking" class="grid min-h-screen place-items-center muted">正在连接后台…</div>

  <main v-else-if="!me" class="grid min-h-screen place-items-center p-4">
    <form class="card w-full max-w-sm space-y-4 p-6" @submit.prevent="login">
      <div>
        <h1 class="text-xl font-semibold">问道武林 · 运营后台</h1>
        <p class="muted mt-1 text-sm">后台账号与游戏账号分开，首个超管用命令行建（见 docs/22）。</p>
      </div>
      <label class="block space-y-1">
        <span class="text-sm">后台账号</span>
        <input v-model="form.loginName" class="input w-full" name="loginName" autocomplete="username" required>
      </label>
      <label class="block space-y-1">
        <span class="text-sm">密码</span>
        <input v-model="form.password" class="input w-full" type="password" name="password" autocomplete="current-password" required>
      </label>
      <p v-if="loginError" class="danger text-sm" role="alert">{{ loginError }}</p>
      <button class="btn btn-primary w-full" :disabled="busy">{{ busy ? '登录中…' : '登录' }}</button>
    </form>
  </main>

  <div v-else class="min-h-screen">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-3">
      <h1 class="text-base font-semibold">问道武林 · 运营后台</h1>
      <div class="flex items-center gap-3 text-sm">
        <span class="tag">{{ ADMIN_ROLE_LABEL[me.role] }}</span>
        <span>{{ me.login }}</span>
        <button class="btn btn-sm" @click="logout">退出</button>
      </div>
    </header>
    <div class="mx-auto flex max-w-7xl flex-col gap-4 p-4 md:flex-row">
      <nav class="flex shrink-0 flex-wrap gap-1 md:w-40 md:flex-col" aria-label="后台导航">
        <button
          v-for="item in tabs" :key="item.id" class="nav-item !w-auto md:!w-full" :aria-current="tab === item.id ? 'page' : undefined"
          @click="tab = item.id"
        >{{ item.label }}</button>
      </nav>
      <section class="min-w-0 flex-1">
        <DashboardView v-if="tab === 'dashboard'" />
        <ReportsView v-else-if="tab === 'reports'" />
        <ShopView v-else-if="tab === 'shop'" :can="can" />
        <BoostsView v-else-if="tab === 'boosts'" :can="can" />
        <PlayersView v-else-if="tab === 'players'" :can="can" @write="writeTo" @chat="chatOf" />
        <ChatView v-else-if="tab === 'chat'" :can="can" :target="chatTarget" @clear-target="chatTarget = null" />
        <MailsView v-else-if="tab === 'mails'" :can="can" :target="mailTarget" @clear-target="mailTarget = null" />
        <AnnouncementsView v-else-if="tab === 'announcements'" :can="can" />
        <AuditView v-else-if="tab === 'audit'" />
        <AdminsView v-else-if="tab === 'admins'" :me="me" />
      </section>
    </div>
  </div>
</template>
