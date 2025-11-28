'use client';

import {useState, useEffect, useCallback} from 'react';
import { useKeplrWallet } from '@/hooks/useKeplrWallet';
import { trpc } from '@/utils/trpc';
import { CheckCircle2, Circle, Trash2, Loader2, Wallet, Search, Plus, X } from 'lucide-react';
import { createClient, OnChainDBClient } from '@onchaindb/sdk';
import {Todo} from "@/lib/services/TodoService";

// Configuration from environment variables
const BACKEND_URL = process.env.NEXT_PUBLIC_ONCHAINDB_ENDPOINT || "http://localhost:9092";
const APP_ID = process.env.NEXT_PUBLIC_ONCHAINDB_APP_ID || 'app_80a9b8f9525342b7';
const API_KEY = process.env.NEXT_PUBLIC_ONCHAINDB_API_KEY || 'dev_key_12345678901234567890123456789012';

export default function Home() {
  const wallet = useKeplrWallet();
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoDescription, setNewTodoDescription] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [client, setClient] = useState<OnChainDBClient | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Initialize SDK client
  useEffect(() => {
    const sdkClient = createClient({
      endpoint: BACKEND_URL,
      apiKey: API_KEY,
      appId: APP_ID
    });
    setClient(sdkClient);
  }, []);

  // tRPC query for listing TODOs (read-only)
  const todosQuery = trpc.todo.list.useQuery(
    { ownerAddress: wallet.address || '' },
    { enabled: !!wallet.address, refetchInterval: 0 }
  );

  const handleConnect = async () => {
    try {
      await wallet.connect();
      await todosQuery.refetch()
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  };

  // Generic function to store TODO with payment handling
  const storeTodoWithPayment = async (
    todo: Todo,
    operation: 'create' | 'update' | 'delete'
  ) => {
    if (!wallet.address || !client) {
      console.log('❌ [STORE] Wallet not connected or client not ready');
      return;
    }

    if (isProcessing) {
      console.log('⚠️ [STORE] Already processing, ignoring new request');
      return;
    }

    setIsProcessing(true);

    const operationEmojis = { create: '📝', update: '🔄', delete: '🗑️' };
    const operationLabels = { create: 'creation', update: 'update', delete: 'deletion' };

    const operationId = `${operation}_${Date.now()}`;
    console.log(`\n🚀 [OPERATION START] ${operationId}`);

    try {
      console.log(`${operationEmojis[operation]} ${operation.charAt(0).toUpperCase() + operation.slice(1)}ing TODO (direct SDK integration)...`);

      // Payment callback - reusable for all operations
      const paymentCallback = async (quote: any) => {
        console.log('💰 [PAYMENT CALLBACK] Called with quote:', quote);

        const costInUtia = Math.ceil((quote.total_cost_tia || 0) * 1_000_000);

        if (isNaN(costInUtia) || costInUtia <= 0) {
          console.error('❌ [PAYMENT CALLBACK] Invalid cost:', costInUtia);
          throw new Error(`Invalid payment amount: ${costInUtia}`);
        }

        console.log(`💵 [PAYMENT CALLBACK] Requesting ${costInUtia} utia from Keplr...`);

        let broadcastResult;
        try {
          broadcastResult = await wallet.signAndBroadcast(
            quote.broker_address,
            `${costInUtia}utia`,
            `OnChainDB TODO ${operationLabels[operation]}`
          );
          console.log('📡 [PAYMENT CALLBACK] Broadcast result:', broadcastResult);
        } catch (err) {
          console.error('❌ [PAYMENT CALLBACK] Error during signAndBroadcast:', err);
          throw err;
        }

        if (!broadcastResult.success) {
          console.error('❌ [PAYMENT CALLBACK] Payment failed:', broadcastResult.error);
          throw new Error(`Payment failed: ${broadcastResult.error}`);
        }

        const paymentData = {
          txHash: broadcastResult.txHash,
          network: 'mocha-4'
        };

        console.log('✅ [PAYMENT CALLBACK] Returning payment data:', paymentData);

        return paymentData;
      };

      // Store TODO using SDK
      console.log(`📤 [STORE] Calling SDK store with todo:`, todo);
      const storeResult = await client.store(
        { collection: 'main', data: [todo] },
        paymentCallback,
        true
      );

      console.log(`📥 [STORE] SDK store result:`, storeResult);
      console.log(`✅ TODO ${operation}d successfully!`);

      // Clear form only for create operation
      if (operation === 'create') {
        setNewTodoTitle('');
        setNewTodoDescription('');
      }

      await todosQuery.refetch();
      console.log(`✅ [OPERATION END] ${operationId}\n`);
    } catch (error) {
      console.error(`❌ [OPERATION FAILED] ${operationId}:`, error);
      alert(`Failed to ${operation} TODO: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      console.log(`🏁 [OPERATION CLEANUP] ${operationId} - Setting isProcessing to false`);
      setIsProcessing(false);
    }
  };

  const handleCreateTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.address || !newTodoTitle.trim() || !client) return;

    const newTodo: Todo = {
      id: `todo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: newTodoTitle,
      description: newTodoDescription || undefined,
      completedAt: null,
      owner: wallet.address,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null
    };

    await storeTodoWithPayment(newTodo, 'create');
    setIsCreateModalOpen(false);
  };

  const handleToggleComplete = async (todoId: string) => {
    console.log('🔄 [TOGGLE CLICKED] Todo ID:', todoId);

    const todos = todosQuery.data || [];
    const existingTodo = todos.find(t => t.id === todoId);
    if (!existingTodo) {
      console.log('❌ [TOGGLE FAILED] Todo not found');
      return;
    }

    const updatedTodo: Todo = {
      ...existingTodo,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log('📤 [TOGGLE] Calling storeTodoWithPayment');
    await storeTodoWithPayment(updatedTodo, 'update');
  };

  const handleDeleteTodo = async (todoId: string) => {
    console.log('🗑️ [DELETE CLICKED] Todo ID:', todoId);

    if (!confirm('Are you sure you want to delete this TODO?')) {
      console.log('❌ [DELETE CANCELLED] User cancelled confirmation');
      return;
    }

    console.log('✅ [DELETE CONFIRMED] Proceeding with delete');

    const todos = todosQuery.data || [];
    const existingTodo = todos.find(t => t.id === todoId);
    if (!existingTodo) {
      console.log('❌ [DELETE FAILED] Todo not found');
      return;
    }

    const deletedTodo: Todo = {
      ...existingTodo,
      description: undefined,
      updatedAt: new Date().toISOString(),
      deletedAt: new Date().toISOString(),
    };

    console.log('📤 [DELETE] Calling storeTodoWithPayment');
    await storeTodoWithPayment(deletedTodo, 'delete');
  };

  const todos = todosQuery.data || [];
  const isLoading = isProcessing;

  // Filter TODOs based on tab and search
  const filteredTodos = todos
    .filter(todo => !todo.deletedAt) // Exclude deleted
    .filter(todo => {
      // Tab filter
      if (activeTab === 'active') return !todo.completedAt;
      if (activeTab === 'completed') return todo.completedAt;
      return true;
    })
    .filter(todo => {
      // Search filter
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        todo.title.toLowerCase().includes(query) ||
        (todo.description?.toLowerCase().includes(query) || false)
      );
    });

  const activeCount = todos.filter(t => !t.completedAt && !t.deletedAt).length;
  const completedCount = todos.filter(t => t.completedAt && !t.deletedAt).length;

  return (
    <>
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 w-full bg-white/80 backdrop-blur-xl border-b border-slate-200/50 z-50 transition-all duration-300">
        <div className="max-w-5xl mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                <path d="M8 12L16 8L24 12V20L16 24L8 20V12Z" stroke="white" strokeWidth="2.5" fill="none"/>
                <circle cx="16" cy="16" r="3" fill="white"/>
              </svg>
            </div>
            <span className="text-lg font-semibold text-slate-800 tracking-tight">
              OnChainDB
            </span>
          </div>
          <div className="flex items-center gap-1">
            <a href="https://onchaindb.io" className="px-4 py-2 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-all">
              Main Site
            </a>
            <a href="https://onchaindb.io/llms.txt" className="px-4 py-2 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-all">
              Docs
            </a>
          </div>
        </div>
      </nav>

      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 pt-24 pb-20 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto">
          {/* Header - Only show when not connected */}
          {!wallet.isConnected && (
            <div className="text-center mb-10">
              <h1 className="text-4xl font-bold mb-3 text-slate-900 tracking-tight">
                OnChain TODO
              </h1>
              <p className="text-slate-500 text-base">
                Decentralized task management powered by Celestia
              </p>
            </div>
          )}

        {/* Processing Overlay - View Blocking */}
        {isProcessing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full">
              <div className="flex flex-col items-center gap-5">
                <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-slate-900 mb-1">Processing Transaction</p>
                  <p className="text-sm text-slate-500">Please confirm in your Keplr wallet</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Wallet Connection Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 mb-6 transition-all duration-300">
          {!wallet.isConnected ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Wallet className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">Connect Your Wallet</h2>
              <p className="text-slate-500 text-sm mb-6 max-w-xs mx-auto">
                Connect your Keplr wallet to start managing your on-chain TODOs
              </p>
              {!wallet.isKeplrInstalled() ? (
                <a
                  href={wallet.getInstallUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-blue-600 text-white font-medium py-3 px-8 rounded-xl transition-all duration-200 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/25 hover:-translate-y-0.5"
                >
                  Install Keplr
                </a>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={wallet.isConnecting}
                  className="inline-flex items-center bg-blue-600 text-white font-medium py-3 px-8 rounded-xl transition-all duration-200 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/25 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0"
                >
                  {wallet.isConnecting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    'Connect Wallet'
                  )}
                </button>
              )}
              {wallet.error && (
                <p className="text-red-500 text-sm mt-4">{wallet.error}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center shadow-md shadow-emerald-500/20">
                  <Wallet className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Connected</p>
                  <p className="font-mono text-sm font-medium text-slate-700 truncate max-w-[200px] sm:max-w-xs">
                    {wallet.address}
                  </p>
                </div>
              </div>
              <button
                onClick={wallet.disconnect}
                className="text-sm text-slate-500 hover:text-red-600 font-medium px-4 py-2 rounded-lg hover:bg-red-50 transition-all"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>

        {/* Create TODO Modal */}
        {isCreateModalOpen && wallet.isConnected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setIsCreateModalOpen(false)}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-slate-900">
                  Create New TODO
                </h2>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleCreateTodo}>
                <div className="mb-4">
                  <label htmlFor="title" className="block text-sm font-medium text-slate-700 mb-2">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="title"
                    value={newTodoTitle}
                    onChange={(e) => setNewTodoTitle(e.target.value)}
                    placeholder="What needs to be done?"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all outline-none"
                    required
                    maxLength={200}
                    autoFocus
                  />
                </div>
                <div className="mb-6">
                  <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-2">
                    Description <span className="text-slate-400">(optional)</span>
                  </label>
                  <textarea
                    id="description"
                    value={newTodoDescription}
                    onChange={(e) => setNewTodoDescription(e.target.value)}
                    placeholder="Add more details..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white resize-none transition-all outline-none"
                    rows={3}
                    maxLength={1000}
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newTodoTitle.trim() || isProcessing}
                    className="flex-1 bg-blue-600 text-white font-medium py-3 px-4 rounded-xl transition-all duration-200 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none flex items-center justify-center"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create TODO'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Floating Action Button */}
        {wallet.isConnected && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="fixed bottom-8 right-8 w-14 h-14 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-500/30 flex items-center justify-center transition-all duration-200 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-1 hover:scale-105 z-40 active:scale-95"
          >
            <Plus className="w-6 h-6" />
          </button>
        )}

        {/* TODO List Card */}
        {wallet.isConnected && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-6 pb-4">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">My TODOs</h2>

              {/* Search Bar */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search TODOs..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all outline-none"
                />
              </div>

              {/* Tabs */}
              <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  onClick={() => setActiveTab('active')}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    activeTab === 'active'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Active
                  {activeCount > 0 && (
                    <span className={`ml-2 px-2 py-0.5 text-xs font-medium rounded-full ${
                      activeTab === 'active'
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-slate-200 text-slate-500'
                    }`}>
                      {activeCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('completed')}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    activeTab === 'completed'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Completed
                  {completedCount > 0 && (
                    <span className={`ml-2 px-2 py-0.5 text-xs font-medium rounded-full ${
                      activeTab === 'completed'
                        ? 'bg-emerald-100 text-emerald-600'
                        : 'bg-slate-200 text-slate-500'
                    }`}>
                      {completedCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Todo List */}
            <div className="px-6 pb-6">
              {todosQuery.isError && (
                <div className="text-center py-12">
                  <p className="text-red-500 text-sm">Failed to load TODOs. Please try again.</p>
                </div>
              )}

              {!todosQuery.isError && todos.filter(t => t.title !== '[DELETED]').length === 0 && (
                <div className="text-center py-12">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-slate-100 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-slate-500 text-sm">No TODOs yet</p>
                  <p className="text-slate-400 text-xs mt-1">Click the + button to create one</p>
                </div>
              )}

              {!todosQuery.isError && filteredTodos.length === 0 && todos.filter(t => t.title !== '[DELETED]').length > 0 && (
                <div className="text-center py-12">
                  <p className="text-slate-500 text-sm">
                    {searchQuery.trim()
                      ? `No results for "${searchQuery}"`
                      : `No ${activeTab} TODOs`
                    }
                  </p>
                </div>
              )}

              {!todosQuery.isError && filteredTodos.length > 0 && (
                <ul className="space-y-2">
                  {filteredTodos.map((todo) => (
                    <li
                      key={todo.id}
                      className={`group flex items-start gap-3 p-4 rounded-xl border transition-all ${
                        todo.completedAt
                          ? 'bg-slate-50/50 border-slate-100'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <button
                        onClick={() => handleToggleComplete(todo.id)}
                        disabled={isLoading}
                        className="mt-0.5 flex-shrink-0 disabled:opacity-50 transition-all hover:scale-110"
                      >
                        {todo.completedAt ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <Circle className="w-5 h-5 text-slate-300 hover:text-blue-500 transition-colors" />
                        )}
                      </button>
                      <div className="flex-grow min-w-0">
                        <h3
                          className={`font-medium text-sm leading-snug ${
                            todo.completedAt
                              ? 'text-slate-400 line-through'
                              : 'text-slate-800'
                          }`}
                        >
                          {todo.title}
                        </h3>
                        {todo.description && (
                          <p
                            className={`text-sm mt-1 leading-relaxed ${
                              todo.completedAt ? 'text-slate-400' : 'text-slate-500'
                            }`}
                          >
                            {todo.description}
                          </p>
                        )}
                        <p className="text-xs text-slate-400 mt-2">
                          {new Date(todo.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteTodo(todo.id)}
                        disabled={isLoading}
                        className="flex-shrink-0 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-8">
            {/* Logo and tagline */}
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                  <path d="M8 12L16 8L24 12V20L16 24L8 20V12Z" stroke="white" strokeWidth="2.5" fill="none"/>
                  <circle cx="16" cy="16" r="3" fill="white"/>
                </svg>
              </div>
              <div>
                <span className="text-base font-semibold">OnChainDB</span>
                <p className="text-slate-400 text-xs">The Collective Intelligence Database</p>
              </div>
            </div>

            {/* Links */}
            <div className="flex items-center gap-6">
              <a href="https://onchaindb.io" className="text-slate-400 text-sm hover:text-white transition-colors">
                Website
              </a>
              <a href="https://onchaindb.io/llms.txt" className="text-slate-400 text-sm hover:text-white transition-colors">
                Docs
              </a>
              <a href="https://github.com/onchaindb" className="text-slate-400 text-sm hover:text-white transition-colors">
                GitHub
              </a>
              <a href="https://x.com/onchaindb" className="text-slate-400 text-sm hover:text-white transition-colors">
                Twitter
              </a>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
            <p>2025 OnChainDB. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-slate-300 transition-colors">Privacy</a>
              <a href="#" className="hover:text-slate-300 transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
