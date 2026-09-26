/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Endpoint, PairingCode, User } from '../types/index.js';
import {
  Laptop,
  Bot,
  Copy,
  Check,
  Unlink,
  Link,
  Power,
  RefreshCw,
  AlertCircle,
  Trash2,
  X,
  UserX,
  ChevronDown,
  ChevronUp,
  Send,
  Sparkles,
  RotateCcw,
} from 'lucide-react';

interface InterfacesDrawerProps {
  currentUser: User;
  endpoints: Endpoint[];
  onGeneratePairingCode: () => Promise<PairingCode | null>;
  onTogglePresence: (endpointId: string, currentStatus: string) => Promise<void>;
  onUnlinkEndpoint: (endpointId: string) => Promise<void>;
  onRefresh: () => void;
  onDeleteUser?: (userId: string) => Promise<void>;
  onRestoreWebEndpoint?: () => Promise<void>;
}

export const InterfacesDrawer: React.FC<InterfacesDrawerProps> = ({
  currentUser,
  endpoints,
  onGeneratePairingCode,
  onTogglePresence,
  onUnlinkEndpoint,
  onRefresh,
  onDeleteUser,
  onRestoreWebEndpoint,
}) => {
  const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDeleteIdentity, setConfirmDeleteIdentity] = useState(false);
  const [deletingIdentity, setDeletingIdentity] = useState(false);
  const [restoringWeb, setRestoringWeb] = useState(false);

  const handleCreateCode = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setLoadingCode(true);
    try {
      const code = await onGeneratePairingCode();
      setPairingCode(code);
    } finally {
      setLoadingCode(false);
    }
  };

  const copyToClipboard = (text: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRestoreWeb = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!onRestoreWebEndpoint) return;
    setRestoringWeb(true);
    try {
      await onRestoreWebEndpoint();
    } finally {
      setRestoringWeb(false);
    }
  };

  // Filter out any mock/fictitious or pending endpoints
  const validEndpoints = endpoints.filter(
    (ep) =>
      ep.user_id !== 'pending_pairing' &&
      ep.external_id !== '222222' &&
      ep.external_id !== '111111' &&
      ep.external_id !== '998877'
  );

  // Check Web endpoints status
  const webEndpoints = validEndpoints.filter((ep) => ep.type === 'web');
  const hasOfflineWeb = webEndpoints.some((ep) => ep.status !== 'online');
  const hasNoWeb = webEndpoints.length === 0;

  return (
    <div className="w-88 bg-slate-900 border-l border-slate-800 flex flex-col h-full overflow-y-auto">
      {/* Drawer Header */}
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Connected Interfaces
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Эндпоинты для <span className="text-slate-300 font-medium">{currentUser.display_name}</span>
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
          title="Обновить интерфейсы (Refresh)"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Web Interface Disconnected / Offline Recovery Callout */}
      {(hasOfflineWeb || hasNoWeb) && (
        <div className="p-3 bg-amber-950/40 border-b border-amber-600/40 space-y-2 shrink-0">
          <div className="flex items-center gap-2 text-amber-300 font-medium text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              {hasNoWeb
                ? 'Веб-интерфейс не привязан'
                : 'Веб-интерфейс offline'}
            </span>
          </div>
          <p className="text-[11px] text-amber-200/80 leading-relaxed">
            {hasNoWeb
              ? 'Веб-эндпоинт был отвязан. Нажмите кнопку для подключения веб-интерфейса:'
              : 'Интерфейс временно отключен. Новые сообщения сохраняются в очереди Core.'}
          </p>
          <button
            onClick={
              hasNoWeb
                ? handleRestoreWeb
                : async () => {
                    const offlineEp = webEndpoints.find((ep) => ep.status !== 'online');
                    if (offlineEp) {
                      await onTogglePresence(offlineEp.id, offlineEp.status);
                    }
                  }
            }
            disabled={restoringWeb}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs rounded transition-colors shadow"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>
              {restoringWeb
                ? 'Восстановление...'
                : hasNoWeb
                ? 'Восстановить веб-интерфейс'
                : 'Восстановить соединение веб-интерфейса'}
            </span>
          </button>
        </div>
      )}

      {/* Telegram Connection Bar */}
      <div className="p-3 border-b border-slate-800 bg-slate-950/70 shrink-0">
        <div className="rounded-xl border border-sky-500/40 bg-sky-950/20 p-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400 shrink-0">
              <Send className="w-3.5 h-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-sky-200">
                Подключение Telegram
              </h4>
              <p className="text-[10px] text-sky-300/70">
                Сгенерировать код сопряжения
              </p>
            </div>
          </div>

          <button
            onClick={handleCreateCode}
            disabled={loadingCode}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-lg transition-colors shadow"
          >
            <Link className="w-3.5 h-3.5" />
            <span>{loadingCode ? 'Генерация...' : 'Получить код'}</span>
          </button>
        </div>

        {/* Pairing Code Card when active */}
        {pairingCode && (
          <div className="mt-2.5 p-3 bg-slate-900 border border-emerald-500/60 rounded-xl space-y-2.5 shadow-lg animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] text-emerald-300 font-mono font-semibold uppercase tracking-wider">
                  Код сопряжения:
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-emerald-400 font-mono">60 мин</span>
                <button
                  onClick={() => setPairingCode(null)}
                  className="p-0.5 text-slate-400 hover:text-slate-200 rounded transition-colors"
                  title="Закрыть"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-emerald-800/40">
              <code className="text-base font-mono font-bold text-emerald-300 tracking-wider">
                {pairingCode.code}
              </code>
              <button
                onClick={(e) => copyToClipboard(pairingCode.code, e)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded flex items-center gap-1.5 transition-colors"
                title="Копировать код"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 text-[11px]">Скопировано</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Копировать</span>
                  </>
                )}
              </button>
            </div>

            {/* 1-Click Connection Links */}
            <div className="space-y-1.5 pt-0.5">
              <div className="text-[10px] text-slate-400">
                Нажмите для перехода в бот с кодом:
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <a
                  href={`https://t.me/Botchat1B_bot?start=${pairingCode.code}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-semibold rounded-lg flex items-center justify-between transition-colors shadow"
                >
                  <div className="flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5" />
                    <span>@Botchat1B_bot (Основной)</span>
                  </div>
                  <span className="text-xs">Открыть ↗</span>
                </a>
                <a
                  href={`https://t.me/Botchat1A_bot?start=${pairingCode.code}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg flex items-center justify-between transition-colors"
                >
                  <span>@Botchat1A_bot (Второй)</span>
                  <span className="text-xs">Открыть ↗</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Endpoints List */}
      <div className="flex-1 p-3.5 space-y-3 overflow-y-auto">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-wider text-[11px]">
            Active Endpoints ({validEndpoints.length})
          </span>
          {hasNoWeb && onRestoreWebEndpoint && (
            <button
              onClick={handleRestoreWeb}
              disabled={restoringWeb}
              className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>+ Веб-интерфейс</span>
            </button>
          )}
        </div>

        {validEndpoints.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-xs space-y-2">
            <div>No endpoints connected to this identity.</div>
            {onRestoreWebEndpoint && (
              <button
                onClick={handleRestoreWeb}
                disabled={restoringWeb}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-medium text-xs rounded transition-colors"
              >
                + Подключить веб-интерфейс
              </button>
            )}
          </div>
        ) : (
          validEndpoints.map((ep) => {
            const isOnline = ep.status === 'online';
            const isWeb = ep.type === 'web';

            return (
              <div
                key={ep.id}
                className={`p-3 rounded-lg border space-y-2 transition-colors ${
                  isOnline
                    ? 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    : 'bg-amber-950/20 border-amber-800/40 hover:border-amber-700/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isWeb ? (
                      <Laptop
                        className={`w-4 h-4 shrink-0 ${
                          isOnline ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      />
                    ) : (
                      <Bot className="w-4 h-4 text-sky-400 shrink-0" />
                    )}
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-xs font-medium text-slate-200">{ep.display_name}</h4>
                        {ep.metadata?.bot_id === 'bot_b' && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-950 border border-sky-600/50 text-sky-300">
                            @Botchat1B_bot
                          </span>
                        )}
                        {ep.metadata?.bot_id === 'bot_a' && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                            @Botchat1A_bot
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {ep.type.toUpperCase()} · ID: {ep.external_id}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      isOnline
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                        : 'bg-amber-950 text-amber-400 border border-amber-800/40'
                    }`}
                  >
                    {isOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>

                {/* Capabilities list */}
                <div className="text-[10px] text-slate-500 font-mono">
                  <span>Caps: {ep.capabilities.join(', ')}</span>
                </div>

                {/* Actions: Presence Toggle (Disconnect / Connect) & Unlink */}
                <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-xs">
                  <button
                    onClick={() => onTogglePresence(ep.id, ep.status)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                      isOnline
                        ? 'hover:bg-amber-950/60 text-amber-400 border border-amber-900/40'
                        : 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/50 shadow-sm'
                    }`}
                    title={
                      isOnline
                        ? 'Перевести интерфейс в offline'
                        : 'Перевести интерфейс в online'
                    }
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>
                      {isOnline
                        ? 'Отключить'
                        : 'Включить'}
                    </span>
                  </button>

                  <button
                    onClick={() => onUnlinkEndpoint(ep.id)}
                    className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-400 transition-colors p-1"
                    title="Отвязать эндпоинт"
                  >
                    <Unlink className="w-3 h-3" />
                    <span>Отвязать</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer info */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/80 text-[10px] text-slate-500 space-y-1 shrink-0">
        <p className="font-mono text-slate-400">Core Axiom:</p>
        <p>Presence belongs to the endpoint, not the person. If Web goes offline, messages remain pending in Core.</p>
      </div>
    </div>
  );
};
