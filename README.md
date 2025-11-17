# OnChainDB TODO App

A simple TODO application demonstrating how to use the OnChainDB SDK with tRPC, Next.js 15, and Keplr wallet integration.

## Features

- **Decentralized Storage**: All TODOs are stored on-chain using OnChainDB SDK
- **Wallet Integration**: Connect with Keplr wallet for authentication and payments
- **Real-time Updates**: Automatic polling for TODO updates
- **Payment Handling**: Built-in payment flow for storage operations
- **Type-safe API**: Full end-to-end type safety with tRPC
- **Modern UI**: Clean, responsive design with Tailwind CSS

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19
- **API Layer**: tRPC 11 with SuperJSON
- **Database**: OnChainDB SDK (Celestia)
- **Styling**: Tailwind CSS
- **Wallet**: Keplr (Celestia Mocha Testnet)
- **State Management**: TanStack Query (React Query)

## Project Structure

```
todo-app/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── api/trpc/[trpc]/         # tRPC API route
│   │   ├── layout.tsx               # Root layout
│   │   ├── page.tsx                 # Main TODO UI
│   │   ├── providers.tsx            # tRPC & React Query providers
│   │   └── globals.css              # Tailwind imports
│   ├── hooks/
│   │   └── useKeplrWallet.ts        # Keplr wallet hook
│   ├── lib/
│   │   ├── services/
│   │   │   └── TodoService.ts       # OnChainDB TODO service
│   │   └── wallet/
│   │       └── keplr.ts             # Keplr wallet integration
│   ├── server/
│   │   ├── routers/
│   │   │   ├── _app.ts              # Root tRPC router
│   │   │   └── todo.ts              # TODO tRPC routes
│   │   └── trpc.ts                  # tRPC setup
│   └── utils/
│       └── trpc.ts                  # tRPC client
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
└── postcss.config.mjs
```

## OnChainDB Patterns

### 1. Service Layer Pattern (TodoService.ts)

```typescript
// Initialize OnChainDB client with createClient
this.client = createClient({
  endpoint: config.endpoint,
  apiKey: config.apiKey,
  appId: config.appId  // Simplified API with appId
});
```

### 2. Query Builder Pattern

```typescript
// Query TODOs for a specific owner
const result = await this.client.queryBuilder()
  .collection('todos')
  .whereField('owner').equals(ownerAddress)
  .selectAll()
  .execute();
```

### 3. Payment Flow Pattern

```typescript
// 1. Get pricing quote
const quote = await fetch('/api/pricing/quote', { ... });

// 2. Sign and broadcast payment via Keplr
const broadcastResult = await this.userWallet.signAndBroadcast(
  brokerAddress,
  `${costInUtia}utia`,
  `OnChainDB ${description}`
);

// 3. Store data with payment proof
storeRequest.payment_tx_hash = broadcastResult.txHash;
await this.client.store(storeRequest);
```

### 4. Data Versioning Pattern

OnChainDB uses versioning - updating a record with the same ID creates a new version:

```typescript
// Update TODO (creates new version)
const updatedTodo = { ...existingTodo, ...updates };
await this.client.store({ collection: 'todos', data: [updatedTodo] });
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd todo-app
npm install
```

### 2. Configure Broker Address

Update the broker address in `src/app/page.tsx`:

```typescript
const BROKER_ADDRESS = 'celestia1your-broker-address-here';
```

### 3. Install Keplr Wallet

If you don't have Keplr installed:
- Visit: https://www.keplr.app/download
- Install the browser extension
- Create or import a wallet

### 4. Fund Your Wallet

Get testnet TIA tokens from the faucet:
- Visit: https://faucet.celestia-mocha-4.com/
- Enter your Celestia address (from Keplr)
- Request tokens

### 5. Start the Development Server

```bash
npm run dev
```

Open [http://207.180.219.86:3000](http://207.180.219.86:3000) in your browser.

## Usage

### Connect Wallet

1. Click "Connect Wallet" button
2. Approve the connection in Keplr extension
3. Your address will be displayed

### Create TODOs

1. Enter a title (required)
2. Optionally add a description
3. Click "Create TODO"
4. Approve the payment transaction in Keplr
5. Wait for confirmation (TODO will appear automatically)

### Manage TODOs

- **Toggle Completion**: Click the circle icon to mark as complete/incomplete
- **Delete TODO**: Click the trash icon and confirm deletion
- **Auto-refresh**: TODOs refresh automatically every 5 seconds

## TODO Schema

```typescript
interface Todo {
  id: string;              // Unique ID: todo_${timestamp}_${random}
  title: string;           // TODO title (required)
  description?: string;    // Optional description
  completed: boolean;      // Completion status
  owner: string;           // Wallet address of owner
  created_at: string;      // ISO timestamp
  updated_at: string;      // ISO timestamp
}
```

## Key Concepts

### OnChainDB SDK

- **createClient**: Initialize the SDK client
- **queryBuilder**: Build type-safe queries
- **store**: Store data with automatic polling
- **Payment Integration**: Built-in payment handling

### tRPC

- **Type-safe**: Full type safety from server to client
- **Procedures**: `publicProcedure` for API endpoints
- **Mutations**: For write operations (create, update, delete)
- **Queries**: For read operations (list)

### Keplr Integration

- **Wallet Connection**: Connect/disconnect wallet
- **Transaction Signing**: Sign and broadcast transactions
- **Balance Checking**: Query wallet balance
- **Payment Handling**: Handle storage payments

## Payment Flow

1. **Quote**: Get pricing for storage operation
2. **Sign**: User signs transaction with Keplr
3. **Broadcast**: Transaction is broadcast to Celestia
4. **Verify**: Server verifies payment
5. **Store**: Data is stored on-chain

## Troubleshooting

### Keplr Not Connecting

- Make sure Keplr extension is installed
- Check that you're on the correct network (Mocha Testnet)
- Try refreshing the page

### Payment Failing

- Ensure you have sufficient TIA balance
- Check that the broker address is correct
- Verify your wallet has approved the transaction

### TODOs Not Loading

- Check console for errors
- Verify the OnChainDB endpoint is running
- Ensure your wallet is connected

## Development

### Build for Production

```bash
npm run build
npm start
```

### Lint

```bash
npm run lint
```

## Additional Resources

- [OnChainDB Documentation](https://docs.onchaindb.com)
- [Celestia Documentation](https://docs.celestia.org)
- [tRPC Documentation](https://trpc.io)
- [Next.js Documentation](https://nextjs.org/docs)
- [Keplr Documentation](https://docs.keplr.app)

## License

MIT
