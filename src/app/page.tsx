'use client';

import {useState, useEffect, useCallback} from 'react';
import { useKeplrWallet } from '@/hooks/useKeplrWallet';
import { trpc } from '@/utils/trpc';
import { CheckCircle2, Circle, Trash2, Loader2, Wallet, Search, Plus, X } from 'lucide-react';
import { createClient, OnChainDBClient } from '@onchaindb/sdk';
import {Todo} from "@/lib/services/TodoService";

// Configuration from environment variables
const BACKEND_URL = process.env.NEXT_PUBLIC_ONCHAINDB_ENDPOINT || 'http://207.180.219.86:9092';
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
      <nav className="fixed top-0 left-0 right-0 w-full bg-white shadow-sm z-50 transition-all duration-300 px-0 py-4 min-h-[72px]">
        <div className="max-w-[1200px] mx-auto px-5 flex justify-between items-center">
          <div className="flex items-center gap-3.5">
            <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#2563eb"/>
              <path d="M8 12L16 8L24 12V20L16 24L8 20V12Z" stroke="white" strokeWidth="2" fill="none"/>
              <circle cx="16" cy="16" r="3" fill="white"/>
            </svg>
            <span className="text-[1.375rem] font-bold text-[#1e293b] font-['Berkeley_Mono',_'JetBrains_Mono',_monospace] tracking-[-0.03em]">
              OnChainDB TODO
            </span>
          </div>
          <div className="flex items-center gap-8">
            <a href="https://onchaindb.io" className="text-[#475569] font-medium text-[0.95rem] hover:text-[#2563eb] transition-colors">
              Main Site
            </a>
            <a href="https://onchaindb.io/llms.txt" className="text-[#475569] font-medium text-[0.95rem] hover:text-[#2563eb] transition-colors">
              Docs
            </a>
          </div>
        </div>
      </nav>

      <main className="min-h-screen bg-[#f0f4ff] pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Header - Only show when not connected */}
          {!wallet.isConnected && (
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-3 text-[var(--text-primary)] font-['Berkeley_Mono',_'JetBrains_Mono',_monospace]">
                OnChain TODO
              </h1>
              <p className="text-[var(--text-secondary)] text-sm">
                Decentralized task management on Celestia
              </p>
            </div>
          )}

        {/* Processing Overlay - View Blocking */}
        {isProcessing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-md" />
            <div className="relative backdrop-blur-xl bg-white/95 rounded-2xl shadow-2xl border border-white/20 p-8">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
                <div className="text-center">
                  <p className="text-lg font-semibold text-gray-900 mb-1">Processing transaction</p>
                  <p className="text-sm text-gray-600">Please confirm in Keplr wallet...</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Wallet Connection - Glass Card */}
        <div className="bg-white/70 backdrop-blur-[10px] rounded-xl shadow-sm border border-[rgba(255,255,255,0.18)] p-4 mb-6 transition-all duration-300">
          {!wallet.isConnected ? (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#2563eb] to-[#3b82f6] flex items-center justify-center shadow-[0_4px_12px_rgba(37,99,235,0.25)]">
                <Wallet className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2 font-['Berkeley_Mono',_'JetBrains_Mono',_monospace]">Connect Your Wallet</h2>
              <p className="text-[var(--text-secondary)] mb-6">
                Connect Keplr to start managing your TODOs
              </p>
              {!wallet.isKeplrInstalled() ? (
                <a
                  href={wallet.getInstallUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-gradient-to-br from-[rgba(29,78,216,0.95)] via-[rgba(37,99,235,0.9)] to-[rgba(29,78,216,0.95)] backdrop-blur-[10px] text-white font-semibold py-3 px-8 border border-[rgba(255,255,255,0.18)] rounded-xl transition-all duration-500 hover:-translate-y-1 hover:scale-[1.02] shadow-[0_10px_40px_rgba(37,99,235,0.15),_inset_0_4px_12px_rgba(255,255,255,0.15),_inset_0_-4px_12px_rgba(37,99,235,0.08)]"
                >
                  Install Keplr
                </a>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={wallet.isConnecting}
                  className="inline-flex items-center bg-gradient-to-br from-[rgba(29,78,216,0.95)] via-[rgba(37,99,235,0.9)] to-[rgba(29,78,216,0.95)] backdrop-blur-[10px] text-white font-semibold py-3 px-8 border border-[rgba(255,255,255,0.18)] rounded-xl transition-all duration-500 hover:-translate-y-1 hover:scale-[1.02] shadow-[0_10px_40px_rgba(37,99,235,0.15),_inset_0_4px_12px_rgba(255,255,255,0.15),_inset_0_-4px_12px_rgba(37,99,235,0.08)] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
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
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#22c55e] to-[#2563eb] flex items-center justify-center shadow-[0_4px_12px_rgba(34,197,94,0.25)]">
                  <Wallet className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wide">Connected</p>
                  <p className="font-mono text-sm font-semibold text-[var(--text-primary)] truncate max-w-xs">
                    {wallet.address}
                  </p>
                </div>
              </div>
              <button
                onClick={wallet.disconnect}
                className="text-sm text-red-600 hover:text-red-700 font-medium px-4 py-2 rounded-lg hover:bg-red-50 transition-colors"
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
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => setIsCreateModalOpen(false)}
            />

            {/* Modal */}
            <div className="relative backdrop-blur-xl bg-white/90 rounded-2xl shadow-2xl border border-white/20 p-6 w-full max-w-md transform transition-all">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-[var(--text-primary)] font-['Berkeley_Mono',_'JetBrains_Mono',_monospace]">
                  Create New TODO
                </h2>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleCreateTodo}>
                <div className="mb-4">
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="title"
                    value={newTodoTitle}
                    onChange={(e) => setNewTodoTitle(e.target.value)}
                    placeholder="What needs to be done?"
                    className="w-full px-4 py-3 bg-white/50 backdrop-blur border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    required
                    maxLength={200}
                    autoFocus
                  />
                </div>
                <div className="mb-6">
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                    Description (optional)
                  </label>
                  <textarea
                    id="description"
                    value={newTodoDescription}
                    onChange={(e) => setNewTodoDescription(e.target.value)}
                    placeholder="Add more details..."
                    className="w-full px-4 py-3 bg-white/50 backdrop-blur border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all"
                    rows={4}
                    maxLength={1000}
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newTodoTitle.trim() || isProcessing}
                    className="flex-1 bg-gradient-to-br from-[rgba(29,78,216,0.95)] via-[rgba(37,99,235,0.9)] to-[rgba(29,78,216,0.95)] backdrop-blur-[10px] text-white font-semibold py-3 px-4 border border-[rgba(255,255,255,0.18)] rounded-xl transition-all duration-500 hover:-translate-y-1 hover:scale-[1.02] shadow-[0_10px_40px_rgba(37,99,235,0.15),_inset_0_4px_12px_rgba(255,255,255,0.15),_inset_0_-4px_12px_rgba(37,99,235,0.08)] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center"
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
            className="fixed bottom-8 right-8 w-16 h-16 bg-gradient-to-br from-[#2563eb] to-[#3b82f6] text-white rounded-full shadow-[0_10px_40px_rgba(37,99,235,0.3)] flex items-center justify-center transition-all duration-500 hover:-translate-y-1 hover:scale-110 z-40"
          >
            <Plus className="w-8 h-8" />
          </button>
        )}

        {/* TODO List - Glass Card */}
        {wallet.isConnected && (
          <div className="bg-white/70 backdrop-blur-[10px] rounded-xl shadow-sm border border-[rgba(255,255,255,0.18)] p-4 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[var(--text-primary)] font-['Berkeley_Mono',_'JetBrains_Mono',_monospace]">My TODOs</h2>
            </div>

            {/* Search Bar - Glassy */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search TODOs..."
                  className="w-full pl-10 pr-3 py-2 text-sm bg-white/50 backdrop-blur border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Tabs - Modern */}
            <div className="flex gap-2 mb-4 bg-gray-100/80 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('active')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-all ${
                  activeTab === 'active'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Active
                {activeCount > 0 && (
                  <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
                    activeTab === 'active'
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    {activeCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('completed')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-all ${
                  activeTab === 'completed'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Completed
                {completedCount > 0 && (
                  <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
                    activeTab === 'completed'
                      ? 'bg-green-100 text-green-600'
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    {completedCount}
                  </span>
                )}
              </button>
            </div>

            {todosQuery.isError && (
              <div className="text-center py-6">
                <p className="text-red-500 text-sm">Failed to load TODOs. Please try again.</p>
              </div>
            )}

            {!todosQuery.isError && todos.filter(t => t.title !== '[DELETED]').length === 0 && (
              <div className="text-center py-6">
                <p className="text-gray-500 text-sm">No TODOs yet. Click + to create one!</p>
              </div>
            )}

            {!todosQuery.isError && filteredTodos.length === 0 && todos.filter(t => t.title !== '[DELETED]').length > 0 && (
              <div className="text-center py-6">
                <p className="text-gray-500 text-sm">
                  {searchQuery.trim()
                    ? `No TODOs match "${searchQuery}"`
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
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-all hover:shadow-md ${
                      todo.completedAt
                        ? 'bg-white/40 backdrop-blur border-gray-200/50'
                        : 'bg-white/60 backdrop-blur border-gray-200'
                    }`}
                  >
                    <button
                      onClick={() => handleToggleComplete(todo.id)}
                      disabled={isLoading}
                      className="mt-0.5 flex-shrink-0 disabled:opacity-50 transition-transform hover:scale-110"
                    >
                      {todo.completedAt ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-300 hover:text-blue-500" />
                      )}
                    </button>
                    <div className="flex-grow min-w-0">
                      <h3
                        className={`font-semibold text-base ${
                          todo.completedAt
                            ? 'text-gray-400 line-through'
                            : 'text-gray-900'
                        }`}
                      >
                        {todo.title}
                      </h3>
                      {todo.description && (
                        <p
                          className={`text-sm mt-1 ${
                            todo.completedAt ? 'text-gray-400' : 'text-gray-600'
                          }`}
                        >
                          {todo.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
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
                      className="flex-shrink-0 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#0a0e1a] text-white p-0 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4/5 h-px bg-gradient-to-r from-transparent via-[#2563eb] to-transparent opacity-50"></div>

        <div className="bg-gradient-to-br from-[#0f172a] to-[#1a1f2e] py-10 relative border-t border-[rgba(37,99,235,0.2)]">
          <div className="max-w-[1200px] mx-auto px-5 relative z-10">
            <div className="flex items-center justify-between gap-12 flex-wrap">
              <div className="flex items-center gap-8">
                <div className="flex items-center gap-3">
                  <svg width="36" height="36" viewBox="0 0 32 32" fill="none" className="drop-shadow-[0_2px_8px_rgba(37,99,235,0.3)]">
                    <rect width="32" height="32" rx="8" fill="#2563eb"/>
                    <path d="M8 12L16 8L24 12V20L16 24L8 20V12Z" stroke="white" strokeWidth="2" fill="none"/>
                    <circle cx="16" cy="16" r="3" fill="white"/>
                  </svg>
                  <span className="text-xl font-bold font-['Berkeley_Mono',_'JetBrains_Mono',_monospace] tracking-[-0.025em]">
                    OnChainDB
                  </span>
                </div>
                <p className="text-[#64748b] text-sm font-normal pl-4 border-l border-[#334155]">
                  The database that lives on-chain
                </p>
              </div>

              <div className="flex items-center gap-10">
                <a href="https://onchaindb.io#features" className="text-[#94a3b8] text-sm font-medium hover:text-white transition-colors relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-0.5 after:bg-[#2563eb] after:transition-all hover:after:w-full">
                  Features
                </a>
                <a href="https://onchaindb.io/llms.txt" className="text-[#94a3b8] text-sm font-medium hover:text-white transition-colors relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-0.5 after:bg-[#2563eb] after:transition-all hover:after:w-full">
                  Docs
                </a>
                <a href="https://github.com/onchaindb" className="text-[#94a3b8] text-sm font-medium hover:text-white transition-colors relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-0.5 after:bg-[#2563eb] after:transition-all hover:after:w-full">
                  GitHub
                </a>
              </div>

              <div className="flex gap-3">
                <a href="https://x.com/onchaindb" aria-label="Twitter" className="w-9 h-9 flex items-center justify-center bg-white/5 border border-white/10 rounded-lg text-[#64748b] hover:bg-[rgba(37,99,235,0.15)] hover:border-[rgba(37,99,235,0.3)] hover:text-white hover:-translate-y-0.5 transition-all">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/>
                  </svg>
                </a>
                <a href="https://github.com/onchaindb" aria-label="GitHub" className="w-9 h-9 flex items-center justify-center bg-white/5 border border-white/10 rounded-lg text-[#64748b] hover:bg-[rgba(37,99,235,0.15)] hover:border-[rgba(37,99,235,0.3)] hover:text-white hover:-translate-y-0.5 transition-all">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#050711] py-5 border-t border-white/5">
          <div className="max-w-[1200px] mx-auto px-5 flex justify-between items-center flex-wrap gap-4">
            <p className="text-[#475569] text-sm m-0 font-normal">
              &copy; 2025 OnChainDB. All rights reserved.
            </p>
            <div className="flex gap-10">
              <a href="#" className="text-[#475569] text-sm font-normal hover:text-[#94a3b8] transition-all relative after:absolute after:bottom-[-2px] after:left-0 after:w-0 after:h-px after:bg-[#2563eb] after:transition-all hover:after:w-full">
                Privacy Policy
              </a>
              <a href="#" className="text-[#475569] text-sm font-normal hover:text-[#94a3b8] transition-all relative after:absolute after:bottom-[-2px] after:left-0 after:w-0 after:h-px after:bg-[#2563eb] after:transition-all hover:after:w-full">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
