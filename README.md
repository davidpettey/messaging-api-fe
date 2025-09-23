# Messaging Frontend Test

A real-time messaging frontend that connects to a WebSocket-based messaging backend. This project provides a complete infrastructure for chat applications with conversation management, real-time messaging, typing indicators, read receipts, reactions, and more.

## Overview

This project serves as a reference implementation for integrating with a real-time messaging backend. It demonstrates:

- WebSocket connection management
- Real-time message delivery
- Typing indicators
- Read receipts
- Message reactions
- User mentions
- File attachments
- Message editing and deletion
- Conversation management (create, update, add/remove members)

## For Frontend Teams

If you want to implement this messaging functionality in your project, you can:

1. Copy the following core files from this project:
   - `src/contexts/WebSocketContext.tsx` - React context for WebSocket connections
   - `src/hooks/useWebSocketConnection.ts` - Hook for easy WebSocket access
   - `src/lib/api/client.ts` - Base API client
   - `src/lib/api/conversationService.ts` - Conversation and message API services
   - `src/lib/websocket/websocketService.ts` - WebSocket service implementation
   - `src/lib/utils.ts` - Utility functions
   - `src/types/messaging.ts` - TypeScript type definitions

2. Study `src/components/conversation/ConversationList.tsx` as a reference for:
   - Event handling patterns
   - UI implementation
   - Feature integration

**Note**: Don't directly copy the ConversationList component - it's provided as a reference implementation only.

## Authentication

The system supports two authentication methods:

1. **API Key Authentication**: For development and testing
   - Requires `x-api-key` header in HTTP requests
   - Requires `x-user-id` header to identify the user

2. **Session Authentication**: For production use
   - Uses Clerk authentication
   - Falls back to API key if not available

## Core Data Structures

### User Profile

```typescript
export interface UserProfile {
  userId: string;
  firstName: string;
  lastName: string;
  handle: string;
  email: string;
  // ... other fields
  status?: 'online' | 'offline' | 'away' | 'dnd';
}
```

### Conversation Channel

```typescript
export interface ConversationChannel {
  id: string;
  type: ConversationType; // 'direct' | 'group'
  name?: string;
  description?: string;
  imageUrl?: string;
  createdBy?: string;
  creator?: UserProfile;
  lastMessageAt?: string;
  memberCount: number;
  members?: ConversationChannelMember[];
  messages?: ConversationChannelMessage[];
  createdAt: string;
  updatedAt: string;
}
```

### Message

```typescript
export interface ConversationChannelMessage {
  id: string;
  conversationId: string;
  senderId?: string;
  sender?: UserProfile;
  role: ChatRoleType; // 'user' | 'system' | 'assistant'
  content: string;
  messageType: MessageType; // 'text' | 'image' | 'file'
  replyToId?: string;
  replyTo?: ConversationChannelMessage;
  editedAt?: string;
  unsentAt?: string;
  deletedAt?: string;
  metadata?: Record<string, any>;
  attachments?: ConversationChannelMessageAttachment[];
  reactions?: ConversationChannelMessageReaction[];
  mentions?: ConversationChannelMessageMention[];
  editHistory?: ConversationChannelMessageEditHistory[];
  createdAt: string;
  updatedAt: string;
}
```

## WebSocket Events

### Connection Events
- `connect` - Socket connection established
- `disconnect` - Socket connection closed

### Message Events
- `message:new` - New message received
- `message:sent` - Message was sent successfully
- `message:updated` - Message was edited
- `message:deleted` - Message was deleted
- `message:unsent` - Message was unsent (removed for everyone)
- `message:read` - Messages were marked as read
- `message:reaction:added` - Reaction added to message
- `message:reaction:removed` - Reaction removed from message
- `message:mention` - User was mentioned in a message

### Conversation Events
- `conversation:new` - New conversation created
- `conversation:updated` - Conversation details updated
- `conversation:joined` - User joined a conversation
- `conversation:left` - User left a conversation
- `conversation:member:added` - Member was added to conversation
- `conversation:member:removed` - Member was removed from conversation

### Typing Events
- `typing:update` - Typing status updated with list of typing users
- `typing:start` - User started typing (client to server)
- `typing:stop` - User stopped typing (client to server)

### User Status Events
- `user:status` - User online status changed

## WebSocket Context Usage

```tsx
// In a component
import { useWebSocket } from '@/contexts/WebSocketContext';

function MyComponent() {
  const {
    connect,
    disconnect,
    sendMessage,
    isConnected,
    joinConversation,
    onMessageEvent,
  } = useWebSocket();

  // Connect to WebSocket
  useEffect(() => {
    connect('ws://localhost:3000/messaging');
    
    return () => {
      disconnect();
    };
  }, []);

  // Handle new messages
  useEffect(() => {
    onMessageEvent('message:new', (data) => {
      console.log('New message:', data);
    });
  }, []);

  // Send a message
  const handleSendMessage = () => {
    if (isConnected) {
      sendMessage('conversation-id', {
        content: 'Hello world!',
        messageType: 'text'
      });
    }
  };

  return (
    // Your component JSX
  );
}
```

## API Services

The project provides API services for interacting with the backend:

### ConversationService

```typescript
// Get conversations
const conversations = await ConversationService.getConversations(userId);

// Send a message
const message = await ConversationService.sendMessage(
  conversationId,
  { content: 'Hello!', messageType: 'text' },
  userId
);

// Add reaction to a message
await ConversationService.addReaction(
  conversationId,
  messageId,
  '👍',
  userId
);
```

## WebSocketService

This service manages the WebSocket connection and provides methods for:

- Connecting/disconnecting
- Sending messages
- Joining/leaving conversation rooms
- Sending typing indicators
- Marking messages as read
- Handling various events

Example:

```typescript
const websocketService = new WebSocketService();
websocketService.setUserId('user-123');
websocketService.connect();

// Register event handlers
websocketService.onMessageEvent('message:new', (data) => {
  console.log('New message:', data);
});

// Send a message
websocketService.sendMessage('conversation-id', { content: 'Hello!' });
```
