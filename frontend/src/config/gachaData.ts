/**
 * 客栈「醉仙楼·结缘」：概率、保底与卡池在 shared/gacha.ts，服务端与本地试玩共用；
 * 界面的「概率公示」直接读取那里，保证公示与实际一致。
 */
export * from '../../../shared/gacha.ts'

/**
 * 美术 / 音效素材位：当前全部留空，组件会退回纯 SVG / 无声。
 * 拿到素材后把路径填进来（放在 public/ 下，例如 '/gacha/tube.png'）即可生效。
 */
export const GACHA_ASSETS = {
  background: null as string | null, // 醉仙楼雅间背景（横版，≥1920×1080）
  tube: null as string | null, // 签筒（透明底，竖版）
  stick: null as string | null, // 竹签（透明底，细长竖版）
  cardFrame: null as string | null, // 绢本卷轴卡框（透明中心）
  cardBack: null as string | null, // 十连卡背（水墨“缘”字）
  inkSplash: null as string | null, // 神品揭晓时的泼墨序列帧 / 透明 PNG
  portraits: {} as Record<string, string>, // 伙伴立绘：id → 路径（缺省用 InkFigure）
  sfx: {
    shake: null as string | null, // 摇签筒
    draw: null as string | null, // 出签
    reveal: null as string | null, // 普通揭晓（翻卷）
    revealRare: null as string | null, // 绝品 / 神品揭晓（磬声）
    stamp: null as string | null, // 落印
  },
}
