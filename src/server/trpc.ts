// tRPC setup with SuperJSON for serialization
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';

// Create tRPC context
export const createTRPCContext = async () => {
  return {};
};

// Initialize tRPC with SuperJSON transformer
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
});

// Export reusable router and procedure helpers
export const router = t.router;
export const publicProcedure = t.procedure;
