// tRPC router for TODO operations
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TodoService } from '@/lib/services/TodoService';
import { keplrWallet } from '@/lib/wallet/keplr';
import { CONFIG } from '@/lib/config';

// Validation schemas (x402 standard - SDK handles payment via callback)

const listTodosSchema = z.object({
  ownerAddress: z.string().min(1),
});

// Helper to create TodoService instance
function createTodoService(ownerAddress: string) {
  const config = {
    endpoint: CONFIG.endpoint,
    appId: CONFIG.appId,
    apiKey: CONFIG.apiKey,
    currentUserAddress: ownerAddress,
    brokerAddress: CONFIG.brokerAddress,
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
