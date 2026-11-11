<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Bell, Check, ChevronDown, ChevronRight, Eye, EyeOff, Gamepad2, LoaderCircle, LockKeyhole, Maximize2, Settings, ShieldCheck, Swords, UserRound, UserRoundPlus, X } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { IS_MOCK_MODE } from '@/network/apiClient'
import loginScene from '@/assets/login-jiaxing.webp'

const emit = defineEmits<{ guest: [] }>()
const store = useGameStore()
const gameWindow = window.frameElement?.id === 'game-frame' ? window.parent : window
const mode = ref<'login' | 'register'>('login')
let rememberedName = ''
try { rememberedName = localStorage.getItem('wuxia.loginName') ?? '' } catch { /* 存储不可用时仍可登录。 */ }
const loginName = ref(rememberedName)
const rememberName = ref(!!rememberedName)
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const submitting = ref(false)
const formError = ref('')
const busy = computed(() => submitting.value || store.authBusy)
const errorMessage = computed(() => formError.value || store.authError)
const modal = ref<HTMLDialogElement>()
const modalKind = ref<'settings' | 'notice' | 'server'>('notice')
const sceneMotion = ref(true)
const settingsError = ref('')

watch(rememberName, (remember) => {
  if (!remember) {
    try { localStorage.removeItem('wuxia.loginName') } catch { /* 不影响登录。 */ }
  }
})

function toggleMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  formError.value = ''
  store.authError = ''
  password.value = ''
  confirmPassword.value = ''
  showPassword.value = false
}

async function submit() {
  if (busy.value) return
  formError.value = ''
  if (mode.value === 'register' && password.value !== confirmPassword.value) {
    formError.value = '两次输入的密码不一致'
    return
  }
  submitting.value = true
  try {
    await store.signIn(mode.value, loginName.value.trim(), password.value)
    if (store.authError) return
    try {
      if (rememberName.value) localStorage.setItem('wuxia.loginName', loginName.value.trim())
      else localStorage.removeItem('wuxia.loginName')
    } catch { /* 只记账号名，存储不可用时不影响会话。 */ }
    password.value = ''
    confirmPassword.value = ''
    // 试玩入口完成认证后重新载入联机客户端，后续操作使用服务端存档。
    if (IS_MOCK_MODE) {
      const url = new URL(gameWindow.location.href)
      url.searchParams.set('mode', 'online')
      gameWindow.location.replace(url)
    }
  } finally {
    submitting.value = false
  }
}

function enterGuest() {
  if (IS_MOCK_MODE) emit('guest')
  else {
    const url = new URL(gameWindow.location.href)
    url.searchParams.set('mode', 'guest')
    gameWindow.location.assign(url)
  }
}

function openModal(kind: typeof modalKind.value) {
  modalKind.value = kind
  settingsError.value = ''
  modal.value?.showModal()
}

async function toggleFullscreen() {
  try {
    const gameDocument = gameWindow.document
    if (gameDocument.fullscreenElement) await gameDocument.exitFullscreen()
    else await gameDocument.documentElement.requestFullscreen()
  } catch { settingsError.value = '当前窗口不支持全屏显示' }
}
</script>

<template>
  <main class="login-scene" :class="{ 'login-scene-still': !sceneMotion }" aria-label="登录江湖">
    <img class="login-landscape" :src="loginScene" alt="晨光中的嘉兴南湖，一位戴笠旅人沿石桥走向烟雨楼" fetchpriority="high" />
    <div class="login-vignette" aria-hidden="true" />
    <header class="login-header">
      <div class="login-brand" aria-label="金庸群侠，问道武林">
        <div class="brand-title"><h1 class="font-brush">金庸群侠</h1><span class="brand-seal">问道</span></div>
        <p><span aria-hidden="true" />问 道 武 林<span aria-hidden="true" /></p>
      </div>
      <nav class="login-tools" aria-label="登录工具">
        <button aria-label="设置" @click="openModal('settings')"><Settings aria-hidden="true" /><span>设置</span></button>
        <button aria-label="江湖公告" @click="openModal('notice')"><Bell aria-hidden="true" /><span>江湖公告</span></button>
      </nav>
    </header>

    <section class="login-location" aria-label="故事起点"><p><span aria-hidden="true" />第一卷 · 射雕英雄传</p><h2 class="font-brush">嘉兴<span>·</span>烟雨楼外</h2><span class="location-detail">无门无派，亦可问道武林。</span></section>

    <section class="login-panel" aria-labelledby="login-title">
      <header class="login-panel-heading"><h2 id="login-title" class="font-brush">{{ mode === 'login' ? '账号登录' : '注册账号' }}</h2><div class="login-heading-rule" aria-hidden="true"><span /><Swords /><span /></div></header>
      <form @submit.prevent="submit">
        <fieldset class="login-fields" :disabled="busy">
          <label class="login-field"><UserRound aria-hidden="true" /><span class="field-label">账号</span><input v-model="loginName" type="text" name="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="字母、数字或下划线" title="账号使用 3 至 24 位字母、数字或下划线" /></label>
          <div class="login-field password-field">
            <label class="password-label" for="login-password"><LockKeyhole aria-hidden="true" /><span class="field-label">密码</span></label>
            <input id="login-password" v-model="password" name="password" :type="showPassword ? 'text' : 'password'" required minlength="8" maxlength="128" :autocomplete="mode === 'register' ? 'new-password' : 'current-password'" placeholder="请输入密码，至少 8 位" :aria-invalid="!!errorMessage" aria-describedby="login-message" />
            <button type="button" class="password-toggle" :aria-label="showPassword ? '隐藏密码' : '显示密码'" :aria-pressed="showPassword" @click="showPassword = !showPassword"><EyeOff v-if="showPassword" /><Eye v-else /></button>
          </div>
          <label v-if="mode === 'register'" class="login-field"><ShieldCheck aria-hidden="true" /><span class="field-label">确认</span><input v-model="confirmPassword" name="confirm-password" :type="showPassword ? 'text' : 'password'" required minlength="8" maxlength="128" autocomplete="new-password" placeholder="请再次输入密码" aria-label="确认密码" /></label>
          <button type="button" class="login-server" aria-label="选择服务器：嘉兴烟雨" @click="openModal('server')"><span><i class="login-server-dot" />选择服务器</span><strong>嘉兴烟雨 · 江湖在线</strong><ChevronDown aria-hidden="true" /></button>
          <div class="login-options"><label><input v-model="rememberName" type="checkbox" name="remember-username" />记住账号</label><span><ShieldCheck aria-hidden="true" />江湖存档 · 随账号保存</span></div>
        </fieldset>
        <div id="login-message" class="login-message" :class="{ 'login-error': errorMessage }" :role="errorMessage ? 'alert' : 'status'" aria-live="polite"><span v-if="errorMessage">{{ errorMessage }}</span><span v-else-if="store.authBusy"><LoaderCircle class="login-spinner" aria-hidden="true" />正在连接江湖…</span><button v-if="store.onlinePhase === 'error'" type="button" :disabled="busy" @click="store.resumeOnline()">重新连接</button></div>
        <button type="submit" class="login-primary font-brush" :disabled="busy"><LoaderCircle v-if="busy" class="login-spinner" aria-hidden="true" /><span v-else class="login-button-ornament" aria-hidden="true">❖</span><span>{{ busy ? '静候片刻' : mode === 'register' ? '注册并启程' : '进入江湖' }}</span><ChevronRight v-if="!busy" aria-hidden="true" /></button>
      </form>
      <div class="login-secondary"><button type="button" :disabled="busy" @click="toggleMode"><UserRound v-if="mode === 'register'" aria-hidden="true" /><UserRoundPlus v-else aria-hidden="true" />{{ mode === 'register' ? '已有账号，去登录' : '注册账号' }}</button><button type="button" :disabled="submitting" @click="enterGuest"><Gamepad2 aria-hidden="true" />游客进入</button></div>
      <p class="guest-note">游客可试玩，最近游玩的角色进度可保存在当前浏览器。</p>
      <div class="login-panel-flourish" aria-hidden="true"><span />◆<span /></div>
    </section>

    <div class="login-petals" aria-hidden="true"><i v-for="n in 7" :key="n" :style="{ '--petal': n }" /></div>
    <footer class="login-footer"><span>金庸群侠 · 问道武林</span><span>散人启程<span class="footer-divider">／</span>三人同行<span class="footer-divider">／</span>文字演武</span></footer>
    <dialog ref="modal" class="login-dialog" aria-labelledby="login-dialog-title" @click.self="modal?.close()">
      <div class="login-dialog-content">
        <button class="login-dialog-close" aria-label="关闭弹窗" @click="modal?.close()"><X /></button>
        <h2 id="login-dialog-title" class="font-brush">{{ { settings: '界面设置', notice: '江湖公告', server: '江湖区服' }[modalKind] }}</h2>
        <template v-if="modalKind === 'settings'"><label class="login-setting"><span>飘花与场景动态</span><input v-model="sceneMotion" type="checkbox" /></label><button class="fullscreen-setting" @click="toggleFullscreen"><Maximize2 aria-hidden="true" />切换全屏</button><p v-if="settingsError" class="login-error" role="status">{{ settingsError }}</p></template>
        <div v-else-if="modalKind === 'notice'" class="login-notice"><span class="notice-kicker">第一卷 · 射雕英雄传</span><h3 class="font-brush">江湖始于嘉兴烟雨</h3><p>从无门无派的散人出发，沿射雕主线历练，结识郭靖、黄蓉等江湖同道。</p><ul><li>打坐吐纳，积累修为，冲穴破境。</li><li>一位主角、两位伙伴，结伴文字演武。</li><li>联机可同图聊天、双人共修、三人结义。</li></ul><button class="notice-confirm" @click="modal?.close()">知晓，启程<ChevronRight aria-hidden="true" /></button></div>
        <div v-else class="login-server-list"><p>当前开放区服</p><button @click="modal?.close()"><i class="login-server-dot" /><span>嘉兴烟雨 · 江湖在线<small>第一卷 · 射雕英雄传</small></span><Check aria-hidden="true" /></button></div>
      </div>
    </dialog>
  </main>
</template>

<style scoped>
.login-scene { --login-gold: #d7b577; --login-pale: #f4dfb2; position: relative; isolation: isolate; width: 100%; height: 100dvh; min-height: 36rem; overflow: hidden; background: #253744; color: #ece2ce; }
.login-landscape { position: absolute; z-index: -3; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; animation: login-landscape-in 1.8s ease-out both; }
.login-vignette { position: absolute; z-index: -2; inset: 0; background: linear-gradient(0deg, #13222ee6, transparent 23%), linear-gradient(90deg, #101b2540, transparent 43%, #18263918 70%), linear-gradient(180deg, #14202c45, transparent 22%); }
.login-header { position: absolute; z-index: 4; top: 1.3rem; left: 2rem; right: 2rem; display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
.login-brand { position: relative; width: max-content; padding: .6rem 1.1rem .65rem; background: url('../assets/cloud-etch.svg') left center / 100% 100% no-repeat, radial-gradient(ellipse, #141b1ee6 10%, #151c20b8 55%, transparent 75%); animation: login-panel-in .8s .1s both; }
.brand-title { display: flex; align-items: center; justify-content: center; gap: .7rem; }
.brand-title h1 { margin: 0; font-size: clamp(3rem, 5.4vw, 5.8rem); line-height: 1.16; color: #fff0d2; letter-spacing: .025em; text-shadow: 0 3px 3px #14202b, 0 0 20px #e0bc7340; }
.brand-seal { writing-mode: vertical-rl; padding: .4rem .16rem; border-radius: 45%; background: #9a2d30; color: #fff3dc; font-family: var(--font-brush); font-size: 1.05rem; box-shadow: inset 0 0 0 1px #e19b8150, 0 2px 6px #1118; }
.login-brand > p { display: flex; align-items: center; justify-content: center; gap: .7rem; margin: .05rem 0 0; font-size: .85rem; color: #e2c78f; letter-spacing: .22em; }
.login-brand > p > span { width: 2rem; height: 1px; background: linear-gradient(90deg, transparent, #dfba74); }
.login-brand > p > span:last-child { rotate: 180deg; }
.login-tools { display: flex; gap: .65rem; }
.login-tools > button { display: flex; align-items: center; justify-content: center; gap: .4rem; min-height: 2.1rem; padding: .25rem .9rem; border: 1px solid #d6b16a85; border-radius: .3rem 1rem; color: #f0ddba; background: linear-gradient(#24303cd9, #1d2733eb); box-shadow: inset 0 0 0 2px #b8955230, 0 2px 6px #152b3d30; font-size: .9rem; transition: background .2s, border-color .2s; }
.login-tools > button:hover { background: #3a3e3feb; border-color: #ebca8a; }
.login-tools svg { width: 1.1rem; height: 1.1rem; color: var(--login-gold); stroke-width: 1.8; }
.login-location { position: absolute; z-index: 2; left: 3.3rem; bottom: 5.3rem; text-shadow: 0 2px 8px #172329, 0 0 20px #172329b0; animation: login-panel-in 1s .4s both; }
.login-location > p { display: flex; align-items: center; gap: .7rem; margin: 0 0 .3rem; font-size: .9rem; letter-spacing: .17em; color: #f1dbb0; }
.login-location > p > span { width: 1.8rem; height: 1px; background: #f1dbb0; }
.login-location > h2 { margin: 0 0 .3rem; font-size: clamp(2rem, 3.25vw, 3.7rem); line-height: 1.4; letter-spacing: .1em; color: #fff0d2; }
.login-location h2 > span { padding-inline: .2em; }
.location-detail { font-size: .85rem; letter-spacing: .18em; color: #d7d9d0; }
.login-panel { position: absolute; z-index: 4; top: 50%; right: 6.4%; translate: 0 -45%; width: min(35.5rem, 43vw); max-height: calc(100dvh - 9rem); overflow: auto; padding: 1.6rem 2rem 1.1rem; background: url('../assets/cloud-etch.svg') right -2rem bottom -1rem / 24rem auto no-repeat, url('../assets/cloud-etch.svg') left -8rem top -2rem / 22rem auto no-repeat, radial-gradient(ellipse at 50% 105%, #7b654423, transparent 55%), linear-gradient(125deg, #22272bed, #191f25f5 65%, #292d2def); box-shadow: 0 15px 55px #10233570, inset 0 0 35px #0b121b80; animation: login-panel-in .85s .2s both; }
.login-panel::before { content: ''; position: absolute; z-index: 1; inset: 0; pointer-events: none; border: 1px solid transparent; border-image: url('../assets/frame-etch.svg') 31 / 2.4rem stretch; }
.login-panel::after { content: ''; position: absolute; inset: .4rem; pointer-events: none; border: 1px solid #b3955c38; }
.login-panel-heading { text-align: center; margin-bottom: 1.2rem; }
.login-panel-heading h2 { margin: 0; font-size: 2.65rem; line-height: 1.35; color: var(--login-pale); letter-spacing: .2em; text-indent: .2em; }
.login-heading-rule { display: flex; align-items: center; justify-content: center; gap: .6rem; margin-top: .5rem; color: #c3a065; }
.login-heading-rule > span { width: 30%; height: 1px; background: linear-gradient(90deg, transparent, #b4955e); }
.login-heading-rule > span:last-child { rotate: 180deg; }
.login-heading-rule > svg { width: 1.25rem; height: 1.25rem; stroke-width: 1.4; }
.login-fields { display: grid; gap: .95rem; min-width: 0; margin: 0; padding: 0; border: 0; }
.login-field { display: flex; align-items: center; gap: .75rem; min-width: 0; min-height: 3.35rem; padding: .45rem .85rem; border: 1px solid #b5965eae; border-radius: 2px 10px; background: linear-gradient(95deg, #66513626, #111a2280); box-shadow: inset 0 0 0 2px #ba9a4c10; transition: border-color .2s, box-shadow .2s; }
.login-field:focus-within { border-color: #edca85; box-shadow: 0 0 0 2px #edca8526, inset 0 0 15px #dbb46c0c; }
.login-field > svg, .password-label > svg { flex: none; width: 1.3rem; height: 1.3rem; color: #d5b77c; stroke-width: 1.6; fill: #d5b77c18; }
.field-label { flex: none; padding-right: .8rem; border-right: 1px solid #b5965e73; color: #ecd8af; font-size: 1.15rem; white-space: nowrap; }
.login-field > input { flex: 1; width: 0; min-width: 0; border: 0; outline: none; background: transparent; padding: .15rem 0; color: #f0e7d4; font-size: .98rem; }
.login-field > input::placeholder { color: #a8a396; font-size: .91rem; }
.password-label { display: flex; align-items: center; gap: .75rem; flex: none; cursor: text; }
.password-toggle { display: grid; place-items: center; flex: none; min-width: 1.7rem; min-height: 2rem; color: #cbb98e; }
.password-toggle > svg { width: 1.2rem; height: 1.2rem; stroke-width: 1.6; }
.login-server { display: flex; align-items: center; gap: .75rem; width: 100%; min-height: 3.3rem; padding: .5rem .85rem; border: 1px solid #b5965eae; border-radius: 2px 10px; background: linear-gradient(95deg, #66513626, #111a2280); }
.login-server > span { display: flex; align-items: center; gap: .6rem; flex: none; color: #e5cfa4; font-size: .94rem; }
.login-server strong { flex: 1; border-left: 1px solid #b5965e73; padding-left: .75rem; font-size: .92rem; font-weight: 400; text-align: center; white-space: nowrap; }
.login-server > svg { flex: none; width: 1.1rem; height: 1.1rem; color: var(--login-gold); }
.login-server-dot { display: inline-block; width: .5rem; height: .5rem; flex: none; border-radius: 50%; background: #6dbb94; box-shadow: 0 0 8px #6dbb9440; }
.login-options { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .1rem .1rem 0; }
.login-options > label { display: flex; align-items: center; gap: .55rem; font-size: .95rem; color: #e0cda9; cursor: pointer; }
.login-options input { width: 1.1rem; height: 1.1rem; accent-color: #b68b48; }
.login-options > span { display: flex; align-items: center; gap: .3rem; font-size: .72rem; color: #aba797; }
.login-options > span > svg { width: .9rem; height: .9rem; }
.login-message { display: flex; align-items: center; justify-content: space-between; gap: .7rem; min-height: 2.7rem; padding: .45rem .1rem; font-size: .8rem; color: #bdad91; line-height: 1.5; }
.login-message > span { display: flex; align-items: center; gap: .4rem; }
.login-message > button { flex: none; color: #e4c28a; text-decoration: underline; text-underline-offset: .2rem; }
.login-error { color: #efaa98; }
.login-primary { position: relative; display: flex; align-items: center; justify-content: center; gap: .85rem; width: 90%; min-height: 4.5rem; margin: .05rem auto 1.45rem; padding: .55rem 1rem; border: 1px solid #efcb83; border-radius: 2.7rem .4rem 2.7rem .4rem; background: url('../assets/cloud-etch.svg') right bottom / 14rem auto no-repeat, linear-gradient(110deg, #684b29, #a77836 50%, #674a29); color: #fff0c6; box-shadow: inset 0 0 0 3px #61451f, inset 0 0 0 4px #e4bf6e, inset 0 0 15px #e4b65c60, 0 0 17px #e5b45930, 0 5px 12px #0a141a80; font-size: 2.6rem; line-height: 1.2; letter-spacing: .09em; text-shadow: 0 2px 3px #50351c; transition: transform .2s, filter .2s; }
.login-primary::after { content: ''; position: absolute; bottom: 0; left: 23%; right: 23%; height: 2px; background: #ffeab3; box-shadow: 0 0 14px 3px #edba6380; }
.login-primary:hover:not(:disabled) { filter: brightness(1.15); transform: translateY(-2px); }
.login-primary:active:not(:disabled) { transform: translateY(0); }
.login-primary:disabled { cursor: wait; opacity: .6; }
.login-primary > svg { width: 1.5rem; height: 1.5rem; flex: none; stroke-width: 1.6; }
.login-button-ornament { font-size: 1.3rem; }
.login-secondary { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem; }
.login-secondary > button { display: flex; align-items: center; justify-content: center; gap: .5rem; min-height: 2.65rem; padding: .4rem; border: 1px solid #bd9a5b; border-radius: 2px 10px; color: #e6d2a5; font-size: 1.1rem; background: linear-gradient(100deg, #57473350, #2d3034a0); box-shadow: inset 0 0 0 2px #c6a45e13; transition: border-color .2s, background .2s; }
.login-secondary > button:hover:not(:disabled) { border-color: #e9cb88; background-color: #a5874030; }
.login-secondary > button:disabled { opacity: .45; }
.login-secondary svg { width: 1.3rem; height: 1.3rem; stroke-width: 1.6; fill: #d5b77c18; }
.guest-note { margin: .8rem 0 .4rem; color: #a7a293; text-align: center; font-size: .7rem; }
.login-panel-flourish { display: flex; align-items: center; justify-content: center; gap: .7rem; color: #ac8b51; font-size: .55rem; }
.login-panel-flourish > span { width: 25%; height: 1px; background: linear-gradient(90deg, transparent, #94734480); }
.login-panel-flourish > span:last-child { rotate: 180deg; }
.login-petals { position: absolute; z-index: 3; inset: 0; overflow: hidden; pointer-events: none; }
.login-petals > i { position: absolute; top: -3%; left: calc(var(--petal) * 13%); width: calc(6px + var(--petal) * .6px); height: 6px; border-radius: 90% 10% 80% 20%; background: #f4b8cb; opacity: 0; animation: login-petal-fall calc(13s + var(--petal) * 1.2s) calc(var(--petal) * -3s) linear infinite; }
.login-footer { position: absolute; z-index: 2; left: 2rem; right: 2rem; bottom: .8rem; display: flex; justify-content: space-between; gap: 1rem; color: #d6d7cd; font-size: .7rem; letter-spacing: .14em; text-shadow: 0 1px 4px #14252a; }
.footer-divider { padding-inline: .65rem; color: #d5b97c; }
.login-dialog { width: min(27rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); overflow: auto; padding: 0; margin: auto; border: 1px solid #b99a61; border-radius: 4px 16px; background: url('../assets/cloud-etch.svg') right bottom / 18rem auto no-repeat, #20272d; color: #e7dcc5; box-shadow: inset 0 0 0 4px #20272d, inset 0 0 0 5px #b99a6130, 0 20px 80px #0009; }
.login-dialog::backdrop { background: #0e1b2a94; backdrop-filter: blur(5px); }
.login-dialog-content { position: relative; padding: 2rem; }
.login-dialog h2 { margin: 0 0 1.2rem; font-size: 2rem; color: var(--login-pale); }
.login-dialog-close { position: absolute; top: .7rem; right: .7rem; display: grid; place-items: center; padding: .4rem; color: var(--login-gold); }
.login-dialog-close > svg { width: 1.15rem; height: 1.15rem; }
.login-setting, .fullscreen-setting { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding-block: .75rem; font-size: .9rem; }
.login-setting input { width: 1.1rem; height: 1.1rem; accent-color: #c3a365; }
.fullscreen-setting { justify-content: flex-start; width: 100%; margin-top: .5rem; border-top: 1px solid #a58a5840; color: #e1cba2; }
.fullscreen-setting svg { width: 1rem; height: 1rem; }
.login-notice { font-size: .9rem; line-height: 1.9; color: #c0b7a5; }
.notice-kicker { font-size: .73rem; letter-spacing: .15em; color: #cab17c; }
.login-notice h3 { margin: .45rem 0; color: #ead9b4; font-size: 1.6rem; }
.login-notice ul { padding-left: 1.2rem; margin-top: 1rem; list-style: disc; }
.notice-confirm { display: flex; align-items: center; justify-content: center; gap: .5rem; width: 100%; margin-top: 1.4rem; padding: .55rem; border: 1px solid #b49660; background: #8d6c3438; color: #f0deb4; }
.notice-confirm svg { width: 1rem; height: 1rem; }
.login-server-list > p { margin-bottom: 1rem; color: #ada593; font-size: .8rem; }
.login-server-list > button { display: flex; align-items: center; gap: .8rem; width: 100%; padding: 1rem; border: 1px solid #a58a5866; background: #a58a5820; text-align: left; }
.login-server-list > button > span { flex: 1; font-size: .9rem; color: #e6d1a7; }
.login-server-list small { display: block; color: #ada593; font-size: .72rem; margin-top: .3rem; }
.login-server-list svg { width: 1.1rem; height: 1.1rem; color: #d1b275; }
.login-spinner { animation: login-spin 1s linear infinite; }
.login-message .login-spinner { width: .9rem; height: .9rem; }
@keyframes login-spin { to { rotate: 360deg; } }
@keyframes login-landscape-in { from { opacity: .5; scale: 1.025; } to { opacity: 1; scale: 1; } }
@keyframes login-panel-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes login-petal-fall { 0% { opacity: 0; transform: translate(0, 0) rotate(0); } 10% { opacity: .8; } 90% { opacity: .6; } 100% { opacity: 0; transform: translate(calc(120px + var(--petal) * 18px), 103vh) rotate(360deg); } }
.login-scene-still .login-petals { display: none; }
.login-scene-still .login-landscape, .login-scene-still .login-brand, .login-scene-still .login-location, .login-scene-still .login-panel { animation: none; }
@media (min-width: 1900px) { .login-panel { right: 8%; } .login-brand { padding-inline: 1.5rem; } }
@media (max-height: 800px) and (min-width: 761px) { .login-panel { padding: 1.2rem 1.65rem .9rem; max-height: calc(100dvh - 6rem); translate: 0 -44%; } .login-panel-heading { margin-bottom: .9rem; } .login-panel-heading h2 { font-size: 2.2rem; } .login-heading-rule { margin-top: .25rem; } .login-fields { gap: .7rem; } .login-field, .login-server { min-height: 3rem; } .login-message { min-height: 2.4rem; } .login-primary { min-height: 3.8rem; font-size: 2.2rem; margin-bottom: 1.1rem; } .guest-note { margin-top: .6rem; } .login-location { bottom: 4rem; } }
@media (max-width: 1100px) and (min-width: 761px) { .login-header { left: 1.2rem; right: 1.2rem; } .login-panel { right: 3%; width: 29rem; padding-inline: 1.5rem; } .login-location { left: 2rem; } .login-location h2 { font-size: 2.3rem; } .login-server { gap: .5rem; padding-inline: .7rem; } .login-server > span { font-size: .8rem; } .login-server strong { font-size: .8rem; padding-left: .5rem; } }
@media (max-width: 760px) {
  .login-scene { min-height: 0; overflow: auto; display: flex; flex-direction: column; align-items: center; padding: 8.7rem .85rem 3.5rem; }
  .login-landscape, .login-vignette { position: fixed; }
  .login-landscape { object-position: 36% center; }
  .login-vignette { background: linear-gradient(0deg, #13222da6, #13222d20 60%, #13222d55); }
  .login-header { top: 1rem; left: .8rem; right: .8rem; align-items: flex-start; }
  .login-brand { padding: .4rem .3rem; }
  .brand-title { gap: .4rem; }
  .brand-title h1 { font-size: 2.65rem; }
  .brand-seal { font-size: .7rem; padding: .25rem .12rem; }
  .login-brand > p { font-size: .65rem; gap: .4rem; }
  .login-brand > p > span { width: 1rem; }
  .login-tools { gap: .4rem; padding-top: .2rem; }
  .login-tools > button { width: 2.2rem; min-height: 2.2rem; padding: .35rem; }
  .login-tools > button > span { display: none; }
  .login-panel { position: relative; top: auto; right: auto; translate: none; width: min(100%, 28rem); max-height: none; overflow: visible; flex: none; padding: 1.3rem 1.1rem 1rem; }
  .login-panel-heading { margin-bottom: 1rem; }
  .login-panel-heading h2 { font-size: 2.1rem; }
  .login-heading-rule { margin-top: .35rem; }
  .login-fields { gap: .8rem; }
  .login-field { gap: .5rem; padding-inline: .65rem; min-height: 3.25rem; }
  .login-field > svg, .password-label > svg { width: 1.1rem; height: 1.1rem; }
  .password-label { gap: .5rem; }
  .field-label { font-size: 1rem; padding-right: .55rem; }
  .login-field > input { font-size: .9rem; }
  .login-field > input::placeholder { font-size: .8rem; }
  .password-toggle { min-width: 1.2rem; }
  .password-toggle svg { width: 1.1rem; height: 1.1rem; }
  .login-server { gap: .5rem; padding-inline: .65rem; min-height: 3.2rem; }
  .login-server > span { font-size: .74rem; gap: .4rem; }
  .login-server strong { font-size: .77rem; padding-left: .45rem; }
  .login-server > svg { width: .85rem; height: .85rem; }
  .login-server-dot { width: .4rem; height: .4rem; }
  .login-options > label { font-size: .85rem; gap: .4rem; }
  .login-options > span { font-size: .6rem; }
  .login-options > span > svg { width: .75rem; height: .75rem; }
  .login-message { min-height: 2.6rem; font-size: .72rem; }
  .login-primary { width: 94%; min-height: 4rem; margin-bottom: 1.25rem; font-size: 2.1rem; gap: .7rem; }
  .login-secondary { gap: .8rem; }
  .login-secondary > button { min-height: 2.75rem; font-size: .95rem; gap: .4rem; }
  .login-secondary svg { width: 1.1rem; height: 1.1rem; }
  .guest-note { margin-top: .75rem; font-size: .6rem; }
  .login-location { position: relative; left: auto; bottom: auto; order: 1; margin-top: 1.7rem; text-align: center; }
  .login-location > p { justify-content: center; font-size: .7rem; }
  .login-location > p > span { display: none; }
  .login-location h2 { font-size: 1.8rem; }
  .location-detail { font-size: .65rem; }
  .login-footer { position: relative; left: auto; right: auto; bottom: auto; order: 2; margin-top: 1.4rem; font-size: .55rem; }
  .login-footer > span:first-child { display: none; }
}
@media (max-height: 620px) and (min-width: 761px) { .login-scene { overflow-y: auto; min-height: 0; } .login-panel { position: relative; top: auto; right: auto; margin: 5rem 6% 2rem auto; translate: none; max-height: none; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } .login-petals { display: none; } }
</style>
