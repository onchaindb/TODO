// tRPC router for TODO operations
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TodoService } from '@/lib/services/TodoService';
import { keplrWallet } from '@/lib/wallet/keplr';

// Validation schemas (x402 standard - SDK handles payment via callback)

const listTodosSchema = z.object({
  ownerAddress: z.string().min(1),
});

// Helper to create TodoService instance
function createTodoService(ownerAddress: string) {
  return new TodoService({
    endpoint: process.env.ONCHAINDB_ENDPOINT || 'http://207.180.219.86:9092',
    appId: process.env.ONCHAINDB_APP_ID || 'app_80a9b8f9525342b7',
    apiKey: process.env.ONCHAINDB_API_KEY || 'dev_key_12345678901234567890123456789012',
    currentUserAddress: ownerAddress,
  });
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
