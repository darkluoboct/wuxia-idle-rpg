const DAY = 86_400_000
const UTC8 = 8 * 3_600_000
const FIRST_MONDAY = Date.UTC(2024, 0, 1) - UTC8
export const HUASHAN_SEASON_MS = 14 * DAY
export const HUASHAN_HONORS = ['东邪', '西毒', '南帝', '北丐', '中神通'] as const
export const HUASHAN_RESPECT_QI = 300

export function huashanSeason(now: number) {
  return Math.floor((now - FIRST_MONDAY) / HUASHAN_SEASON_MS)
}

export function huashanSeasonEndsAt(seasonId: number) {
  return FIRST_MONDAY + (seasonId + 1) * HUASHAN_SEASON_MS
}

export function huashanDay(now: number) {
  return Math.floor((now + UTC8) / DAY)
}

export function huashanRatingSwing(winner: number, loser: number) {
  return Math.min(loser, Math.max(1, Math.round(32 / (1 + 10 ** ((winner - loser) / 400)))))
}

export function huashanRankReward(rank: number) {
  if (rank <= 5) return { qiExp: 10_000, silver: 3_000 }
  if (rank <= 100) return { qiExp: 3_000, silver: 1_000 }
  return { qiExp: 1_000, silver: 300 }
}

export function huashanDivision(rating: number) {
  if (rating >= 1400) return '金锁关 · 钻石'
  if (rating >= 1300) return '苍龙岭 · 铂金'
  if (rating >= 1200) return '千尺幢 · 黄金'
  if (rating >= 1100) return '百尺峡 · 白银'
  return '百尺峡 · 青铜'
}
