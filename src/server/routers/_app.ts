// Root tRPC router
import { router } from '../trpc';
import { todoRouter } from './todo';

// Export the app router with all sub-routers
export const appRouter = router({
  todo: todoRouter,
});

// Export type definition for the router
export type AppRouter = typeof appRouter;
