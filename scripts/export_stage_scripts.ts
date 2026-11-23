/**
 * 把关卡剧情（shared/stageScripts.ts）按 46 回时间线导出成 Markdown，供审稿：
 *   node scripts/export_stage_scripts.ts > docs/28_射雕篇四十六回剧情全文.md
 * 改字改代码，再重新导出。
 */
import { STORY_CHAPTERS } from '../shared/storyData.ts'
import { stageScript, STORY_TIMELINE, TIMELINE_CHAPTER_TITLES, timelineChapter, type ScriptLine, type ScriptPage } from '../shared/stageScripts.ts'
import { ORIGINS } from '../shared/origins.ts'
import { TRIAL_STAGES } from '../shared/trialStages.ts'

const CN = ['一', '二', '三', '四', '五']
const AT: Record<ScriptLine['at'], string> = { OPEN: '开场', ROUND: '第 {r} 回合', ENRAGE: '狂怒', WIN: '胜', LOSE: '负' }
const CHOICE: Record<string, string> = { huangshan_bishou: '荒山遗落的匕首', shedu_baoxue: '药蛇宝血' }

const quote = (pages: readonly ScriptPage[]) =>
  pages.flatMap((page, n) => [...n ? ['>'] : [], ...page.text.split('\n').flatMap((line, m) => [...m ? ['>'] : [], `> ${line}`])])
const line = ({ at, round, speaker, text, when }: ScriptLine) => {
  const branch = when?.choice ? `（「${CHOICE[when.choice[0]] ?? when.choice[0]}」选 ${when.choice[1]}）`
    : when?.origin ? `（${ORIGINS[when.origin].name}出身）` : ''
  return `- ${AT[at].replace('{r}', String(round))}${branch} · ${speaker ? speaker.split('·').at(-1) : '旁白'}：${speaker ? `「${text}」` : text}`
}

const out = [
  '# 射雕篇四十六回剧情全文',
  '',
  '由 `scripts/export_stage_scripts.ts` 从 `shared/stageScripts.ts` 导出，改字以代码为准。设计见 [27_关卡剧情演出方案](./27_关卡剧情演出方案.md)。',
  '',
  '- **起**：首通前的入关卷轴。主线的末页是节点原有的开场，日志里记的也是它。',
  '- **战**：插进战报的对白，打不到的时点不插。同一时点有几句的，按奇遇的选择换。',
  '- **结**：首通胜利后的结语。「下回」只在顺着时间线打时显示。章末再加一页本章回目。',
  '- **江湖传闻**：首胜后在世界频道传开，{name} 换成侠客名。',
  '',
]
let chapter = 0
STORY_TIMELINE.forEach((key, index) => {
  if (timelineChapter(key) !== chapter) {
    chapter = timelineChapter(key)
    out.push(`## 第${CN[chapter - 1]}章 · ${TIMELINE_CHAPTER_TITLES[chapter - 1]}`, '')
  }
  const script = stageScript(key, STORY_CHAPTERS)!
  const node = STORY_CHAPTERS.find(({ code }) => `N${code}` === key)
  const trial = TRIAL_STAGES.find(({ code }) => `T${code}` === key)
  out.push(`### 第 ${index + 1} 回 · ${node ? `主线 ${node.code} ${node.title}` : `历练 ${trial!.code} ${trial!.title}`}`, '')
  if (key === 'N1-1') out.push('**起**：序章（`PrologueStage.vue`）。', '')
  else out.push(`**起**${script.before.length > 1 ? `（${script.before.length} 页）` : ''}`, '', ...quote(script.before), '')
  out.push('**战**', '', ...script.lines.map(line), '')
  if (key === 'N1-1') out.push('**结**：忘机客的剧情卡（`features.ts` 的 TRIAL）。', '')
  else out.push(`**结**${script.after.length > 1 ? `（${script.after.length} 页）` : ''}`, '', ...quote(script.after), '')
  if (script.hook) out.push(`- 下回：${script.hook}`)
  if (script.recap) out.push(`- 小结：${script.recap}`)
  if (script.rumor) out.push(`- 江湖传闻：${script.rumor}`)
  out.push('')
})
console.log(out.join('\n').trimEnd())
