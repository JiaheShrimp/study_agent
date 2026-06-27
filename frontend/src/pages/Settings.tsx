import { useEffect, useState } from 'react'
import { Bot, Eye, EyeOff, CheckCircle2, XCircle, Loader2, ExternalLink, ChevronDown } from 'lucide-react'
import { api, type AIStatus, type AIProviderMeta } from '@/lib/api'
import { cn } from '@/lib/utils'

const PROVIDER_LINKS: Record<string, string> = {
  anthropic:  'https://console.anthropic.com/',
  openai:     'https://platform.openai.com/api-keys',
  deepseek:   'https://platform.deepseek.com/',
  qwen:       'https://dashscope.console.aliyun.com/apiKey',
  doubao:     'https://console.volcengine.com/ark',
  zhipu:      'https://open.bigmodel.cn/usercenter/apikeys',
  moonshot:   'https://platform.moonshot.cn/console/api-keys',
  minimax:    'https://platform.minimaxi.com/user-center/basic-information/interface-key',
  groq:       'https://console.groq.com/keys',
  gemini:     'https://aistudio.google.com/app/apikey',
}

export function Settings() {
  const [status, setStatus] = useState<AIStatus | null>(null)

  const [provider, setProvider]         = useState('')
  const [keyInput, setKeyInput]         = useState('')
  const [editingKey, setEditingKey]     = useState(false)   // 用户是否正在输入新 Key（否则框里显示掩码）
  const [modelInput, setModelInput]     = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [showKey, setShowKey]           = useState(false)
  const [saving, setSaving]             = useState(false)
  const [saveMsg, setSaveMsg]           = useState<'ok' | 'err' | null>(null)

  async function loadStatus() {
    const s = await api.ai.status().catch(() => null)
    if (!s) return
    setStatus(s)
    setProvider(s.provider || '')
    setModelInput(s.model || '')
    setBaseUrlInput(s.custom_base_url || '')
    setKeyInput('')
    setEditingKey(false)   // 回到「显示掩码」态
  }

  useEffect(() => { loadStatus() }, [])

  const providerMeta: AIProviderMeta | undefined =
    status?.providers.find(p => p.id === provider)

  function handleProviderChange(pid: string) {
    setProvider(pid)
    setModelInput('')   // 切换 provider 时清空，让用户重新填
    setKeyInput('')
    setEditingKey(false)
  }

  // 已为当前 provider 设过 Key：此时输入框可留空只改模型，后端保留原 Key
  const keyAlreadySet = !!(status?.key_set && status.provider === provider)
  // 能保存：选了 provider，且（已有 Key 或这次输入了新 Key）
  const canSave = !!provider && (keyAlreadySet || !!keyInput.trim())

  async function handleSave() {
    if (saving || !canSave) return
    setSaving(true)
    setSaveMsg(null)
    try {
      await api.ai.setConfig({
        provider,
        // 留空 → 后端保留原 Key；填了才替换
        api_key: keyInput.trim(),
        model: modelInput.trim(),
        custom_base_url: baseUrlInput.trim(),
      })
      await loadStatus()
      setSaveMsg('ok')
    } catch {
      setSaveMsg('err')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 3000)
    }
  }

  async function handleDisable() {
    if (saving) return
    setSaving(true)
    try {
      await api.ai.setConfig({ provider: '', api_key: '', model: '', custom_base_url: '' })
      setProvider('')
      setModelInput('')
      setBaseUrlInput('')
      setKeyInput('')
      await loadStatus()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        <div>
          <h1 className="text-xl font-semibold tracking-tight">设置</h1>
          <p className="text-xs text-muted-foreground mt-0.5">应用配置与 AI 功能</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
          {/* 标题 */}
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">AI 增强功能</h2>
              <p className="text-xs text-muted-foreground">接入任意 AI 模型，各项功能自动获得智能增强</p>
            </div>
          </div>

          {/* 当前状态 */}
          {status && (
            <div className={cn(
              'flex items-start gap-3 rounded-xl px-4 py-3',
              status.available
                ? 'bg-emerald-50 border border-emerald-200'
                : 'bg-secondary/60 border border-border'
            )}>
              {status.available
                ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                : <XCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              }
              <div className="space-y-0.5 min-w-0">
                <p className={cn('font-medium text-sm', status.available ? 'text-emerald-700' : 'text-foreground')}>
                  {status.available
                    ? `AI 已启用 · ${status.providers.find(p => p.id === status.provider)?.label ?? status.provider}`
                    : 'AI 未启用'
                  }
                </p>
                {status.available && status.model && (
                  <p className="text-xs text-emerald-600 font-mono truncate">{status.model}</p>
                )}
                {status.available
                  ? <p className="text-xs text-emerald-600/70">各项功能已自动启用 AI 增强</p>
                  : <p className="text-xs text-muted-foreground">启用后各项功能自动获得 AI 增强，未启用时使用内置规则</p>
                }
              </div>
              {status.available && (
                <button
                  onClick={handleDisable}
                  disabled={saving}
                  className="ml-auto shrink-0 text-[11px] text-muted-foreground hover:text-rose-500 transition-colors"
                >
                  禁用
                </button>
              )}
            </div>
          )}

          <div className="border-t border-border pt-5 space-y-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">接入配置</p>

            {/* Provider 下拉 */}
            {status && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Provider</label>
                <div className="relative">
                  <select
                    value={provider}
                    onChange={e => handleProviderChange(e.target.value)}
                    className="w-full h-9 rounded-xl border border-input bg-background px-3 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-ring/40"
                  >
                    <option value="">选择 Provider…</option>
                    {status.providers.map(p => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                </div>

              </div>
            )}

            {/* 自定义 base_url（openai_compat 时显示） */}
            {providerMeta?.needs_base_url && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Base URL</label>
                <input
                  type="text"
                  value={baseUrlInput}
                  onChange={e => setBaseUrlInput(e.target.value)}
                  placeholder="https://your-api-endpoint/v1"
                  className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
            )}

            {/* 模型名称（自由输入） */}
            {provider && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">模型名称</label>
                <input
                  type="text"
                  value={modelInput}
                  onChange={e => setModelInput(e.target.value)}
                  placeholder={providerMeta?.hint_model ?? '模型名称'}
                  className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                <p className="text-[11px] text-muted-foreground">
                  留空则使用默认（{providerMeta?.hint_model}）。直接填写模型 ID，支持该 provider 的所有模型。
                </p>
              </div>
            )}

            {/* API Key */}
            {provider && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  API Key
                  {status?.key_set && status.provider === provider && (
                    <span className="ml-1.5 text-emerald-500">● 已设置</span>
                  )}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    {keyAlreadySet && !editingKey ? (
                      // 已存 Key 且没在改 → 直接把掩码当文字显示（如 sk-2437****4d69），
                      // 一眼看到 Key 还在；点一下进入编辑态输新 Key（留空保存 = 保留原 Key）
                      <input
                        type="text"
                        readOnly
                        value={status?.key_mask ?? ''}
                        onFocus={() => setEditingKey(true)}
                        onMouseDown={() => setEditingKey(true)}
                        className="w-full h-9 rounded-xl border border-input bg-background px-3 pr-9 text-sm font-mono text-muted-foreground cursor-text focus:outline-none focus:ring-2 focus:ring-ring/40"
                      />
                    ) : (
                      <input
                        type={showKey ? 'text' : 'password'}
                        autoFocus={editingKey}
                        value={keyInput}
                        onChange={e => setKeyInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                        placeholder={providerMeta?.hint_key ?? 'API Key'}
                        className="w-full h-9 rounded-xl border border-input bg-background px-3 pr-9 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
                      />
                    )}
                    {/* 眼睛按钮只在编辑态有意义（掩码已是明文，无需切换） */}
                    {!(keyAlreadySet && !editingKey) && (
                      <button
                        type="button"
                        onClick={() => setShowKey(v => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={saving || !canSave}
                    className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 shrink-0"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '保存'}
                  </button>
                </div>

                {saveMsg === 'ok' && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> 已保存，AI 功能已启用
                  </p>
                )}
                {saveMsg === 'err' && (
                  <p className="text-xs text-rose-500">保存失败，请重试</p>
                )}

                <p className="text-[11px] text-muted-foreground">
                  Key 仅存储在本地 config.json，不上传。
                  {PROVIDER_LINKS[provider] && (
                    <a
                      href={PROVIDER_LINKS[provider]}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"
                    >
                      获取 Key <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
