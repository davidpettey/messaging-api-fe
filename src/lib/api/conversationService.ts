import { api } from './client';
import { 
  ConversationChannel, 
  ConversationChannelMessage, 
  CreateConversationDto, 
  SendMessageDto, 
  UpdateConversationDto,
  ConversationChannelMessageEditHistory,
  MessageType,
  ChatRoleType,
  ConversationChannelMessageReaction,
  MessageMentionDto
} from '@/types/messaging';

export class ConversationService {
  // Create a new conversation
  static async createConversation(userId: string, data: CreateConversationDto): Promise<ConversationChannel> {
    return api.post<ConversationChannel>('/conversations', data, { userId });
  }

  // Get all conversations for current user
  static async getConversations(userId: string): Promise<ConversationChannel[]> {
    return api.get<ConversationChannel[]>('/conversations', { userId });
  }

  // Get a conversation by id
  static async getConversation(id: string, userId: string): Promise<ConversationChannel> {
    return api.get<ConversationChannel>(`/conversations/${id}`, { userId });
  }

  // Update a conversation
  static async updateConversation(id: string, updates: UpdateConversationDto, userId: string): Promise<ConversationChannel> {
    return api.patch<ConversationChannel>(`/conversations/${id}`, updates, { userId });
  }

  // Add a member to a conversation
  static async addMember(conversationId: string, memberUserId: string, userId: string): Promise<{ success: boolean }> {
    return api.post<{ success: boolean }>(`/conversations/${conversationId}/members/${memberUserId}`, {}, { userId });
  }

  // Remove a member from a conversation
  static async removeMember(conversationId: string, memberUserId: string, userId: string): Promise<{ success: boolean }> {
    return api.delete<{ success: boolean }>(`/conversations/${conversationId}/members/${memberUserId}`, { userId });
  }

  // Leave a conversation (remove current user)
  static async leaveConversation(conversationId: string, userId: string): Promise<{ success: boolean }> {
    return api.delete<{ success: boolean }>(`/conversations/${conversationId}/members`, { userId });
  }

  // Get messages from a conversation
  static async getMessages(
    conversationId: string, 
    userId: string,
    options?: {
      limit?: number;
      before?: string; // Message ID for pagination
    }
  ): Promise<ConversationChannelMessage[]> {
    return api.get<ConversationChannelMessage[]>(`/conversations/${conversationId}/messages`, {
      params: options as Record<string, string>,
      userId
    });
  }

  // Send a message to a conversation with optional role
  static async sendMessage(
    conversationId: string, 
    messageData: SendMessageDto, 
    userId: string,
    role: ChatRoleType = ChatRoleType.USER  // Default to USER role
  ): Promise<ConversationChannelMessage> {
    const data = { ...messageData, role };
    return api.post<ConversationChannelMessage>(`/conversations/${conversationId}/messages`, data, { userId });
  }

  // Edit a message
  static async editMessage(
    conversationId: string, 
    messageId: string, 
    content: string,
    userId: string,
    editReason?: string
  ): Promise<ConversationChannelMessage> {
    return api.put<ConversationChannelMessage>(
      `/conversations/${conversationId}/messages/${messageId}`, 
      { content, editReason },
      { userId }
    );
  }

  // Delete a message (soft delete)
  static async deleteMessage(conversationId: string, messageId: string, userId: string): Promise<{ success: boolean }> {
    return api.delete<{ success: boolean }>(
      `/conversations/${conversationId}/messages/${messageId}`,
      { userId }
    );
  }

  // Unsend a message (remove for everyone)
  static async unsendMessage(conversationId: string, messageId: string, userId: string): Promise<{ success: boolean }> {
    return api.delete<{ success: boolean }>(
      `/conversations/${conversationId}/messages/${messageId}/unsend`,
      { userId }
    );
  }

  // Get message edit history
  static async getMessageHistory(
    conversationId: string,
    messageId: string,
    userId: string
  ): Promise<ConversationChannelMessageEditHistory[]> {
    return api.get<ConversationChannelMessageEditHistory[]>(
      `/conversations/${conversationId}/messages/${messageId}/history`,
      { userId }
    );
  }

  // Send a message with file attachments
  static async sendMessageWithAttachments(
    conversationId: string,
    content: string,
    files: File[],
    userId: string,
    options?: {
      messageType?: MessageType;
      replyToId?: string;
      mentions?: MessageMentionDto[];
      role?: ChatRoleType;
    }
  ): Promise<ConversationChannelMessage> {
    // Create FormData object to send files
    const formData = new FormData();
    
    // Add message content and optional fields
    formData.append('content', content);
    
    if (options?.messageType) {
      formData.append('messageType', options.messageType);
    }
    
    if (options?.replyToId) {
      formData.append('replyToId', options.replyToId);
    }
    
    // Add mentions as JSON string if provided
    if (options?.mentions && options.mentions.length > 0) {
      formData.append('mentionsJson', JSON.stringify(options.mentions));
    }
    
    // Add files to form data
    files.forEach(file => {
      formData.append('files', file);
    });
    
    // Custom fetch options for FormData with files
    const fetchOptions: RequestInit = {
      method: 'POST',
      headers: {
        // Don't set Content-Type header, the browser will set it with the boundary for multipart/form-data
        'Authorization': `Bearer ${userId}`
      },
      body: formData
    };
    
    // Make the API call with custom fetch
    const url = `${api['baseUrl']}/conversations/${conversationId}/messages/with-attachments`;
    const response = await fetch(url, fetchOptions);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Failed to send message with attachments: ${response.status} ${response.statusText}. ${JSON.stringify(errorData)}`
      );
    }
    
    return await response.json();
  }
  
  // Add reaction to a message
  static async addReaction(
    conversationId: string,
    messageId: string,
    emoji: string,
    userId: string
  ): Promise<ConversationChannelMessageReaction> {
    return api.post<ConversationChannelMessageReaction>(
      `/conversations/${conversationId}/messages/${messageId}/reactions`,
      { emoji },
      { userId }
    );
  }
  
  // Remove reaction from a message
  static async removeReaction(
    conversationId: string,
    messageId: string,
    emoji: string,
    userId: string
  ): Promise<{ success: boolean }> {
    return api.delete<{ success: boolean }>(
      `/conversations/${conversationId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
      { userId }
    );
  }
  
  // Get all reactions for a message
  static async getReactions(
    conversationId: string,
    messageId: string,
    userId: string
  ): Promise<ConversationChannelMessageReaction[]> {
    return api.get<ConversationChannelMessageReaction[]>(
      `/conversations/${conversationId}/messages/${messageId}/reactions`,
      { userId }
    );
  }
} 