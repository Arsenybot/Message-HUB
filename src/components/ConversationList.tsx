/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Conversation, User } from '../types/index.js';
import { MessageSquare, Plus, UserPlus, Trash2, X, Check } from 'lucide-react';

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  allUsers: User[];
  currentUserId: string;
  onStartDirectConversation: (targetUserId: string) => void;
  onDeleteConversation?: (conversationId: string) => Promise<void>;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  allUsers,
  currentUserId,
  onStartDirectConversation,
  onDeleteConversation,
}) => {
  const [showNewDirect, setShowNewDirect] = useState(false);
  const [confirmDeleteConvId, setConfirmDeleteConvId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const availablePartners = allUsers.filter((u) => u.user_id !== currentUserId);

  const handleDelete = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    if (!onDeleteConversation) return;
    setDeletingId(convId);
    try {
      await onDeleteConversation(convId);
      setConfirmDeleteConvId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col h-full shrink-0">
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Conversations
          </h2>
        </div>
        <button
          onClick={() => setShowNewDirect(!showNewDirect)}
          title="Start Conversation / Начать чат"
          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {showNewDirect && (
        <div className="p-3 bg-slate-950 border-b border-slate-800 space-y-2">
          <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
            <span>Select Hub Identity to message:</span>
          </div>
          {availablePartners.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              No other identities exist yet. Create one in the top bar!
            </p>
          ) : (
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {availablePartners.map((partner) => (
                <button
                  key={partner.user_id}
                  onClick={() => {
                    onStartDirectConversation(partner.user_id);
                    setShowNewDirect(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-xs bg-slate-900 hover:bg-slate-800 text-slate-200 rounded border border-slate-800 flex items-center justify-between group transition-colors"
                >
                  <span className="truncate">{partner.display_name}</span>
                  <span className="text-[10px] text-slate-500 font-mono group-hover:text-emerald-400">
                    Connect →
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-slate-500 text-xs">
            No active conversations.
            <div className="mt-2 text-[11px] text-slate-600">
              Click <span className="text-emerald-400">+</span> above to initiate one.
            </div>
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = activeConversationId === conv.conversation_id;
            const isConfirming = confirmDeleteConvId === conv.conversation_id;
            const isDeleting = deletingId === conv.conversation_id;

            return (
              <div
                key={conv.conversation_id}
                onClick={() => onSelectConversation(conv.conversation_id)}
                className={`group relative w-full text-left p-3 transition-colors cursor-pointer flex flex-col gap-1 ${
                  isActive
                    ? 'bg-slate-800/80 border-l-2 border-emerald-500 text-slate-100'
                    : 'hover:bg-slate-800/40 text-slate-300'
                }`}
              >
                {/* Header line: Title & Time / Delete Confirmation */}
                {isConfirming ? (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 bg-rose-950/90 border border-rose-600/70 rounded text-xs flex flex-col gap-1.5"
                  >
                    <div className="text-[11px] text-rose-200 font-medium">
                      Удалить этот чат?
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => handleDelete(e, conv.conversation_id)}
                        disabled={isDeleting}
                        className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-medium rounded flex items-center gap-1 disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" />
                        <span>{isDeleting ? 'Удаление...' : 'Да, удалить'}</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteConvId(null);
                        }}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-medium truncate flex-1">
                        {conv.title || 'Direct Conversation'}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(conv.updated_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {onDeleteConversation && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteConvId(conv.conversation_id);
                            }}
                            title="Удалить чат (больше не общаться)"
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 rounded transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                      <span>ID: {conv.conversation_id.split('_').slice(-1)[0]}</span>
                      <span>·</span>
                      <span className="capitalize">{conv.type}</span>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
