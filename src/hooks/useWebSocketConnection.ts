'use client';

import { useCallback, useEffect } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { WebSocketMessageType } from '@/types/messaging';

type UseWebSocketConnectionProps = {
  url?: string;
  autoConnect?: boolean;
  onMessage?: (message: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
  onTypingUpdate?: (conversationId: string, typingUsers: string[]) => void;
};

export function useWebSocketConnection({
  url = 'ws://localhost:3000/messaging',
  autoConnect = false,
  onMessage,
  onConnect,
  onDisconnect,
  onError,
  onTypingUpdate,
}: UseWebSocketConnectionProps = {}) {
  const {
    connect,
    disconnect,
    sendMessage,
    sendTypingStart,
    sendTypingStop,
    markMessagesRead,
    joinConversation,
    leaveConversation,
    isConnected,
    messages,
    lastMessage,
    connectionStatus,
    connectionError,
    clearMessages,
    setUserId,
    onMessageEvent,
    onConversationEvent,
    onTypingUpdate: registerTypingHandler
  } = useWebSocket();

  // Auto-connect if enabled
  useEffect(() => {
    if (autoConnect && url) {
      connect(url);
    }

    return () => {
      if (autoConnect) {
        disconnect();
      }
    };
  }, [autoConnect, url, connect, disconnect]);

  // Register event handlers
  useEffect(() => {
    // Register generic message handler for all message events
    if (onMessage) {
      onMessageEvent('message:new', onMessage);
      onMessageEvent('message:sent', onMessage);
      onMessageEvent('message:updated', onMessage);
      onMessageEvent('message:deleted', onMessage);
      onMessageEvent('message:unsent', onMessage);
      
      // Register handlers for new reaction events
      onMessageEvent('message:reaction:added', onMessage);
      onMessageEvent('message:reaction:removed', onMessage);
      
      // Register handler for mention events
      onMessageEvent('message:mention', onMessage);
    }
    
    // Register typing handler if provided
    if (onTypingUpdate) {
      registerTypingHandler('all', onTypingUpdate);
    }
    
    return () => {
      // Cleanup would be needed here if we implement offMessageEvent
    };
  }, [onMessage, onMessageEvent, onTypingUpdate, registerTypingHandler]);

  // Call onConnect callback when connection is established
  useEffect(() => {
    if (isConnected && onConnect) {
      onConnect();
    }
  }, [isConnected, onConnect]);

  // Call onDisconnect callback when connection is closed
  useEffect(() => {
    if (!isConnected && connectionStatus === 'disconnected' && onDisconnect) {
      onDisconnect();
    }
  }, [isConnected, connectionStatus, onDisconnect]);

  // Call onError callback when connection has an error
  useEffect(() => {
    if (connectionStatus === 'error' && connectionError && onError) {
      onError(connectionError);
    }
  }, [connectionStatus, connectionError, onError]);

  // Wrapper for sending typed messages
  const send = useCallback(
    (type: WebSocketMessageType, payload: any, conversationId: string) => {
      const message = { 
        type,
        content: payload.content,
        messageType: payload.messageType || 'text',
        metadata: payload.metadata || {}
      };
      sendMessage(conversationId, message);
    },
    [sendMessage]
  );

  // Wrapper for starting typing indicator
  const startTyping = useCallback(
    (conversationId: string) => {
      sendTypingStart(conversationId);
    },
    [sendTypingStart]
  );

  // Wrapper for stopping typing indicator
  const stopTyping = useCallback(
    (conversationId: string) => {
      sendTypingStop(conversationId);
    },
    [sendTypingStop]
  );

  // Wrapper for marking messages as read
  const markAsRead = useCallback(
    (conversationId: string) => {
      markMessagesRead(conversationId);
    },
    [markMessagesRead]
  );

  // Wrapper for joining a conversation
  const joinRoom = useCallback(
    (conversationId: string) => {
      joinConversation(conversationId);
    },
    [joinConversation]
  );

  // Wrapper for leaving a conversation
  const leaveRoom = useCallback(
    (conversationId: string) => {
      leaveConversation(conversationId);
    },
    [leaveConversation]
  );

  // Return onTypingUpdate function from the hook
  return {
    connect,
    disconnect,
    send,
    sendMessage,
    startTyping,
    stopTyping,
    markAsRead,
    joinRoom,
    leaveRoom,
    isConnected,
    messages,
    lastMessage,
    connectionStatus,
    connectionError,
    clearMessages,
    setUserId,
    onTypingUpdate: registerTypingHandler
  };
} 