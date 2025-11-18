'use client';

import {useState, useEffect, useCallback} from 'react';
import { useKeplrWallet } from '@/hooks/useKeplrWallet';
import { trpc } from '@/utils/trpc';
import { CheckCircle2, Circle, Trash2, Loader2, Wallet, Search, Plus, X } from 'lucide-react';
import { createClient, OnChainDBClient } from '@enidon-ai/sdk';
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
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="relative">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-3">
              OnChainDB TODO
            </h1>
            {(todosQuery.isLoading || isProcessing) && (
              <div className="absolute -right-12 top-1/2 -translate-y-1/2 z-50">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            )}
          </div>
          <p className="text-gray-600 text-lg">
            Decentralized task management on Celestia
          </p>
        </div>

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

        {/* Wallet Connection - Glassy Card */}
        <div className="backdrop-blur-xl bg-white/70 rounded-2xl shadow-xl border border-white/20 p-6 mb-8">
          {!wallet.isConnected ? (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                <Wallet className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Connect Your Wallet</h2>
              <p className="text-gray-600 mb-6">
                Connect Keplr to start managing your TODOs
              </p>
              {!wallet.isKeplrInstalled() ? (
                <a
                  href={wallet.getInstallUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold py-3 px-8 rounded-xl transition-all transform hover:scale-105"
                >
                  Install Keplr
                </a>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={wallet.isConnecting}
                  className="inline-flex items-center bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold py-3 px-8 rounded-xl transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
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
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Connected</p>
                  <p className="font-mono text-sm font-semibold text-gray-900 truncate max-w-xs">
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
                <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
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
                    className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold py-3 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
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
            className="fixed bottom-8 right-8 w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white rounded-full shadow-2xl flex items-center justify-center transition-all transform hover:scale-110 z-40"
          >
            <Plus className="w-8 h-8" />
          </button>
        )}

        {/* TODO List - Glassy Card */}
        {wallet.isConnected && (
          <div className="backdrop-blur-xl bg-white/70 rounded-2xl shadow-xl border border-white/20 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">My TODOs</h2>
            </div>

            {/* Search Bar - Glassy */}
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search TODOs..."
                  className="w-full pl-12 pr-4 py-3 bg-white/50 backdrop-blur border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Tabs - Modern */}
            <div className="flex gap-2 mb-6 bg-gray-100/80 rounded-xl p-1">
              <button
                onClick={() => setActiveTab('active')}
                className={`flex-1 px-4 py-2.5 font-medium rounded-lg transition-all ${
                  activeTab === 'active'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Active
                {activeCount > 0 && (
                  <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
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
                className={`flex-1 px-4 py-2.5 font-medium rounded-lg transition-all ${
                  activeTab === 'completed'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Completed
                {completedCount > 0 && (
                  <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
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
              <div className="text-center py-8">
                <p className="text-red-500">Failed to load TODOs. Please try again.</p>
              </div>
            )}

            {!todosQuery.isError && todos.filter(t => t.title !== '[DELETED]').length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500">No TODOs yet. Create your first TODO above!</p>
              </div>
            )}

            {!todosQuery.isError && filteredTodos.length === 0 && todos.filter(t => t.title !== '[DELETED]').length > 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500">
                  {searchQuery.trim()
                    ? `No TODOs match "${searchQuery}"`
                    : `No ${activeTab} TODOs`
                  }
                </p>
              </div>
            )}

            {!todosQuery.isError && filteredTodos.length > 0 && (
              <ul className="space-y-3">
                {filteredTodos.map((todo) => (
                  <li
                    key={todo.id}
                    className={`flex items-start gap-4 p-5 rounded-xl border transition-all hover:shadow-lg ${
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
                        <CheckCircle2 className="w-6 h-6 text-green-500" />
                      ) : (
                        <Circle className="w-6 h-6 text-gray-300 hover:text-blue-500" />
                      )}
                    </button>
                    <div className="flex-grow min-w-0">
                      <h3
                        className={`font-semibold text-lg ${
                          todo.completedAt
                            ? 'text-gray-400 line-through'
                            : 'text-gray-900'
                        }`}
                      >
                        {todo.title}
                      </h3>
                      {todo.description && (
                        <p
                          className={`text-sm mt-1.5 ${
                            todo.completedAt ? 'text-gray-400' : 'text-gray-600'
                          }`}
                        >
                          {todo.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
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
                      className="flex-shrink-0 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-sm text-gray-500">
          <p>
            Powered by{' '}
            <a
              href="https://celestia.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-purple-600 font-medium transition-colors"
            >
              Celestia
            </a>{' '}
            × OnChainDB SDK
          </p>
        </div>
      </div>
    </main>
  );
}
