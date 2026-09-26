/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User } from '../types/index.js';
import { Users, Plus, Check, Trash2, X } from 'lucide-react';

interface IdentityBarProps {
  currentUser: User | null;
  allUsers: User[];
  onSelectUser: (user: User) => void;
  onCreateUser: (displayName: string) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
}

export const IdentityBar: React.FC<IdentityBarProps> = ({
  currentUser,
  allUsers,
  onSelectUser,
  onCreateUser,
  onDeleteUser,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim()) return;
    setSubmitting(true);
    try {
      await onCreateUser(newUserName.trim());
      setNewUserName('');
      setIsCreating(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (userId: string) => {
    setDeletingId(userId);
    try {
      await onDeleteUser(userId);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-slate-400 text-xs font-mono tracking-wide uppercase">
          <Users className="w-3.5 h-3.5 text-emerald-400" />
          <span>Active Identity:</span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {allUsers.map((user) => {
            const isSelected = currentUser?.user_id === user.user_id;
            const isConfirming = confirmDeleteId === user.user_id;

            if (isConfirming) {
              return (
                <div
                  key={user.user_id}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-rose-950/80 border border-rose-600/70 rounded text-rose-200 animate-in fade-in duration-150"
                >
                  <span className="text-[11px] font-medium">Удалить {user.display_name}?</span>
                  <button
                    type="button"
                    onClick={() => handleDelete(user.user_id)}
                    disabled={deletingId === user.user_id}
                    className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-medium text-[11px] rounded transition-colors"
                  >
                    {deletingId === user.user_id ? '...' : 'Да'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    disabled={deletingId === user.user_id}
                    className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            }

            return (
              <div
                key={user.user_id}
                className={`group flex items-center gap-1 pl-2.5 pr-1.5 py-1 text-xs transition-colors rounded ${
                  isSelected
                    ? 'bg-emerald-950/80 border border-emerald-600/50 text-emerald-200 font-medium'
                    : 'bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectUser(user)}
                  className="flex items-center gap-1.5 focus:outline-none"
                >
                  {isSelected && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
                  <span>{user.display_name}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {user.user_id.split('_').slice(-1)[0]}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteId(user.user_id);
                  }}
                  title="Удалить эту идентичность"
                  className="p-1 ml-0.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          {!isCreating ? (
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-dashed border-slate-700 rounded transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>New Identity</span>
            </button>
          ) : (
            <form onSubmit={handleCreate} className="flex items-center gap-1.5">
              <input
                type="text"
                autoFocus
                placeholder="Identity name..."
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                className="bg-slate-950 border border-emerald-600/60 text-xs px-2.5 py-1 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
              />
              <button
                type="submit"
                disabled={submitting || !newUserName.trim()}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-medium text-xs rounded transition-colors"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setNewUserName('');
                }}
                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
        <span className="text-slate-500">Identity ID:</span>
        <span className="text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
          {currentUser?.user_id || 'None'}
        </span>
      </div>
    </div>
  );
};
