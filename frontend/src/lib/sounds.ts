// Web Audio API 合成音效，无需外部音频文件

let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  // 部分浏览器需要用户交互后才能恢复
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function tone(
  freq: number,
  startTime: number,
  duration: number,
  gain: number,
  type: OscillatorType = 'sine',
  endFreq?: number,
) {
  const c = getCtx()
  const osc = c.createOscillator()
  const env = c.createGain()

  osc.connect(env)
  env.connect(c.destination)

  osc.type = type
  osc.frequency.setValueAtTime(freq, startTime)
  if (endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration)
  }

  env.gain.setValueAtTime(0, startTime)
  env.gain.linearRampToValueAtTime(gain, startTime + 0.005)
  env.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

  osc.start(startTime)
  osc.stop(startTime + duration + 0.01)
}

// 老虎机滚动中的 tick 声（每格滚过时调用）
export function playSlotTick() {
  const c = getCtx()
  const t = c.currentTime
  // 随机短促高频噪点，模拟滚轮咔哒
  const freq = 300 + Math.random() * 200
  tone(freq, t, 0.04, 0.08, 'square')
}

// 单个滚轮停止时的音效
export function playReelStop(reelIndex: number) {
  const c = getCtx()
  const t = c.currentTime
  // 三个轮音高递增：D5 → F#5 → A5（D大调三和弦）
  const freqs = [587, 740, 880]
  tone(freqs[reelIndex], t, 0.18, 0.18, 'sine')
  // 轻微泛音
  tone(freqs[reelIndex] * 2, t, 0.1, 0.04, 'sine')
}

// 最终倍数确认（三轮全停后）——上行琶音
export function playSlotComplete(multiplier: number) {
  const c = getCtx()
  const t = c.currentTime
  // 倍数越高，音符越高亢
  const base = multiplier >= 2.5 ? 523 : multiplier >= 1.5 ? 440 : 392
  const notes = [base, base * 1.25, base * 1.5, base * 2]
  notes.forEach((f, i) => {
    tone(f, t + i * 0.08, 0.25, 0.15, 'sine')
  })
}

// 记录赢麻了成功——欢快三音上升
export function playWinRecord(winLevel: 'small' | 'medium' | 'big' | 'future') {
  const c = getCtx()
  const t = c.currentTime
  if (winLevel === 'future') {
    // 未来可赢：温柔上扬的两音，略带憧憬感
    tone(440, t, 0.15, 0.1, 'sine')
    tone(554, t + 0.12, 0.2, 0.1, 'sine')
    return
  }
  // 星级越高，音效越响亮，音符越多
  const configs: Record<string, { notes: number[]; gain: number }> = {
    small:  { notes: [523, 659],       gain: 0.1  },
    medium: { notes: [523, 659, 784],  gain: 0.13 },
    big:    { notes: [523, 659, 784, 1047], gain: 0.18 },
  }
  const { notes, gain } = configs[winLevel]
  notes.forEach((f, i) => {
    tone(f, t + i * 0.09, 0.2, gain, 'sine')
  })
  // big 额外加一个爆发音
  if (winLevel === 'big') {
    tone(1047, t + notes.length * 0.09, 0.4, 0.12, 'triangle')
  }
}

// 通用按钮点击音（轻微）
export function playClick() {
  const c = getCtx()
  const t = c.currentTime
  tone(600, t, 0.05, 0.06, 'sine')
}

// 任务勾选完成——轻快两音上扬
export function playTaskDone() {
  const c = getCtx()
  const t = c.currentTime
  tone(523, t,        0.12, 0.1, 'sine')   // C5
  tone(784, t + 0.1,  0.18, 0.12, 'sine')  // G5
}

// 赏金任务弹出——神秘感强的低→高两音 + 铃声
export function playBountyAppear() {
  const c = getCtx()
  const t = c.currentTime
  // 低沉的引入音
  tone(220, t, 0.15, 0.12, 'triangle')
  // 中间过渡
  tone(330, t + 0.12, 0.1, 0.1, 'sine')
  // 亮起来的高音铃声
  tone(880, t + 0.22, 0.3, 0.14, 'sine')
  tone(1108, t + 0.28, 0.25, 0.1, 'sine')
  // 余韵
  tone(660, t + 0.42, 0.4, 0.06, 'sine')
}
