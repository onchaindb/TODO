// TodoService using OnChainDB SDK
// This connects to the db-client backend for real data operations

import { createClient, DatabaseManager, OnChainDBClient } from '@onchaindb/sdk';

export interface Todo {
  id: string;
  title: string;
  description?: string;
  completedAt: string|null;
  owner: string; // Wallet address
  createdAt: string;
  updatedAt: string
  deletedAt: string|null;
}

export interface CreateTodoRequest {
  title: string;
  description?: string;
}

export interface UpdateTodoRequest {
  title?: string;
  description?: string;
  completed?: boolean;
}

export interface TodoServiceConfig {
  endpoint: string;
  appId: string;
  apiKey?: string;
  currentUserAddress?: string;
  userWallet?: any; // Keplr wallet instance for payments
  brokerAddress?: string; // Broker's payment address
}

/**
 * TodoService that connects to OnChainDB backend
 * Provides database operations for TODO functionality
 */
export class TodoService {
  private client: OnChainDBClient;
  private dbManager: DatabaseManager;
  private config: TodoServiceConfig;

  constructor(config: TodoServiceConfig) {
    this.config = config;

    // Create SDK client for data operations with simplified API
    this.client = createClient({
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      appId: config.appId  // Use simplified API with appId
    });

    // Get database manager for schema operations
    this.dbManager = this.client.database(config.appId);
  }


  /**
   * Get all TODOs for a specific owner (using OnChainDB queryBuilder)
   */
  async getTodos(ownerAddress: string): Promise<Todo[]> {
    try {
      console.log('Getting TODOs for owner:', ownerAddress);

      // Use OnChainDB queryBuilder pattern to query main collection
      // The backend automatically returns only the latest version of each record
      // No need for client-side deduplication!
      const result = await this.client.queryBuilder()
          .collection('main')
          .whereField('owner').equals(ownerAddress)
          .orderBy("updatedAt")
          .selectAll()
          .execute();

      console.log(result)
      if (!result.records) return [];

      // Sort by created_at descending (newest first)/
      const todos: Todo[] = (result.records as Todo[])

      // return todos;
      return todos.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).reduce((p, c) => {
        if (p.some(v => v.id === c.id)) return p;

        return [...p, c]
      }, [] as Todo[]);
    } catch (error) {
      console.error('Failed to get TODOs:', error);
      return [];
    }
  }



}

