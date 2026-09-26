/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Conversation, Message, Delivery, User } from '../types/index.js';
import {
  Send,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Radio,
  Trash2,
  Check,
  X,
} from 'lucide-react';

interface ChatAreaProps {
  conversation: Conversation | null;
  messages: Array<Message & { deliveries?: Delivery[] }>;
  currentUserId: string;
  allUsers: User[];
  onSendMessage: (text: string) => Promise<void>;
  onDeleteConversation?: (conversationId: string) => Promise<void>;
  loading: boolean;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  conversation,
  messages,
  currentUserId,
  allUsers,
  onSendMessage,
  onDeleteConversation,
  loading,
}) => {
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendBtnRef = useRef<HTMLButtonElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setConfirmDelete(false);
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = 'auto';
    }
    if (sendBtnRef.current) {
      sendBtnRef.current.disabled = true;
    }
  }, [conversation?.conversation_id]);

  useEffect(() => {
    if (sendBtnRef.current) {
      const hasText = (textareaRef.current?.value.trim().length ?? 0) > 0;
      sendBtnRef.current.disabled = !hasText || sending || loading;
    }
  }, [sending, loading]);

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;

    if (sendBtnRef.current) {
      const hasText = el.value.trim().length > 0;
      sendBtnRef.current.disabled = !hasText || sending || loading;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const el = textareaRef.current;
    if (!el || sending || loading) return;
    const text = el.value.trim();
    if (!text) return;

    setSending(true);
    try {
      await onSendMessage(text);
      el.value = '';
      el.style.height = 'auto';
      if (sendBtnRef.current) {
        sendBtnRef.current.disabled = true;
      }
      el.focus();
    } finally {
      setSending(false);
    }
  };

  const handleDeleteCurrentChat = async () => {
    if (!conversation || !onDeleteConversation) return;
    setDeleting(true);
    try {
      await onDeleteConversation(conversation.conversation_id);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const getUserName = (userId: string) => {
    const user = allUsers.find((u) => u.user_id === userId);
    return user?.display_name || userId;
  };

  if (!conversation) {
    return (
      <div className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-500">
        <Radio className="w-10 h-10 text-slate-700 mb-3 animate-pulse" />
        <h3 className="text-sm font-medium text-slate-300">No Conversation Selected</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Select an existing conversation from the left sidebar or start a new direct communication channel.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-950 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-slate-200">{conversation.title}</h2>
          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
            <span>Core Conv ID: {conversation.conversation_id}</span>
            <span>·</span>
            <span>Type: {conversation.type}</span>
          </div>
        </div>

        {/* Delete Conversation Action */}
        {onDeleteConversation && (
          <div>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                title="Удалить этот чат с собеседником"
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-900/60 rounded transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Удалить чат</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-rose-950/90 border border-rose-600/70 px-2.5 py-1 rounded">
                <span className="text-[11px] text-rose-200 font-medium hidden md:inline">
                  Удалить этот чат?
                </span>
                <button
                  onClick={handleDeleteCurrentChat}
                  disabled={deleting}
                  className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white font-medium text-[11px] rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  <Check className="w-3 h-3" />
                  <span>{deleting ? 'Удаление...' : 'Да, удалить'}</span>
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="p-1 hover:bg-slate-800 text-slate-300 rounded"
                  title="Отмена"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Message Feed */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 text-xs">
            <span>No messages in this channel yet.</span>
            <span className="text-[11px] text-slate-700 mt-1">
              Send a message below or via connected Telegram bot.
            </span>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_user_id === currentUserId;
            const originEndpoint = msg.metadata?.origin_bot_id
              ? `via ${String(msg.metadata.origin_bot_id).toUpperCase()}`
              : (msg.metadata?.origin as string) || 'Web';

            return (
              <div
                key={msg.message_id}
                className={`flex flex-col max-w-[80%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}
              >
                {/* Sender & timestamp header */}
                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mb-1">
                  <span className={isMe ? 'text-emerald-400 font-medium' : 'text-slate-300 font-medium'}>
                    {isMe ? 'You (Вы)' : getUserName(msg.sender_user_id)}
                  </span>
                  <span>·</span>
                  <span className="text-slate-500">{originEndpoint}</span>
                  <span>·</span>
                  <span className="text-slate-500">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>

                {/* Message Body */}
                <div
                  className={`px-3.5 py-2.5 rounded text-xs leading-relaxed ${
                    isMe
                      ? 'bg-emerald-950/70 border border-emerald-700/50 text-emerald-100'
                      : 'bg-slate-900 border border-slate-800 text-slate-200'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words select-text font-sans">
                    {msg.text}
                  </p>
                </div>

                {/* Deliveries breakdown */}
                {msg.deliveries && msg.deliveries.length > 0 && (
                  <div className="mt-1 flex flex-col gap-0.5 text-[10px] font-mono">
                    {msg.deliveries.map((delv) => {
                      let statusBadge = null;
                      if (delv.status === 'delivered') {
                        statusBadge = (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>Delivered to {delv.endpoint_id}</span>
                          </span>
                        );
                      } else if (delv.status === 'pending') {
                        statusBadge = (
                          <span className="text-amber-400 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            <span>Pending (interface offline: {delv.endpoint_id})</span>
                          </span>
                        );
                      } else {
                        statusBadge = (
                          <span className="text-rose-400 flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>Failed: {delv.error || 'Delivery failed'}</span>
                          </span>
                        );
                      }

                      return (
                        <div key={delv.delivery_id} className="flex items-center gap-1.5 text-slate-500">
                          {statusBadge}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="p-3 bg-slate-900 border-t border-slate-800 flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          dir="ltr"
          lang="ru"
          autoComplete="off"
          autoCorrect="on"
          autoCapitalize="sentences"
          spellCheck={true}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={`Написать сообщение как ${getUserName(currentUserId)}...`}
          disabled={loading || sending}
          className="flex-1 bg-slate-950 border border-slate-800 text-xs px-3 py-2.5 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans resize-none overflow-y-auto min-h-[38px] max-h-[120px] leading-relaxed"
        />
        <button
          ref={sendBtnRef}
          type="submit"
          disabled={true}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-slate-950 font-medium text-xs rounded flex items-center gap-1.5 transition-colors shrink-0 mb-[1px]"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Отправить</span>
        </button>
      </form>
    </div>
  );
};
