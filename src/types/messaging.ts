// Types for the messaging system based on backend entities

export enum ConversationType {
  DIRECT = 'direct',
  GROUP = 'group',
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
}

export enum ChatRoleType {
  USER = 'user',
  SYSTEM = 'system',
  ASSISTANT = 'assistant',
}

export interface UserProfile {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  bannerUrl?: string;
  birthday?: Date;
  handle: string;
  email: string;
  emailVerified: boolean;
  phoneNumber?: string;
  phoneNumberVerified: boolean;
  linkedinUsername?: string;
  githubUsername?: string;
  xHandle?: string;
  siteUrl?: string;
  description?: string;
  details?: any;
  externalLinks?: any[];
  isOrganizationAccount: boolean;
  userChatConfig?: any;
  userSettings?: any;
  location?: string;
  isClaimed: boolean;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  status?: 'online' | 'offline' | 'away' | 'dnd'; // Client-side status
}

export interface ConversationChannel {
  id: string;
  type: ConversationType;
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

export interface ConversationChannelMember {
  id: string;
  conversationId: string;
  conversation?: ConversationChannel;
  userId: string;
  user?: UserProfile;
  joinedAt: string;
  leftAt?: string;
  addedBy?: string;
  addedByUser?: UserProfile;
  lastReadAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationChannelMessage {
  id: string;
  conversationId: string;
  conversation?: ConversationChannel;
  senderId?: string;
  sender?: UserProfile;
  role: ChatRoleType;
  content: string;
  messageType: MessageType;
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

export interface ConversationChannelMessageAttachment {
  id: string;
  messageId: string;
  message?: ConversationChannelMessage;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  fileType: string;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationChannelMessageReaction {
  id: string;
  messageId: string;
  message?: ConversationChannelMessage;
  userId: string;
  user?: UserProfile;
  emoji: string;            // Unicode emoji character
  count?: number;           // Optional count for aggregated reactions
  createdAt: string;
  updatedAt: string;
}

export interface ConversationChannelMessageMention {
  id: string;
  messageId: string;
  message?: ConversationChannelMessage;
  mentionedUserId?: string;
  mentionedUser?: UserProfile;
  startIndex?: number;
  endIndex?: number;
  mentionText: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationChannelMessageEditHistory {
  id: string;
  messageId: string;
  message?: ConversationChannelMessage;
  editVersion: number;
  previousContent: string;
  editedBy?: string;
  editor?: UserProfile;
  editReason?: string;
  createdAt: string;
  updatedAt: string;
}

// DTOs - For API requests
export interface CreateConversationDto {
  type: ConversationType;
  name?: string;
  description?: string;
  imageUrl?: string;
  memberIds: string[];
}

export interface UpdateConversationDto {
  name?: string;
  description?: string;
  imageUrl?: string;
}

export interface MessageAttachmentDto {
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  fileType: string;
  thumbnailUrl?: string;
}

/**
 * Represents a user mention within a message
 * Similar to Discord's @username functionality
 */
export interface MessageMentionDto {
  userId: string;           // ID of the mentioned user
  startIndex: number;       // Starting index in the message content
  endIndex: number;         // Ending index in the message content
  mentionText: string;      // Display text for the mention, e.g. @username
}

export interface SendMessageDto {
  content: string;
  messageType?: MessageType;
  replyToId?: string;
  attachments?: MessageAttachmentDto[];
  mentions?: MessageMentionDto[];   // Added support for user mentions
  metadata?: Record<string, any>;
}

// Bot types for testing
export interface Bot {
  id: string;
  name: string;
  avatarUrl?: string;
  status: 'active' | 'inactive';
  capabilities: BotCapability[];
  createdAt: string;
  updatedAt: string;
  config: BotConfig;
}

export type BotCapability = 
  | 'message_sending' 
  | 'conversation_joining' 
  | 'user_simulation';

export interface BotConfig {
  messageInterval?: number; // In milliseconds
  messageTemplates?: string[];
  targetConversations?: string[]; // Conversation IDs
  responseChance?: number; // 0-1 probability of responding
  simulatedTypingDelay?: number; // In milliseconds
  maxMessagesPerInterval?: number;
}

export interface BotSimulationStats {
  messagesCount: number;
  conversationsJoined: number;
  activeTime: number; // In milliseconds
  messagesSentByConversation: Record<string, number>;
}

// Client types for testing
export interface Client {
  id: string;
  user: UserProfile;
  activeConversationId?: string;
  isConnected: boolean;
  connectionStartedAt?: string;
}

// WebSocket message types
export interface WebSocketMessage {
  type: WebSocketMessageType;
  payload: any;
}

export type WebSocketMessageType =
  | 'connect'
  | 'disconnect'
  | 'message_create'
  | 'message_update'
  | 'message_delete'
  | 'conversation_create'
  | 'conversation_update'
  | 'conversation_delete'
  | 'user_status_change'
  | 'typing_indicator'
  | 'reaction_add'
  | 'reaction_remove'
  | 'user_mention'
  | 'bot_command'; 