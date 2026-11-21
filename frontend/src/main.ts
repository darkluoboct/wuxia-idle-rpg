import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { gameEntryUrl, IS_GUEST_ENTRY, SEPARATE_GUEST_ENTRY } from './network/apiClient'
import './style.css'

if (SEPARATE_GUEST_ENTRY && IS_GUEST_ENTRY) window.location.replace(gameEntryUrl('guest/'))
else createApp(App).use(createPinia()).mount('#app')
