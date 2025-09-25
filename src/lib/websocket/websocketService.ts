'use client';

import { WebSocketMessage, WebSocketMessageType } from '@/types/messaging';

// WebSocket connection statuses
export type WebSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// WebSocket events
export type WebSocketEvent = {
  type: 'open' | 'close' | 'error' | 'message';
  timestamp: number;
  data?: any;
  error?: string;
};

// Typing event handler
export type TypingUpdateHandler = (conversationId: string, typingUsers: string[]) => void;

// Message event handlers
export type MessageHandler = (data: any) => void;
export type ConversationHandler = (data: any) => void;
export type UserStatusHandler = (userId: string, status: 'online' | 'offline') => void;

/**
 * WebSocket service for managing connections and event logs
 * Implements Socket.io client for the messaging gateway
 */
export class WebSocketService {
  private socket: any = null; // Socket.io client
  private status: WebSocketStatus = 'disconnected';
  private events: WebSocketEvent[] = [];
  private messageHandlers: Map<string, MessageHandler[]> = new Map();
  private conversationHandlers: Map<string, ConversationHandler[]> = new Map();
  private typingHandlers: Map<string, TypingUpdateHandler[]> = new Map();
  private statusChangeCallbacks: ((status: WebSocketStatus) => void)[] = [];
  private eventLogCallbacks: ((events: WebSocketEvent[]) => void)[] = [];
  private userId: string = "";
  private apiKey: string = "test_key"; // THIS WILL BE GOING AWAY

  constructor(private url: string = 'wss://messaging-api.cerebralvalley.ai/messaging') {}

  // Set the user ID for this connection
  setUserId(userId: string): void {
    this.userId = userId;
    
    // If already connected, reconnect with the new user ID
    if (this.socket && this.status === 'connected') {
      this.disconnect();
      this.connect(this.url);
    }
  }

  // Connect to WebSocket server with user ID
  async connect(url: string = this.url): Promise<void> {
    if (this.socket && this.status === 'connected') {
      return;
    }

    if (!this.userId) {
      this.setStatus('error');
      this.addEvent('error', { error: 'Cannot connect: No user ID provided' });
      throw new Error('Cannot connect: No user ID provided');
    }

    this.url = url;
    this.setStatus('connecting');
    this.addEvent('open', { connecting: true });

    try {
      // Dynamically import socket.io-client to ensure it's only loaded in the browser
      const { io } = await import('socket.io-client');
      
      console.log(`WebSocketService: Connecting to ${url} with userId ${this.userId}`);
      
      // Connect to the socket with auth token in the extraHeaders
      this.socket = io(url, {
        transports: ['websocket'],
        auth: {
          token: this.userId,
          'x-api-key': this.apiKey,
          'x-user-id': this.userId
        },
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      // Set up socket event handlers
      this.setupSocketEventHandlers();
    } catch (error) {
      this.setStatus('error');
      this.addEvent('error', { error: `Failed to connect: ${error}` });
      throw error;
    }
  }

  // Disconnect from WebSocket server
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.setStatus('disconnected');
  }

  // Setup socket event handlers
  private setupSocketEventHandlers(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log(`WebSocketService: Connected to server with userId ${this.userId}`);
      this.setStatus('connected');
      this.addEvent('open', { connected: true });
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log(`WebSocketService: Disconnected from server, reason: ${reason}`);
      this.setStatus('disconnected');
      this.addEvent('close', { code: 1000, reason });
    });

    this.socket.on('connect_error', (error: any) => {
      console.error(`WebSocketService: Connection error:`, error);
      console.error(`WebSocketService: Connection error details:`, {
        url: this.url,
        userId: this.userId,
        status: this.status,
        socketId: this.socket?.id
      });
      this.setStatus('error');
      this.addEvent('error', { error: `Connection error: ${error.message}` });
    });

    // Debug events
    this.socket.onAny((event: string, ...args: any[]) => {
      console.log(`WebSocketService: Received event '${event}':`, args);
    });

    // Message events
    this.socket.on('message:new', (data: any) => {
      console.log('WebSocketService: Received message:new event:', data);
      this.addEvent('message', { received: true, message: data });
      this.triggerMessageHandlers('message:new', data);
    });

    this.socket.on('message:sent', (data: any) => {
      this.addEvent('message', { sent: true, message: data });
      this.triggerMessageHandlers('message:sent', data);
    });

    this.socket.on('message:updated', (data: any) => {
      this.addEvent('message', { updated: true, message: data });
      this.triggerMessageHandlers('message:updated', data);
    });

    this.socket.on('message:deleted', (data: any) => {
      this.addEvent('message', { deleted: true, message: data });
      this.triggerMessageHandlers('message:deleted', data);
    });

    this.socket.on('message:unsent', (data: any) => {
      this.addEvent('message', { unsent: true, message: data });
      this.triggerMessageHandlers('message:unsent', data);
    });

    // Add handler for message:read events
    this.socket.on('message:read', (data: any) => {
      console.log('WebSocketService: Received message:read event:', JSON.stringify(data, null, 2));
      this.addEvent('message', { read: true, data });
      this.triggerMessageHandlers('message:read', data);
    });

    // Conversation events
    this.socket.on('conversation:new', (data: any) => {
      console.log('WebSocketService: Received conversation:new event:', JSON.stringify(data, null, 2));
      console.log('WebSocketService: Current userId:', this.userId);
      
      // Check if this user is a member of the conversation
      const conversation = data.conversation || data;
      const memberIds = conversation?.members?.map((m: any) => m.userId) || conversation?.memberIds || [];
      const isMember = this.userId && memberIds.includes(this.userId);
      
      console.log('WebSocketService: Conversation members:', memberIds);
      console.log('WebSocketService: Is current user a member:', isMember);
      
      this.addEvent('message', { conversation: 'new', data });
      this.triggerConversationHandlers('conversation:new', data);
    });

    this.socket.on('conversation:updated', (data: any) => {
      console.log('WebSocketService: Received conversation:updated event:', JSON.stringify(data, null, 2));
      this.addEvent('message', { conversation: 'updated', data });
      this.triggerConversationHandlers('conversation:updated', data);
    });

    this.socket.on('conversation:joined', (data: any) => {
      console.log('WebSocketService: Received conversation:joined event:', data);
      this.addEvent('message', { conversation: 'joined', data });
      this.triggerConversationHandlers('conversation:joined', data);
    });

    this.socket.on('conversation:left', (data: any) => {
      console.log('WebSocketService: Received conversation:left event:', data);
      this.addEvent('message', { conversation: 'left', data });
      this.triggerConversationHandlers('conversation:left', data);
    });

    this.socket.on('conversation:member:added', (data: any) => {
      console.log('WebSocketService: Received conversation:member:added event:', data);
      this.addEvent('message', { conversation: 'member:added', data });
      this.triggerConversationHandlers('conversation:member:added', data);
    });

    this.socket.on('conversation:member:removed', (data: any) => {
      console.log('WebSocketService: Received conversation:member:removed event:', data);
      this.addEvent('message', { conversation: 'member:removed', data });
      this.triggerConversationHandlers('conversation:member:removed', data);
    });

    // Typing events
    this.socket.on('typing:update', (data: any) => {
      this.addEvent('message', { typing: 'update', data });
      this.triggerTypingHandlers(data.conversationId, data.typingUsers);
    });

    // User status events
    this.socket.on('user:status', (data: any) => {
      this.addEvent('message', { user: 'status', data });
      this.triggerUserStatusHandlers(data.userId, data.status);
    });
    
    // Reaction events - newly added
    this.socket.on('message:reaction:added', (data: any) => {
      console.log('WebSocketService: Received message:reaction:added event:', data);
      this.addEvent('message', { reaction: 'added', data });
      this.triggerMessageHandlers('message:reaction:added', data);
    });
    
    this.socket.on('message:reaction:removed', (data: any) => {
      console.log('WebSocketService: Received message:reaction:removed event:', data);
      this.addEvent('message', { reaction: 'removed', data });
      this.triggerMessageHandlers('message:reaction:removed', data);
    });
    
    // Mention events - newly added
    this.socket.on('message:mention', (data: any) => {
      console.log('WebSocketService: Received message:mention event:', data);
      this.addEvent('message', { mention: true, data });
      this.triggerMessageHandlers('message:mention', data);
    });
  }

  // Send a message to a conversation
  sendMessage(conversationId: string, message: any): void {
    if (!this.socket || this.status !== 'connected') {
      this.addEvent('error', { error: 'Cannot send message: WebSocket is not connected' });
      return;
    }

    try {
      this.socket.emit('message:send', {
        conversationId,
        message
      });
      this.addEvent('message', { sent: true, conversationId, message });
    } catch (error) {
      this.addEvent('error', { error: `Failed to send message: ${error}` });
    }
  }

  // Send typing indicator
  sendTypingStart(conversationId: string): void {
    if (!this.socket || this.status !== 'connected') return;
    
    this.socket.emit('typing:start', { conversationId });
  }

  // Send stopped typing indicator
  sendTypingStop(conversationId: string): void {
    if (!this.socket || this.status !== 'connected') return;
    
    this.socket.emit('typing:stop', { conversationId });
  }

  // Mark messages as read
  markMessagesRead(conversationId: string): void {
    if (!this.socket || this.status !== 'connected') return;
    
    this.socket.emit('message:read', { conversationId });
  }

  // Join a conversation
  joinConversation(conversationId: string): void {
    if (!this.socket || this.status !== 'connected') {
      console.warn(`Cannot join conversation ${conversationId}: socket not connected (status: ${this.status})`);
      return;
    }
    
    console.log(`Joining conversation room: ${conversationId}`);
    this.socket.emit('conversation:join', { conversationId });
    
    // Add an event to the log
    this.addEvent('message', { 
      action: 'join',
      conversationId,
      timestamp: new Date().toISOString()
    });
  }

  // Leave a conversation
  leaveConversation(conversationId: string): void {
    if (!this.socket || this.status !== 'connected') return;
    
    this.socket.emit('conversation:leave', { conversationId });
  }

  // Register message event handlers
  onMessageEvent(event: string, handler: MessageHandler): void {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, []);
    }
    this.messageHandlers.get(event)?.push(handler);
  }

  // Remove message event handler
  offMessageEvent(event: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(event) || [];
    this.messageHandlers.set(
      event,
      handlers.filter(h => h !== handler)
    );
  }

  // Register conversation event handlers
  onConversationEvent(event: string, handler: ConversationHandler): void {
    if (!this.conversationHandlers.has(event)) {
      this.conversationHandlers.set(event, []);
    }
    this.conversationHandlers.get(event)?.push(handler);
  }

  // Register typing update handler
  onTypingUpdate(conversationId: string, handler: TypingUpdateHandler): void {
    const key = conversationId || 'all';
    if (!this.typingHandlers.has(key)) {
      this.typingHandlers.set(key, []);
    }
    this.typingHandlers.get(key)?.push(handler);
  }

  // Trigger message handlers
  private triggerMessageHandlers(event: string, data: any): void {
    const handlers = this.messageHandlers.get(event) || [];
    handlers.forEach(handler => handler(data));
  }

  // Trigger conversation handlers
  private triggerConversationHandlers(event: string, data: any): void {
    const handlers = this.conversationHandlers.get(event) || [];
    console.log(`WebSocketService: Triggering ${handlers.length} handlers for event '${event}'`);
    
    if (handlers.length === 0) {
      console.warn(`WebSocketService: No handlers registered for event '${event}'`);
    }
    
    handlers.forEach((handler, index) => {
      try {
        console.log(`WebSocketService: Calling handler ${index} for event '${event}'`);
        handler(data);
      } catch (error) {
        console.error(`WebSocketService: Error in handler ${index} for event '${event}':`, error);
      }
    });
  }

  // Trigger typing handlers
  private triggerTypingHandlers(conversationId: string, typingUsers: string[]): void {
    // Trigger handlers for specific conversation
    const specificHandlers = this.typingHandlers.get(conversationId) || [];
    specificHandlers.forEach(handler => handler(conversationId, typingUsers));
    
    // Trigger handlers for all conversations
    const globalHandlers = this.typingHandlers.get('all') || [];
    globalHandlers.forEach(handler => handler(conversationId, typingUsers));
  }

  // Trigger user status handlers
  private triggerUserStatusHandlers(userId: string, status: 'online' | 'offline'): void {
    // If we add specific user status handlers in the future, we would call them here
  }

  // Register status change callback
  onStatusChange(callback: (status: WebSocketStatus) => void): void {
    this.statusChangeCallbacks.push(callback);
  }

  // Register event log callback
  onEventLog(callback: (events: WebSocketEvent[]) => void): void {
    this.eventLogCallbacks.push(callback);
  }

  // Get current status
  getStatus(): WebSocketStatus {
    return this.status;
  }

  // Get event logs
  getEvents(): WebSocketEvent[] {
    return [...this.events];
  }

  // Clear event logs
  clearEvents(): void {
    this.events = [];
    this.notifyEventLogCallbacks();
  }

  // Check if we're joined to a conversation room
  isJoinedToConversation(conversationId: string): boolean {
    if (!this.socket || this.status !== 'connected') {
      return false;
    }
    
    // This is a Socket.io specific way to check if we're in a room
    // It's not part of the official API but works in most cases
    const rooms = this.socket.rooms;
    if (rooms) {
      return rooms.has(`conversation:${conversationId}`);
    }
    
    return false;
  }

  // Get all rooms we're joined to
  getJoinedRooms(): string[] {
    if (!this.socket || this.status !== 'connected') {
      return [];
    }
    
    // This is a Socket.io specific way to get all rooms
    const rooms = this.socket.rooms;
    if (rooms) {
      return Array.from(rooms as Set<string>).filter(room => 
        typeof room === 'string' && room.startsWith('conversation:')
      );
    }
    
    return [];
  }

  // Private methods
  private setStatus(status: WebSocketStatus): void {
    this.status = status;
    this.notifyStatusChangeCallbacks();
  }

  private addEvent(type: WebSocketEvent['type'], data?: any): void {
    const event: WebSocketEvent = {
      type,
      timestamp: Date.now(),
      data,
    };
    this.events.push(event);
    this.notifyEventLogCallbacks();
  }

  private notifyStatusChangeCallbacks(): void {
    this.statusChangeCallbacks.forEach((callback) => callback(this.status));
  }

  private notifyEventLogCallbacks(): void {
    this.eventLogCallbacks.forEach((callback) => callback(this.events));
  }
} 