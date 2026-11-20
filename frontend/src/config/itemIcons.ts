import gearAtlas from '@/assets/gear-atlas.webp'
import { ITEMS } from './gameData'

const sheetUrls = import.meta.glob<string>('../assets/item-icons/*.webp', { eager: true, import: 'default', query: '?url' })
const illustrations = import.meta.glob<string>('../assets/item-illustrations/*.webp', { eager: true, import: 'default', query: '?url' })

// 图集按从左到右、从上到下记录，null 表示空格。
const sheets: Record<string, readonly (string | null)[]> = {
  'gear-atlas': [
    'bamboo_hat', 'pine_crown', 'snow_hood', 'xuantie_dagger',
    'cloth_bracers', 'swallow_bracers', 'iron_bracers', 'qinggang_sword',
    'cloth_belt', 'oxhide_belt', 'jade_belt', 'iron_bagua',
    'cloth_boots', 'deerskin_boots', 'cloud_boots', 'xiaoao_qupu',
  ],
  'herbs': [
    'sanqi', 'cheqian_cao', 'honghua', 'heding_lu',
    'jinyinhua', 'fuling', 'heshouwu', 'chunyang_zhi',
    'mahuang', 'hongjingtian', 'xuelian_hua', 'qushe_dan',
    'shexian_cao', 'wugong_qiao', 'duanchang_cao', 'linghu_cao',
  ],
  'medicine-and-tools': [
    'tongmai_dan', 'pozhang_dan', 'bingpo_huxin_dan', 'shaolin_xiaohuan_dan',
    'jiuzhuan_tongqiao_dan', 'yaoshe_baoxue', 'jiuhua_yulu_wan', 'chunyang_jindan',
    'baituo_fushe_gao', 'dahuan_dan', 'tongling_huayu_san', 'skill-fragment',
    'feitian_tieling', 'feihuang_shi', 'dulong_yinzhen', 'yanwei_jian',
  ],
  'named-weapons': [
    'kongming_peach_sword', 'biyu_xiao', 'xuantie_heavysword', 'dagou_stick_true',
    'qimei_stick', 'tiebai_bow', 'chansi_hufan', 'fumo_staff',
    'yangjia_spear', 'xuantie_feizhua', 'baituo_fan', 'lingshe_zhang',
    'tiancan_glove', 'shuangdiao_arrow', 'dadiao_jindao', 'ruanwei_shard',
  ],
  'named-gear-and-relics': [
    'quanzhen_robe', 'wucan_baoyi', 'ruanwei_armor', 'jiuwei_fox',
    'wumu_yishu', 'jiuyin_sanskrit', 'beidou_formation_book', 'qimen_divination_scroll',
    'jiudai_baina', 'baituo_jinsi', 'wanderer_qianji_armor', 'wanderer_qianji_belt',
    'forge-iron', 'forge-stone', 'world-gift', 'recruit-token',
  ],
  'trial-01': [
    'pomiao_caomang_weapon', 'pomiao_caomang_head', 'pomiao_caomang_armor', 'pomiao_caomang_wrist',
    'pomiao_caomang_belt', 'pomiao_caomang_boots', 'pomiao_caomang_acc', 'sect_quanzhen_zhike_armor',
    'zuixian_xingshang_weapon', 'zuixian_xingshang_head', 'zuixian_xingshang_armor', 'zuixian_xingshang_wrist',
    'zuixian_xingshang_belt', 'zuixian_xingshang_boots', 'zuixian_xingshang_acc', 'sect_quanzhen_zhike_head',
  ],
  'trial-02': [
    'fahua_zuyi_weapon', 'fahua_zuyi_head', 'fahua_zuyi_armor', 'fahua_zuyi_wrist',
    'fahua_zuyi_belt', 'fahua_zuyi_boots', 'fahua_zuyi_acc', 'sect_quanzhen_zhike_boots',
    'jiangnan_qiguai_weapon', 'jiangnan_qiguai_head', 'jiangnan_qiguai_armor', 'jiangnan_qiguai_wrist',
    'jiangnan_qiguai_belt', 'jiangnan_qiguai_boots', 'jiangnan_qiguai_acc', 'sect_quanzhen_chongyang_armor',
  ],
  'trial-03': [
    'damo_qibing_weapon', 'damo_qibing_head', 'damo_qibing_armor', 'damo_qibing_wrist',
    'damo_qibing_belt', 'damo_qibing_boots', 'damo_qibing_acc', 'sect_quanzhen_chongyang_weapon',
    'huangshan_kulou_weapon', 'huangshan_kulou_head', 'huangshan_kulou_armor', 'huangshan_kulou_wrist',
    'huangshan_kulou_belt', 'huangshan_kulou_boots', 'huangshan_kulou_acc', 'sect_quanzhen_chongyang_belt',
  ],
  'trial-04': [
    'henglian_tongjia_weapon', 'henglian_tongjia_head', 'henglian_tongjia_armor', 'henglian_tongjia_wrist',
    'henglian_tongjia_belt', 'henglian_tongjia_boots', 'henglian_tongjia_acc', 'sect_gaibang_xingqi_armor',
    'huanghe_sigui_weapon', 'huanghe_sigui_head', 'huanghe_sigui_armor', 'huanghe_sigui_wrist',
    'huanghe_sigui_belt', 'huanghe_sigui_boots', 'huanghe_sigui_acc', 'sect_gaibang_xingqi_weapon',
  ],
  'trial-05': [
    'jinwang_fuxiu_weapon', 'jinwang_fuxiu_head', 'jinwang_fuxiu_armor', 'jinwang_fuxiu_wrist',
    'jinwang_fuxiu_belt', 'jinwang_fuxiu_boots', 'jinwang_fuxiu_acc', 'sect_gaibang_pozhen_wrist',
    'huanghe_nilang_weapon', 'huanghe_nilang_head', 'huanghe_nilang_armor', 'huanghe_nilang_wrist',
    'huanghe_nilang_belt', 'huanghe_nilang_boots', 'huanghe_nilang_acc', 'sect_gaibang_pozhen_armor',
  ],
  'trial-06': [
    'qianshou_panguan_weapon', 'qianshou_panguan_head', 'qianshou_panguan_armor', 'qianshou_panguan_wrist',
    'qianshou_panguan_belt', 'qianshou_panguan_boots', 'qianshou_panguan_acc', 'sect_gaibang_pozhen_weapon',
    'xiyu_mizong_weapon', 'xiyu_mizong_head', 'xiyu_mizong_armor', 'xiyu_mizong_wrist',
    'xiyu_mizong_belt', 'xiyu_mizong_boots', 'xiyu_mizong_acc', 'sect_taohua_saohua_armor',
  ],
  'trial-07': [
    'changbai_canxian_weapon', 'changbai_canxian_head', 'changbai_canxian_armor', 'changbai_canxian_wrist',
    'changbai_canxian_belt', 'changbai_canxian_boots', 'changbai_canxian_acc', 'sect_taohua_saohua_head',
    'baituo_zheshan_weapon', 'baituo_zheshan_head', 'baituo_zheshan_armor', 'baituo_zheshan_wrist',
    'baituo_zheshan_belt', 'baituo_zheshan_boots', 'baituo_zheshan_acc', 'sect_taohua_rushi_armor',
  ],
  'trial-08': [
    'taihu_shuizhai_weapon', 'taihu_shuizhai_head', 'taihu_shuizhai_armor', 'taihu_shuizhai_wrist',
    'taihu_shuizhai_belt', 'taihu_shuizhai_boots', 'taihu_shuizhai_acc', 'sect_taohua_rushi_head',
    'jiamian_piaoping_weapon', 'jiamian_piaoping_head', 'jiamian_piaoping_armor', 'jiamian_piaoping_wrist',
    'jiamian_piaoping_belt', 'jiamian_piaoping_boots', 'jiamian_piaoping_acc', 'sect_taohua_rushi_acc',
  ],
  'trial-09': [
    'jiuyin_baigu_weapon', 'jiuyin_baigu_head', 'jiuyin_baigu_armor', 'jiuyin_baigu_wrist',
    'jiuyin_baigu_belt', 'jiuyin_baigu_boots', 'jiuyin_baigu_acc', 'sect_baituo_bushe_armor',
    'canghai_kuanglan_weapon', 'canghai_kuanglan_head', 'canghai_kuanglan_armor', 'canghai_kuanglan_wrist',
    'canghai_kuanglan_belt', 'canghai_kuanglan_boots', 'canghai_kuanglan_acc', 'sect_baituo_bushe_wrist',
  ],
  'trial-10': [
    'qimen_dunjia_weapon', 'qimen_dunjia_head', 'qimen_dunjia_armor', 'qimen_dunjia_wrist',
    'qimen_dunjia_belt', 'qimen_dunjia_boots', 'qimen_dunjia_acc', 'sect_baituo_sidu_armor',
    'kongming_wantong_weapon', 'kongming_wantong_head', 'kongming_wantong_armor', 'kongming_wantong_wrist',
    'kongming_wantong_belt', 'kongming_wantong_boots', 'kongming_wantong_acc', 'sect_baituo_sidu_weapon',
  ],
  'trial-11': [
    'bihai_chaosheng_weapon', 'bihai_chaosheng_head', 'bihai_chaosheng_armor', 'bihai_chaosheng_wrist',
    'bihai_chaosheng_belt', 'bihai_chaosheng_boots', 'bihai_chaosheng_acc', 'sect_baituo_sidu_acc',
    'baituo_yushe_weapon', 'baituo_yushe_head', 'baituo_yushe_armor', 'baituo_yushe_wrist',
    'baituo_yushe_belt', 'baituo_yushe_boots', 'baituo_yushe_acc', 'sect_quanzhen_hufa_armor',
  ],
  'trial-12': [
    'hama_nimai_weapon', 'hama_nimai_head', 'hama_nimai_armor', 'hama_nimai_wrist',
    'hama_nimai_belt', 'hama_nimai_boots', 'hama_nimai_acc', 'sect_quanzhen_hufa_weapon',
    'qianying_mixing_weapon', 'qianying_mixing_head', 'qianying_mixing_armor', 'qianying_mixing_wrist',
    'qianying_mixing_belt', 'qianying_mixing_boots', 'qianying_mixing_acc', 'sect_quanzhen_hufa_acc',
  ],
  'trial-13': [
    'jiuwei_linghu_weapon', 'jiuwei_linghu_head', 'jiuwei_linghu_armor', 'jiuwei_linghu_wrist',
    'jiuwei_linghu_belt', 'jiuwei_linghu_boots', 'jiuwei_linghu_acc', 'sect_quanzhen_hufa_head',
    'tiezhang_kaishan_weapon', 'tiezhang_kaishan_head', 'tiezhang_kaishan_armor', 'tiezhang_kaishan_wrist',
    'tiezhang_kaishan_belt', 'tiezhang_kaishan_boots', 'tiezhang_kaishan_acc', 'sect_gaibang_zhanglao_armor',
  ],
  'trial-14': [
    'xizheng_jindao_weapon', 'xizheng_jindao_head', 'xizheng_jindao_armor', 'xizheng_jindao_wrist',
    'xizheng_jindao_belt', 'xizheng_jindao_boots', 'xizheng_jindao_acc', 'sect_gaibang_zhanglao_belt',
    'quanzhen_beidou_weapon', 'quanzhen_beidou_head', 'quanzhen_beidou_armor', 'quanzhen_beidou_wrist',
    'quanzhen_beidou_belt', 'quanzhen_beidou_boots', 'quanzhen_beidou_acc', 'sect_gaibang_zhanglao_acc',
  ],
  'trial-15': [
    'dajin_sishi_weapon', 'dajin_sishi_head', 'dajin_sishi_armor', 'dajin_sishi_wrist',
    'dajin_sishi_belt', 'dajin_sishi_boots', 'dajin_sishi_acc', 'sect_gaibang_zhanglao_wrist',
    'niluan_jiuyin_weapon', 'niluan_jiuyin_head', 'niluan_jiuyin_armor', 'niluan_jiuyin_wrist',
    'niluan_jiuyin_belt', 'niluan_jiuyin_boots', 'niluan_jiuyin_acc', 'sect_taohua_yibo_armor',
  ],
  'sect-gear': [
    'sect_taohua_yibo_acc', 'sect_taohua_yibo_boots', 'sect_taohua_yibo_wrist', 'sect_baituo_shaozhuang_armor',
    'sect_baituo_shaozhuang_wrist', 'sect_baituo_shaozhuang_acc', 'sect_baituo_shaozhuang_head', null,
    null, null, null, null,
    null, null, null, null,
  ],
}

const icons = new Map<string, { backgroundImage: string; backgroundPosition: string }>()
for (const [sheet, cells] of Object.entries(sheets)) {
  const url = sheet === 'gear-atlas' ? gearAtlas : sheetUrls[`../assets/item-icons/${sheet}.webp`]
  if (!url) continue
  cells.forEach((id, index) => {
    if (!id) return
    const column = index % 4
    const row = Math.floor(index / 4)
    icons.set(id, {
      backgroundImage: `url(${url})`,
      backgroundPosition: `${column * 100 / 3}% ${row * 100 / 3}%`,
    })
  })
}

export function itemIcon(id: string) {
  return icons.get(ITEMS[id]?.baseItemId ?? id)
}

export function itemIllustration(id: string): string | undefined {
  return illustrations[`../assets/item-illustrations/${ITEMS[id]?.baseItemId ?? id}.webp`]
}
