/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { SystemDiagnostics, SystemEvent } from '../types/index.js';
import {
  Activity,
  Bot,
  RefreshCw,
  Send,
  Terminal,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Server,
  Layers,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';

interface DiagnosticsViewProps {
  diagnostics: SystemDiagnostics | null;
  onRefresh: () => void;
  onSetupWebhook: (botId: 'bot_a' | 'bot_b') => Promise<unknown>;
  loading: boolean;
}

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({
  diagnostics,
  onRefresh,
  onSetupWebhook,
  loading,
}) => {
  const [settingUpWebhook, setSettingUpWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<string | null>(null);
  const [copiedAppUrl, setCopiedAppUrl] = useState(false);

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedAppUrl(true);
    setTimeout(() => setCopiedAppUrl(false), 2000);
  };

  const handleSetupWebhook = async (botId: 'bot_a' | 'bot_b') => {
    setSettingUpWebhook(true);
    setWebhookResult(null);
    try {
      const res = await onSetupWebhook(botId);
      setWebhookResult(JSON.stringify(res, null, 2));
      onRefresh();
    } catch (err: unknown) {
      setWebhookResult(`Setup error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSettingUpWebhook(false);
    }
  };

  if (!diagnostics) {
    return (
      <div className="flex-1 bg-slate-950 p-6 flex items-center justify-center text-slate-500 text-xs">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading system diagnostics...
      </div>
    );
  }

  const { telegram_bots } = diagnostics;

  return (
    <div className="flex-1 bg-slate-950 p-6 overflow-y-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-slate-100">System Diagnostics & Integration Status</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time health, multi-bot adapter state, and live audit telemetry (No tokens exposed).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-3 rounded">
          <span className="text-[10px] text-slate-500 font-mono uppercase">Status</span>
          <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-emerald-400">
            <Server className="w-3.5 h-3.5" />
            <span>{diagnostics.status.toUpperCase()}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3 rounded">
          <span className="text-[10px] text-slate-500 font-mono uppercase">Identities</span>
          <div className="mt-1 text-sm font-semibold text-slate-200">{diagnostics.active_users}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3 rounded">
          <span className="text-[10px] text-slate-500 font-mono uppercase">Endpoints</span>
          <div className="mt-1 text-sm font-semibold text-slate-200">
            {diagnostics.online_endpoints} <span className="text-slate-500 text-xs font-normal">/ {diagnostics.total_endpoints}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3 rounded">
          <span className="text-[10px] text-slate-500 font-mono uppercase">Messages</span>
          <div className="mt-1 text-sm font-semibold text-slate-200">{diagnostics.total_messages}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3 rounded">
          <span className="text-[10px] text-slate-500 font-mono uppercase">Deliveries</span>
          <div className="mt-1 text-sm font-semibold text-slate-200">{diagnostics.total_deliveries}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3 rounded">
          <span className="text-[10px] text-slate-500 font-mono uppercase">Pending</span>
          <div className="mt-1 text-sm font-semibold text-amber-400">{diagnostics.pending_deliveries}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3 rounded">
          <span className="text-[10px] text-slate-500 font-mono uppercase">Failed</span>
          <div className="mt-1 text-sm font-semibold text-rose-400">{diagnostics.failed_deliveries}</div>
        </div>
      </div>

      {/* Telegram Bots Status (Bot A and Bot B) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bot A */}
        <div className="bg-slate-900 border border-slate-800 rounded p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-slate-200">Telegram Bot A</h3>
            </div>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                telegram_bots.bot_a.configured
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                  : 'bg-amber-950 text-amber-400 border border-amber-800/40'
              }`}
            >
              {telegram_bots.bot_a.configured ? 'TOKEN CONFIGURED' : 'TOKEN NOT SET'}
            </span>
          </div>

          <div className="text-xs space-y-1.5 font-mono text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-500">Env Secret:</span>
              <span>TELEGRAM_BOT_A_TOKEN</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Username:</span>
              <span className="text-emerald-400">{telegram_bots.bot_a.username ? `@${telegram_bots.bot_a.username}` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Webhook Registered:</span>
              <span>{telegram_bots.bot_a.webhook?.url ? 'Yes' : 'No'}</span>
            </div>
            {telegram_bots.bot_a.webhook?.url && (
              <div className="text-[11px] text-slate-400 break-all bg-slate-950 p-2 rounded border border-slate-800">
                {telegram_bots.bot_a.webhook.url}
              </div>
            )}
            {telegram_bots.bot_a.error && (
              <div className="text-[11px] text-rose-400 bg-rose-950/40 p-2 rounded border border-rose-900/40">
                {telegram_bots.bot_a.error}
              </div>
            )}
          </div>

          <button
            onClick={() => handleSetupWebhook('bot_a')}
            disabled={settingUpWebhook}
            className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 transition-colors"
          >
            Register / Update Webhook for Bot A
          </button>
        </div>

        {/* Bot B */}
        <div className="bg-slate-900 border border-slate-800 rounded p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-slate-200">Telegram Bot B</h3>
            </div>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                telegram_bots.bot_b.configured
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                  : 'bg-amber-950 text-amber-400 border border-amber-800/40'
              }`}
            >
              {telegram_bots.bot_b.configured ? 'TOKEN CONFIGURED' : 'TOKEN NOT SET'}
            </span>
          </div>

          <div className="text-xs space-y-1.5 font-mono text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-500">Env Secret:</span>
              <span>TELEGRAM_BOT_B_TOKEN</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Username:</span>
              <span className="text-emerald-400">{telegram_bots.bot_b.username ? `@${telegram_bots.bot_b.username}` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Webhook Registered:</span>
              <span>{telegram_bots.bot_b.webhook?.url ? 'Yes' : 'No'}</span>
            </div>
            {telegram_bots.bot_b.webhook?.url && (
              <div className="text-[11px] text-slate-400 break-all bg-slate-950 p-2 rounded border border-slate-800">
                {telegram_bots.bot_b.webhook.url}
              </div>
            )}
            {telegram_bots.bot_b.error && (
              <div className="text-[11px] text-rose-400 bg-rose-950/40 p-2 rounded border border-rose-900/40">
                {telegram_bots.bot_b.error}
              </div>
            )}
          </div>

          <button
            onClick={() => handleSetupWebhook('bot_b')}
            disabled={settingUpWebhook}
            className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 transition-colors"
          >
            Register / Update Webhook for Bot B
          </button>
        </div>
      </div>

      {webhookResult && (
        <div className="p-3 bg-slate-900 border border-slate-800 rounded">
          <span className="text-xs font-mono text-slate-400">Webhook Registration Result:</span>
          <pre className="text-xs font-mono text-emerald-400 mt-1 whitespace-pre-wrap">{webhookResult}</pre>
        </div>
      )}

      {/* Live Event Log */}
      <div className="bg-slate-900 border border-slate-800 rounded p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-200">System Technical Event Log (Audit Trail)</h3>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {diagnostics.recent_events.length} Recent Events
          </span>
        </div>

        <div className="space-y-1.5 max-h-72 overflow-y-auto font-mono text-[11px]">
          {diagnostics.recent_events.length === 0 ? (
            <div className="text-center py-4 text-slate-600">No events recorded yet.</div>
          ) : (
            diagnostics.recent_events.map((evt) => {
              let badgeColor = 'text-slate-400 bg-slate-800';
              if (evt.type.includes('SUCCESS') || evt.type.includes('CONNECTED')) {
                badgeColor = 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40';
              } else if (evt.type.includes('FAILED') || evt.type.includes('VIOLATION')) {
                badgeColor = 'text-rose-400 bg-rose-950/60 border border-rose-800/40';
              } else if (evt.type.includes('STARTED') || evt.type.includes('PAIRING')) {
                badgeColor = 'text-sky-400 bg-sky-950/60 border border-sky-800/40';
              }

              return (
                <div
                  key={evt.id}
                  className="p-2 bg-slate-950 border border-slate-800/80 rounded flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-2 overflow-hidden">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] shrink-0 ${badgeColor}`}>
                      {evt.type}
                    </span>
                    <span className="text-slate-300 truncate">
                      {JSON.stringify(evt.details)}
                    </span>
                  </div>
                  <span className="text-slate-500 text-[10px] shrink-0">
                    {new Date(evt.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
