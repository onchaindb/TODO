// tRPC router for TODO operations
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TodoService } from '@/lib/services/TodoService';
import { keplrWallet } from '@/lib/wallet/keplr';

// Validation schemas (x402 standard - SDK handles payment via callback)

const listTodosSchema = z.object({
  ownerAddress: z.string().min(1),
});

const BACKEND_URL = process.env.NEXT_PUBLIC_ONCHAINDB_ENDPOINT || "http://localhost:9092";
const APP_ID = process.env.NEXT_PUBLIC_ONCHAINDB_APP_ID || 'app_80a9b8f9525342b7';
const API_KEY = process.env.NEXT_PUBLIC_ONCHAINDB_API_KEY || 'dev_key_12345678901234567890123456789012';

// Helper to create TodoService instance
function createTodoService(ownerAddress: string) {
  const config = {
    endpoint: BACKEND_URL,
    appId: APP_ID,
    apiKey: API_KEY,
    currentUserAddress: ownerAddress,
  }
  console.log(config);
  return new TodoService(config);
}

export const todoRouter = router({
  // List all TODOs for a user
  list: publicProcedure
    .input(listTodosSchema)
    .query(async ({ input }) => {
      const service = createTodoService(input.ownerAddress);
      return await service.getTodos(input.ownerAddress);
    }),
});
