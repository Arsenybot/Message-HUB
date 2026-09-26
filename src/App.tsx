/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, Conversation, Message, Delivery, Endpoint, SystemDiagnostics, PairingCode } from './types/index.js';
import { IdentityBar } from './components/IdentityBar.js';
import { ConversationList } from './components/ConversationList.js';
import { ChatArea } from './components/ChatArea.js';
import { InterfacesDrawer } from './components/InterfacesDrawer.js';
import { DiagnosticsView } from './components/DiagnosticsView.js';
import {
  Radio,
  MessageSquare,
  Activity,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Loader2,
  WifiOff,
} from 'lucide-react';

const SAVED_USER_KEY = 'message_hub_active_user_id';

export default function App() {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<Message & { deliveries?: Delivery[] }>>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'diagnostics'>('chat');
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');

  const sseRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManuallyDisconnectedRef = useRef(false);

  // Safe fetch helper that guarantees JSON or returns null without throwing on HTML
  const fetchJson = useCallback(async function <T>(
    url: string,
    options?: RequestInit
  ): Promise<T | null> {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        console.warn(`[HTTP ${res.status}] ${url}`);
        return null;
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.warn(`[Non-JSON Response ${contentType}] ${url}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      console.warn(`[Fetch Error] ${url}:`, err);
      return null;
    }
  }, []);

  // Load all users
  const loadUsers = useCallback(async () => {
    const data = await fetchJson<{ users: User[] }>('/api/users');
    if (data?.users) {
      setAllUsers(data.users);
      setCurrentUser((prev) => {
        const savedId = localStorage.getItem(SAVED_USER_KEY);
        if (savedId && data.users.some((u) => u.user_id === savedId)) {
          return data.users.find((u) => u.user_id === savedId) || data.users[0];
        }
        if (!prev && data.users.length > 0) {
          // Prefer user Arseniy if exists
          const arseniy = data.users.find((u) => u.display_name.includes('Арсений'));
          return arseniy || data.users[0];
        }
        if (prev && data.users.some((u) => u.user_id === prev.user_id)) {
          return data.users.find((u) => u.user_id === prev.user_id) || prev;
        }
        return data.users[0] || null;
      });
    }
  }, [fetchJson]);

  // Load endpoints for current user
  const loadEndpoints = useCallback(async () => {
    if (!currentUser) return;
    const data = await fetchJson<{ endpoints: Endpoint[] }>('/api/endpoints', {
      headers: { 'x-user-id': currentUser.user_id },
    });
    if (data?.endpoints) {
      setEndpoints(data.endpoints);
    }
  }, [currentUser, fetchJson]);

  // Load conversations for current user
  const loadConversations = useCallback(async () => {
    if (!currentUser) return;
    const data = await fetchJson<{ conversations: Conversation[] }>('/api/conversations', {
      headers: { 'x-user-id': currentUser.user_id },
    });
    if (data?.conversations) {
      setConversations(data.conversations);
      setActiveConversationId((prev) => {
        if (!prev && data.conversations.length > 0) {
          return data.conversations[0].conversation_id;
        }
        if (prev && !data.conversations.some((c) => c.conversation_id === prev)) {
          return data.conversations.length > 0 ? data.conversations[0].conversation_id : null;
        }
        return prev;
      });
    }
  }, [currentUser, fetchJson]);

  // Load messages for active conversation
  const loadMessages = useCallback(async () => {
    if (!currentUser || !activeConversationId) return;
    const data = await fetchJson<{ messages: Array<Message & { deliveries?: Delivery[] }> }>(
      `/api/conversations/${activeConversationId}/messages`,
      {
        headers: { 'x-user-id': currentUser.user_id },
      }
    );
    if (data?.messages) {
      setMessages(data.messages);
    }
  }, [currentUser, activeConversationId, fetchJson]);

  // Load diagnostics
  const loadDiagnostics = useCallback(async () => {
    const data = await fetchJson<SystemDiagnostics>('/api/diagnostics');
    if (data) {
      setDiagnostics(data);
    }
  }, [fetchJson]);

  // Initial load
  useEffect(() => {
    loadUsers();
    loadDiagnostics();
  }, [loadUsers, loadDiagnostics]);

  useEffect(() => {
    if (currentUser) {
      loadEndpoints();
      loadConversations();
    }
  }, [currentUser, loadEndpoints, loadConversations]);

  useEffect(() => {
    if (activeConversationId) {
      loadMessages();
    } else {
      setMessages([]);
    }
  }, [activeConversationId, loadMessages]);

  // Stable SSE Connection (does not teardown on state changes)
  const refreshRef = useRef({
    loadUsers,
    loadMessages,
    loadConversations,
    loadEndpoints,
    loadDiagnostics,
  });

  useEffect(() => {
    refreshRef.current = {
      loadUsers,
      loadMessages,
      loadConversations,
      loadEndpoints,
      loadDiagnostics,
    };
  });

  const connectSSE = useCallback(() => {
    if (sseRef.current) {
      try {
        sseRef.current.close();
      } catch {}
      sseRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setConnectionStatus('connecting');

    try {
      const sse = new EventSource('/api/events/stream');
      sseRef.current = sse;

      sse.onopen = () => {
        setConnectionStatus('connected');
      };

      sse.addEventListener('message', () => {
        setConnectionStatus('connected');
        refreshRef.current.loadUsers();
        refreshRef.current.loadMessages();
        refreshRef.current.loadConversations();
        refreshRef.current.loadEndpoints();
        refreshRef.current.loadDiagnostics();
      });

      sse.addEventListener('ping', () => {
        setConnectionStatus('connected');
      });

      sse.onerror = () => {
        if (sseRef.current) {
          try {
            sseRef.current.close();
          } catch {}
          sseRef.current = null;
        }
        setConnectionStatus('disconnected');
        // Telegram-style automatic retry in background only if not manually disconnected
        if (!isManuallyDisconnectedRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connectSSE();
          }, 4000);
        }
      };
    } catch {
      setConnectionStatus('disconnected');
    }
  }, []);

  useEffect(() => {
    connectSSE();

    return () => {
      if (sseRef.current) {
        try {
          sseRef.current.close();
        } catch {}
        sseRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connectSSE]);

  // Manual disconnect handler (to simulate disconnect / drop connection)
  const handleManualDisconnect = useCallback(() => {
    isManuallyDisconnectedRef.current = true;
    if (sseRef.current) {
      try {
        sseRef.current.close();
      } catch {}
      sseRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setConnectionStatus('disconnected');
  }, []);

  // Manual reconnect handler (like Telegram's Reconnect button)
  const handleManualReconnect = useCallback(async () => {
    isManuallyDisconnectedRef.current = false;
    connectSSE();

    // If currentUser has any web endpoint that was turned offline, restore it online automatically!
    if (currentUser) {
      const epData = await fetchJson<{ endpoints: Endpoint[] }>('/api/endpoints', {
        headers: { 'x-user-id': currentUser.user_id },
      });
      if (epData?.endpoints) {
        const offlineWeb = epData.endpoints.find((e) => e.type === 'web' && e.status !== 'online');
        if (offlineWeb) {
          await fetch(`/api/endpoints/${offlineWeb.id}/presence`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': currentUser.user_id,
            },
            body: JSON.stringify({ status: 'online' }),
          });
        }
      }
    }

    await Promise.allSettled([
      loadUsers(),
      loadDiagnostics(),
      currentUser ? loadEndpoints() : Promise.resolve(),
      currentUser ? loadConversations() : Promise.resolve(),
      activeConversationId ? loadMessages() : Promise.resolve(),
    ]);
  }, [connectSSE, currentUser, fetchJson, loadUsers, loadDiagnostics, loadEndpoints, loadConversations, activeConversationId, loadMessages]);

  // Handlers
  const handleSelectUser = (user: User) => {
    localStorage.setItem(SAVED_USER_KEY, user.user_id);
    setCurrentUser(user);
    setActiveConversationId(null);
  };

  const handleCreateUser = async (displayName: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName }),
      });
      const data = await res.json();
      if (data.user) {
        await loadUsers();
        setCurrentUser(data.user);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await fetchJson<{ users: User[] }>('/api/users');
        if (data?.users) {
          setAllUsers(data.users);
          if (currentUser?.user_id === userId) {
            const nextUser = data.users.find((u) => u.user_id !== userId) || null;
            setCurrentUser(nextUser);
            setActiveConversationId(null);
          }
        }
        await loadDiagnostics();
      }
    } catch (err) {
      console.error('Failed to delete user:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartDirectConversation = async (targetUserId: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.user_id,
        },
        body: JSON.stringify({ recipient_user_id: targetUserId }),
      });
      const data = await res.json();
      if (data.conversation) {
        await loadConversations();
        setActiveConversationId(data.conversation.conversation_id);
      }
    } catch (err) {
      console.error('Failed to start conversation:', err);
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/conversations/${convId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': currentUser.user_id },
      });
      if (res.ok) {
        const data = await fetchJson<{ conversations: Conversation[] }>('/api/conversations', {
          headers: { 'x-user-id': currentUser.user_id },
        });
        if (data?.conversations) {
          setConversations(data.conversations);
          if (activeConversationId === convId) {
            const nextConv = data.conversations.find((c) => c.conversation_id !== convId);
            setActiveConversationId(nextConv ? nextConv.conversation_id : null);
            setMessages([]);
          }
        }
        await loadDiagnostics();
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const handleRestoreWebEndpoint = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/endpoints/web', {
        method: 'POST',
        headers: { 'x-user-id': currentUser.user_id },
      });
      if (res.ok) {
        await loadEndpoints();
        await loadDiagnostics();
      }
    } catch (err) {
      console.error('Failed to restore web endpoint:', err);
    }
  };

  const handleSendMessage = async (text: string, senderId?: string) => {
    const effectiveUserId = senderId || currentUser?.user_id;
    if (!effectiveUserId || !activeConversationId) return;
    try {
      const res = await fetch(`/api/conversations/${activeConversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': effectiveUserId,
        },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        await loadMessages();
        await loadDiagnostics();
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleGeneratePairingCode = async (): Promise<PairingCode | null> => {
    if (!currentUser) return null;
    try {
      const res = await fetch('/api/endpoints/pairing', {
        method: 'POST',
        headers: { 'x-user-id': currentUser.user_id },
      });
      const data = await res.json();
      return data.pairing || null;
    } catch (err) {
      console.error('Failed to generate pairing code:', err);
      return null;
    }
  };

  const handleTogglePresence = async (endpointId: string, currentStatus: string) => {
    if (!currentUser) return;
    const nextStatus = currentStatus === 'online' ? 'offline' : 'online';
    try {
      await fetch(`/api/endpoints/${endpointId}/presence`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.user_id,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadEndpoints();
      await loadMessages();
      await loadDiagnostics();
    } catch (err) {
      console.error('Failed to toggle presence:', err);
    }
  };

  const handleUnlinkEndpoint = async (endpointId: string) => {
    if (!currentUser) return;
    try {
      await fetch(`/api/endpoints/${endpointId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': currentUser.user_id },
      });
      await loadEndpoints();
      await loadDiagnostics();
    } catch (err) {
      console.error('Failed to unlink endpoint:', err);
    }
  };

  const handleSetupWebhook = async (botId: 'bot_a' | 'bot_b') => {
    const res = await fetch('/api/integrations/telegram/setup-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bot_id: botId,
        app_url: window.location.origin,
      }),
    });
    return res.json();
  };

  const activeConversation = conversations.find(
    (c) => c.conversation_id === activeConversationId
  ) || null;

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Top Header */}
      <header className="bg-slate-950 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-emerald-950 border border-emerald-500/40 flex items-center justify-center">
            <Radio className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-slate-100">MESSAGE HUB</h1>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-emerald-400">
                ITERATION 0
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-mono">
              Decoupled Universal Communication Layer
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded border border-slate-800">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded transition-colors ${
              activeTab === 'chat'
                ? 'bg-slate-800 text-emerald-400 font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Messages</span>
          </button>

          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded transition-colors ${
              activeTab === 'diagnostics'
                ? 'bg-slate-800 text-emerald-400 font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Diagnostics</span>
          </button>
        </div>

        {/* Right drawer toggle, reconnect button & system indicators */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Connection status indicator & manual Reconnect button */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded text-xs">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : connectionStatus === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-rose-400'
              }`}
            />
            <span className="hidden sm:inline text-[11px] font-mono text-slate-300">
              {connectionStatus === 'connected'
                ? 'Online'
                : connectionStatus === 'connecting'
                ? 'Connecting...'
                : 'Offline'}
            </span>

            <button
              onClick={handleManualReconnect}
              title={connectionStatus === 'connected' ? 'Синхронизировать данные' : 'Восстановить соединение'}
              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${connectionStatus === 'connecting' ? 'animate-spin text-amber-400' : ''}`}
              />
            </button>
          </div>

          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="p-1.5 hover:bg-slate-900 border border-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors"
            title={drawerOpen ? 'Close Interfaces Panel' : 'Open Interfaces Panel'}
          >
            {drawerOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Telegram-style Reconnection Banner */}
      {connectionStatus !== 'connected' && (
        <div
          className={`px-4 py-2 flex items-center justify-between text-xs font-medium shrink-0 transition-colors ${
            connectionStatus === 'connecting'
              ? 'bg-amber-950/95 border-b border-amber-600/40 text-amber-200'
              : 'bg-rose-950/95 border-b border-rose-600/50 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {connectionStatus === 'connecting' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
                <span>Соединение с Message Hub... (Connecting to server...)</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  Соединение с веб-интерфейсом разорвано. Синхронизация отключена.
                </span>
              </>
            )}
          </div>

          <button
            onClick={handleManualReconnect}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold shadow transition-colors ${
              connectionStatus === 'connecting'
                ? 'bg-amber-600 hover:bg-amber-500 text-slate-950'
                : 'bg-rose-600 hover:bg-rose-500 text-white'
            }`}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${connectionStatus === 'connecting' ? 'animate-spin' : ''}`}
            />
            <span>Восстановить соединение</span>
          </button>
        </div>
      )}

      {/* Identity Bar */}
      <IdentityBar
        currentUser={currentUser}
        allUsers={allUsers}
        onSelectUser={handleSelectUser}
        onCreateUser={handleCreateUser}
        onDeleteUser={handleDeleteUser}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'chat' && (
          <>
            <ConversationList
              conversations={conversations}
              activeConversationId={activeConversationId}
              onSelectConversation={(id) => setActiveConversationId(id)}
              allUsers={allUsers}
              currentUserId={currentUser?.user_id || ''}
              onStartDirectConversation={handleStartDirectConversation}
              onDeleteConversation={handleDeleteConversation}
            />

            <ChatArea
              conversation={activeConversation}
              messages={messages}
              currentUserId={currentUser?.user_id || ''}
              allUsers={allUsers}
              onSendMessage={handleSendMessage}
              onDeleteConversation={handleDeleteConversation}
              loading={loading}
            />

            {drawerOpen && currentUser && (
              <InterfacesDrawer
                currentUser={currentUser}
                endpoints={endpoints}
                onGeneratePairingCode={handleGeneratePairingCode}
                onTogglePresence={handleTogglePresence}
                onUnlinkEndpoint={handleUnlinkEndpoint}
                onDeleteUser={handleDeleteUser}
                onRestoreWebEndpoint={handleRestoreWebEndpoint}
                onRefresh={() => {
                  loadEndpoints();
                  loadDiagnostics();
                }}
              />
            )}
          </>
        )}

        {activeTab === 'diagnostics' && (
          <DiagnosticsView
            diagnostics={diagnostics}
            onRefresh={loadDiagnostics}
            onSetupWebhook={handleSetupWebhook}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
}
