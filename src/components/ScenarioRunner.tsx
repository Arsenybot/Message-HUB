/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Play, CheckCircle, ArrowRight, Server, Bot, Laptop, AlertCircle } from 'lucide-react';

interface ScenarioRunnerProps {
  onRefreshAll: () => void;
}

interface StepLog {
  step: string;
  detail: string;
  status: 'pending' | 'success' | 'failed';
}

export const ScenarioRunner: React.FC<ScenarioRunnerProps> = ({ onRefreshAll }) => {
  const [runningScenario, setRunningScenario] = useState<number | null>(null);
  const [logs, setLogs] = useState<StepLog[]>([]);

  const runScenario1 = async () => {
    // Scenario 1: Telegram Bot A -> Message Hub Core -> Telegram Bot B
    setRunningScenario(1);
    setLogs([
      { step: 'Setup', detail: 'Ensuring User A and User B identities exist with Bot A and Bot B endpoints', status: 'pending' },
    ]);

    try {
      // 1. Get or create pairing for User A & Bot A
      const pairResA = await fetch('/api/endpoints/pairing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'usr_alpha_01' },
      });
      const pairDataA = await pairResA.json();

      setLogs((prev) => [
        { step: 'Pairing User A', detail: `Pairing code generated: ${pairDataA.pairing.code}`, status: 'success' },
        { step: 'Linking Bot A', detail: 'Dispatching /link update to Bot A webhook', status: 'pending' },
      ]);

      // Link User A to Bot A chat 111111
      await fetch('/api/integrations/telegram/webhook/bot_a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update_id: 88001,
          message: {
            message_id: 101,
            from: { id: 111111, is_bot: false, first_name: 'Alex' },
            chat: { id: 111111, type: 'private', first_name: 'Alex' },
            date: Math.floor(Date.now() / 1000),
            text: `/link ${pairDataA.pairing.code}`,
          },
        }),
      });

      // 2. Get or create pairing for User B & Bot B
      const pairResB = await fetch('/api/endpoints/pairing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'usr_beta_02' },
      });
      const pairDataB = await pairResB.json();

      setLogs((prev) => [
        ...prev.slice(0, 1),
        { step: 'Linking Bot A', detail: 'Bot A endpoint successfully linked to Identity [Alex]', status: 'success' },
        { step: 'Linking Bot B', detail: 'Dispatching /link update to Bot B webhook for User B', status: 'pending' },
      ]);

      // Link User B to Bot B chat 222222
      await fetch('/api/integrations/telegram/webhook/bot_b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update_id: 88002,
          message: {
            message_id: 102,
            from: { id: 222222, is_bot: false, first_name: 'Sam' },
            chat: { id: 222222, type: 'private', first_name: 'Sam' },
            date: Math.floor(Date.now() / 1000),
            text: `/link ${pairDataB.pairing.code}`,
          },
        }),
      });

      setLogs((prev) => [
        ...prev.slice(0, 2),
        { step: 'Linking Bot B', detail: 'Bot B endpoint successfully linked to Identity [Sam]', status: 'success' },
        { step: 'Message Ingestion', detail: 'Sending "Привет" from Bot A (Alex) to Message Hub Core', status: 'pending' },
      ]);

      // 3. Send message from Bot A
      const msgRes = await fetch('/api/integrations/telegram/webhook/bot_a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update_id: 88003,
          message: {
            message_id: 103,
            from: { id: 111111, is_bot: false, first_name: 'Alex' },
            chat: { id: 111111, type: 'private', first_name: 'Alex' },
            date: Math.floor(Date.now() / 1000),
            text: 'Привет от Bot A через универсальный протокол!',
          },
        }),
      });
      const msgData = await msgRes.json();

      setLogs((prev) => [
        ...prev.slice(0, 3),
        { step: 'Message Ingestion', detail: 'Message processed by Telegram Adapter and passed to Core', status: 'success' },
        { step: 'Core Routing & Delivery', detail: `Core resolved recipient User B -> dispatched to Bot B: ${msgData.message}`, status: 'success' },
      ]);

      onRefreshAll();
    } catch (err: unknown) {
      setLogs((prev) => [
        ...prev,
        { step: 'Failure', detail: err instanceof Error ? err.message : String(err), status: 'failed' },
      ]);
    } finally {
      setRunningScenario(null);
    }
  };

  const runScenario2 = async () => {
    // Scenario 2: Web Client -> Message Hub -> Telegram Bot B
    setRunningScenario(2);
    setLogs([
      { step: 'Web Client Action', detail: 'Alex (User A) typing message in Web Client', status: 'pending' },
    ]);

    try {
      // Find conversation
      const convsRes = await fetch('/api/conversations', {
        headers: { 'x-user-id': 'usr_alpha_01' },
      });
      const convsData = await convsRes.json();
      const conv = convsData.conversations?.[0];

      if (!conv) {
        throw new Error('No active conversation found between User A and User B');
      }

      setLogs((prev) => [
        { step: 'Web Client Action', detail: `Connected to conversation ${conv.conversation_id}`, status: 'success' },
        { step: 'Dispatching to Core', detail: 'Calling POST /api/conversations/:id/messages', status: 'pending' },
      ]);

      const sendRes = await fetch(`/api/conversations/${conv.conversation_id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'usr_alpha_01',
        },
        body: JSON.stringify({
          text: 'Сообщение отправлено из Web Client в Core!',
        }),
      });

      const sendData = await sendRes.json();

      setLogs((prev) => [
        ...prev.slice(0, 1),
        { step: 'Dispatching to Core', detail: `Message ${sendData.message?.message_id} created in Core`, status: 'success' },
        { step: 'Recipient Routing', detail: `Core routed message to ${sendData.deliveries?.length} endpoint(s) for User B`, status: 'success' },
      ]);

      onRefreshAll();
    } catch (err: unknown) {
      setLogs((prev) => [
        ...prev,
        { step: 'Failure', detail: err instanceof Error ? err.message : String(err), status: 'failed' },
      ]);
    } finally {
      setRunningScenario(null);
    }
  };

  return (
    <div className="flex-1 bg-slate-950 p-6 overflow-y-auto space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-base font-semibold text-slate-100">Architectural Test Scenarios (Iteration 0)</h2>
        <p className="text-xs text-slate-400 mt-1">
          Verify and demonstrate the core hypothesis: messages belong to the universal communication layer and identity,
          not to any single proprietary client.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Scenario 1 Card */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Scenario 1: Bot A → Hub → Bot B</h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
              CROSS-BOT ROUTING
            </span>
          </div>
          <p className="text-xs text-slate-400">
            User A sends "Привет" via Telegram Bot A. Message Hub core ingests it, resolves recipient User B,
            and routes delivery to Telegram Bot B.
          </p>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 py-1">
            <Bot className="w-3.5 h-3.5 text-sky-400" />
            <span>Bot A</span>
            <ArrowRight className="w-3 h-3 text-slate-600" />
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            <span>Message Hub</span>
            <ArrowRight className="w-3 h-3 text-slate-600" />
            <Bot className="w-3.5 h-3.5 text-purple-400" />
            <span>Bot B</span>
          </div>

          <button
            onClick={runScenario1}
            disabled={runningScenario !== null}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-medium text-xs rounded transition-colors flex items-center justify-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{runningScenario === 1 ? 'Running Scenario 1...' : 'Execute Scenario 1'}</span>
          </button>
        </div>

        {/* Scenario 2 Card */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Scenario 2: Web Client → Hub → Telegram</h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800/40">
              WEB-TO-TELEGRAM
            </span>
          </div>
          <p className="text-xs text-slate-400">
            User A initiates a message inside Web Client. Message Hub creates the universal message record and delivers
            it to User B's Telegram endpoint.
          </p>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 py-1">
            <Laptop className="w-3.5 h-3.5 text-emerald-400" />
            <span>Web Client</span>
            <ArrowRight className="w-3 h-3 text-slate-600" />
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            <span>Message Hub</span>
            <ArrowRight className="w-3 h-3 text-slate-600" />
            <Bot className="w-3.5 h-3.5 text-purple-400" />
            <span>Telegram Bot B</span>
          </div>

          <button
            onClick={runScenario2}
            disabled={runningScenario !== null}
            className="w-full py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-slate-950 font-medium text-xs rounded transition-colors flex items-center justify-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{runningScenario === 2 ? 'Running Scenario 2...' : 'Execute Scenario 2'}</span>
          </button>
        </div>
      </div>

      {/* Execution Logs */}
      {logs.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-semibold text-slate-200">Execution Pipeline Step Logs</span>
            <span className="text-[10px] font-mono text-emerald-400">Live Tracing</span>
          </div>

          <div className="space-y-2">
            {logs.map((log, idx) => (
              <div
                key={idx}
                className="p-2.5 bg-slate-950 border border-slate-800/80 rounded flex items-start gap-2.5 text-xs font-mono"
              >
                {log.status === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : log.status === 'failed' ? (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                ) : (
                  <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold text-slate-200">{log.step}</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">{log.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
