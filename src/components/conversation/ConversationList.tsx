'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  UserProfile, 
  ConversationChannel, 
  ConversationType, 
  MessageType, 
  ChatRoleType,
  ConversationChannelMessageReaction,
  MessageMentionDto
} from '@/types/messaging';
import { ConversationService } from '@/lib/api/conversationService';
import { WebSocketService } from '@/lib/websocket/websocketService';

type ConversationListProps = {
  bots: UserProfile[];
  instanceId: string;
};

export default function ConversationList({ bots, instanceId }: ConversationListProps) {
  const [selectedBot, setSelectedBot] = useState<UserProfile | null>(null);
  const [conversations, setConversations] = useState<ConversationChannel[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  
  // Conversation management states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [conversationName, setConversationName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [availableMembers, setAvailableMembers] = useState<UserProfile[]>([]);
  
  // Track if conversations have been fetched to prevent loops
  const fetchedRef = useRef<boolean>(false);
  const [fetchTrigger, setFetchTrigger] = useState<number>(0);
  
  // Store current bot ID in a ref to access in event handlers
  const selectedBotRef = useRef<string | null>(null);
  const isConnectedRef = useRef<boolean>(false);
  
  // Add a ref to keep track of the selected conversation
  const selectedConversationRef = useRef<string | null>(null);
  
  // Update refs when state changes
  useEffect(() => {
    selectedBotRef.current = selectedBot?.userId || null;
    isConnectedRef.current = isConnected;
    selectedConversationRef.current = selectedConversation;
  }, [selectedBot, isConnected, selectedConversation]);
  
  // Create a WebSocketService instance for this component
  const wsServiceRef = useRef<WebSocketService | null>(null);
  
  // Initialize WebSocketService on component mount
  useEffect(() => {
    // Only initialize once
    if (!wsServiceRef.current) {
      console.log(`[${instanceId}] Initializing WebSocketService`);
      wsServiceRef.current = new WebSocketService(`ws://localhost:3000/messaging`);
    }
    
    // Set up event listeners
    const setupListeners = () => {
      if (!wsServiceRef.current) return;
      
      // Status change handler
      wsServiceRef.current.onStatusChange((status) => {
        console.log(`[${instanceId}] WebSocket status changed to: ${status}`);
        setConnectionStatus(status);
        setIsConnected(status === 'connected');
        
        if (status === 'connected' && selectedBotRef.current) {
          console.log(`[${instanceId}] Connected with bot ${selectedBotRef.current}`);
          setFetchTrigger(prev => prev + 1);
          
          // Automatically join all conversation rooms when we connect
          if (conversations.length > 0) {
            console.log(`[${instanceId}] Auto-joining all conversation rooms after connection`);
            conversations.forEach(conversation => {
              console.log(`[${instanceId}] Auto-joining conversation room: ${conversation.id}`);
              wsServiceRef.current?.joinConversation(conversation.id);
            });
          }
        }
      });
      
      // Message event handler
      wsServiceRef.current.onEventLog((events) => {
        const messageEvents = events.filter(e => e.type === 'message' && e.data?.received);
        if (messageEvents.length > 0) {
          const latestEvent = messageEvents[messageEvents.length - 1];
          const message = latestEvent.data?.message;
          
          if (message) {
            // Only add messages for the currently selected conversation
            if (selectedConversation && message.conversationId === selectedConversation) {
              console.log(`[${instanceId}] Received message for conversation ${message.conversationId}:`, message);
              setMessages(prev => {
                // Avoid duplicate messages
                if (prev.some(m => m.id === message.id)) {
                  return prev;
                }
                return [...prev, message];
              });
            }
          }
        }
      });
      
      // Update the WebSocket event handlers for message events
      wsServiceRef.current.onMessageEvent('message:new', (data) => {
        console.log(`[${instanceId}] Received message:new event:`, JSON.stringify(data, null, 2));
        
        // Extract the message object correctly based on the structure
        let message;
        if (data.message) {
          // Format: { message: {...}, conversationId: "...", senderId: "..." }
          message = data.message;
        } else {
          // Format: { id: "...", conversationId: "...", ... }
          message = data;
        }
        
        console.log(`[${instanceId}] Extracted message:`, JSON.stringify(message, null, 2));
        
        // Always update the conversation list when we get new messages
        if (message?.conversationId) {
          // Trigger a conversation list refresh to update unread counts, etc.
          setFetchTrigger(prev => prev + 1);
        }
        
        // Only add messages to the current view if they're for the selected conversation
        const currentSelectedConversation = selectedConversationRef.current;
        if (currentSelectedConversation && message && message.conversationId === currentSelectedConversation) {
          console.log(`[${instanceId}] Adding message to conversation ${currentSelectedConversation}`);
          
          setMessages(prev => {
            // Avoid duplicate messages
            if (prev.some(m => m.id === message.id)) {
              console.log(`[${instanceId}] Duplicate message detected, skipping`);
              return prev;
            }
            
            // Mark messages as read when receiving a new message
            if (wsServiceRef.current && isConnectedRef.current) {
              console.log(`[${instanceId}] Marking messages as read after receiving new message`);
              wsServiceRef.current.markMessagesRead(currentSelectedConversation);
            }
            
            console.log(`[${instanceId}] Added message to state:`, message.id);
            return [...prev, message];
          });
        } else {
          console.log(`[${instanceId}] Message not for current conversation, skipping display`);
          console.log(`Current selected conversation: ${currentSelectedConversation}, Message conversation: ${message?.conversationId}`);
        }
      });

      wsServiceRef.current.onMessageEvent('message:updated', (data) => {
        console.log(`[${instanceId}] Received message:updated event:`, data);
        
        // The message object should be in data.message
        const message = data.message || data;
        const currentSelectedConversation = selectedConversationRef.current;
        
        // Update the message in our state if it's for the current conversation
        if (currentSelectedConversation && message && message.conversationId === currentSelectedConversation) {
          setMessages(prev => 
            prev.map(m => m.id === message.id ? { ...m, ...message } : m)
          );
        }
      });

      wsServiceRef.current.onMessageEvent('message:deleted', (data) => {
        console.log(`[${instanceId}] Received message:deleted event:`, data);
        
        // The message ID should be in data.messageId
        const messageId = data.messageId || (data.message && data.message.id);
        const conversationId = data.conversationId || (data.message && data.message.conversationId);
        const currentSelectedConversation = selectedConversationRef.current;
        
        // Update the message in our state if it's for the current conversation
        if (currentSelectedConversation && messageId && conversationId === currentSelectedConversation) {
          setMessages(prev => 
            prev.map(m => m.id === messageId 
              ? { ...m, content: 'This message has been deleted', deletedAt: new Date().toISOString() } 
              : m
            )
          );
        }
      });

      wsServiceRef.current.onMessageEvent('message:unsent', (data) => {
        console.log(`[${instanceId}] Received message:unsent event:`, data);
        
        // The message ID should be in data.messageId
        const messageId = data.messageId || (data.message && data.message.id);
        const conversationId = data.conversationId || (data.message && data.message.conversationId);
        const currentSelectedConversation = selectedConversationRef.current;
        
        // Update the message in our state if it's for the current conversation
        if (currentSelectedConversation && messageId && conversationId === currentSelectedConversation) {
          setMessages(prev => 
            prev.map(m => m.id === messageId 
              ? { ...m, content: 'This message was unsent', unsentAt: new Date().toISOString() } 
              : m
            )
          );
        }
      });
      
      // Conversation event handlers
      wsServiceRef.current.onConversationEvent('conversation:updated', async (data) => {
        console.log(`[${instanceId}] Received conversation:updated event:`, JSON.stringify(data, null, 2));
        
        // Use refs to access the latest values
        if (selectedBotRef.current && isConnectedRef.current) {
          // The server sends the updated conversation in the 'conversation' property
          const updatedConversation = data.conversation || data;
          const updatedBy = data.updatedBy || data.userId;
          
          console.log(`[${instanceId}] Processing update for conversation:`, JSON.stringify(updatedConversation, null, 2));
          console.log(`[${instanceId}] Current conversations:`, conversations.map(c => ({ id: c.id, name: c.name })));
          
          // Check if we have a valid conversation object with an ID
          if (updatedConversation && updatedConversation.id) {
            console.log(`[${instanceId}] Updating conversation in state: ${updatedConversation.id}, name: ${updatedConversation.name}`);
            
            // Add system message about the conversation update
            const userName = updatedBy === selectedBotRef.current ? 'You' : getUserNameById(updatedBy);
            await addSystemMessage(updatedConversation.id, `${userName} updated the conversation details`);
            
            // Update the conversation in our state regardless of whether it's selected or not
            setConversations(prevConversations => {
              // Check if we already have this conversation
              const exists = prevConversations.some(c => c.id === updatedConversation.id);
              console.log(`[${instanceId}] Conversation exists in state: ${exists}`);
              
              if (exists) {
                console.log(`[${instanceId}] Updating existing conversation`);
                const updated = prevConversations.map(conv => 
                  conv.id === updatedConversation.id ? { ...conv, ...updatedConversation } : conv
                );
                console.log(`[${instanceId}] Updated conversations:`, updated.map(c => ({ id: c.id, name: c.name })));
                return updated;
              } else {
                // If conversation doesn't exist in our state, fetch all
                console.log(`[${instanceId}] Conversation not found in state, fetching all conversations`);
                fetchConversations();
                return prevConversations;
              }
            });
          } else {
            // Fallback to full refresh if we don't have proper data
            console.log(`[${instanceId}] Conversation update event missing ID, fetching all conversations`);
            fetchConversations();
          }
        } else {
          console.log(`[${instanceId}] Ignoring conversation:updated event - no bot selected or not connected`);
          console.log(`[${instanceId}] selectedBotRef.current:`, selectedBotRef.current);
          console.log(`[${instanceId}] isConnectedRef.current:`, isConnectedRef.current);
        }
      });
      
      wsServiceRef.current.onConversationEvent('conversation:member:added', async (data) => {
        console.log(`[${instanceId}] Received conversation:member:added event:`, data);
        
        // Use refs to access the latest values
        if (selectedBotRef.current && isConnectedRef.current) {
          const { conversationId, userId, addedBy } = data;
          
          // Get user names for the system message
          const addedUserName = getUserNameById(userId);
          const addedByName = addedBy === selectedBotRef.current ? 'You' : getUserNameById(addedBy);
          
          // Add system message
          if (userId === selectedBotRef.current) {
            await addSystemMessage(conversationId, `You were added to the conversation by ${addedByName}`);
          } else {
            await addSystemMessage(conversationId, `${addedUserName} was added to the conversation by ${addedByName}`);
          }
          
          // If the current user was added to a conversation, join the room
          if (userId === selectedBotRef.current && conversationId) {
            console.log(`[${instanceId}] Current user was added to conversation: ${conversationId}, joining room`);
            wsServiceRef.current?.joinConversation(conversationId);
            
            // Refresh conversations to include the new one
            fetchConversations();
          } else {
            // If another user was added to a conversation we're part of,
            // update that conversation in our state
            setConversations(prevConversations => {
              const conversation = prevConversations.find(c => c.id === conversationId);
              if (conversation) {
                // Update the member count
                return prevConversations.map(conv => 
                  conv.id === conversationId 
                    ? { ...conv, memberCount: (conv.memberCount || 0) + 1 } 
                    : conv
                );
              }
              return prevConversations;
            });
          }
        }
      });
      
      wsServiceRef.current.onConversationEvent('conversation:member:removed', async (data) => {
        console.log(`[${instanceId}] Received conversation:member:removed event:`, data);
        
        // Use refs to access the latest values
        if (selectedBotRef.current && isConnectedRef.current) {
          const { conversationId, userId, removedBy } = data;
          
          // Get user names for the system message
          const removedUserName = getUserNameById(userId);
          const removedByName = removedBy === selectedBotRef.current ? 'You' : getUserNameById(removedBy);
          
          // Add system message
          if (userId === selectedBotRef.current) {
            await addSystemMessage(conversationId, `You were removed from the conversation by ${removedByName}`);
          } else {
            await addSystemMessage(conversationId, `${removedUserName} was removed from the conversation by ${removedByName}`);
          }
          
          // If the current user was removed, deselect the conversation and refresh the list
          if (userId === selectedBotRef.current) {
            if (selectedConversation === conversationId) {
              console.log(`[${instanceId}] Current user was removed from the selected conversation`);
              setSelectedConversation(null);
            }
            
            // Remove the conversation from our state
            setConversations(prevConversations => 
              prevConversations.filter(c => c.id !== conversationId)
            );
          } else {
            // If another user was removed, update the member count
            setConversations(prevConversations => {
              const conversation = prevConversations.find(c => c.id === conversationId);
              if (conversation && conversation.memberCount > 0) {
                // Update the member count
                return prevConversations.map(conv => 
                  conv.id === conversationId 
                    ? { ...conv, memberCount: conv.memberCount - 1 } 
                    : conv
                );
              }
              return prevConversations;
            });
          }
        }
      });
      
      wsServiceRef.current.onConversationEvent('conversation:joined', async (data) => {
        console.log(`[${instanceId}] Received conversation:joined event:`, data);
        
        // Use refs to access the latest values
        if (selectedBotRef.current && isConnectedRef.current) {
          const { conversationId, userId } = data;
          
          // Get user name for the system message
          const userName = userId === selectedBotRef.current ? 'You' : getUserNameById(userId);
          
          // Add system message
          await addSystemMessage(conversationId, `${userName} joined the conversation`);
          
          // Update the conversation in our state
          setConversations(prevConversations => {
            const conversation = prevConversations.find(c => c.id === conversationId);
            if (conversation) {
              // Update the member count
              return prevConversations.map(conv => 
                conv.id === conversationId 
                  ? { ...conv, memberCount: (conv.memberCount || 0) + 1 } 
                  : conv
              );
            }
            return prevConversations;
          });
        }
      });
      
      wsServiceRef.current.onConversationEvent('conversation:left', async (data) => {
        console.log(`[${instanceId}] Received conversation:left event:`, data);
        
        // Use refs to access the latest values
        if (selectedBotRef.current && isConnectedRef.current) {
          const { conversationId, userId } = data;
          
          // Get user name for the system message
          const userName = userId === selectedBotRef.current ? 'You' : getUserNameById(userId);
          
          // Add system message
          await addSystemMessage(conversationId, `${userName} left the conversation`);
          
          // If the current user left, update our state
          if (userId === selectedBotRef.current && selectedConversation === conversationId) {
            console.log(`[${instanceId}] Current user left the conversation`);
            setSelectedConversation(null);
            setConversations(prevConversations => 
              prevConversations.filter(c => c.id !== conversationId)
            );
          } else {
            // If another user left, update the member count
            setConversations(prevConversations => {
              const conversation = prevConversations.find(c => c.id === conversationId);
              if (conversation && conversation.memberCount > 0) {
                // Update the member count
                return prevConversations.map(conv => 
                  conv.id === conversationId 
                    ? { ...conv, memberCount: conv.memberCount - 1 } 
                    : conv
                );
              }
              return prevConversations;
            });
          }
        }
      });
      
      // Also listen for new conversations
      wsServiceRef.current.onConversationEvent('conversation:new', (data) => {
        console.log(`[${instanceId}] Received conversation:new event:`, JSON.stringify(data, null, 2));
        
        // Use refs to access the latest values
        if (selectedBotRef.current && isConnectedRef.current) {
          const newConversation = data.conversation || data;
          
          console.log(`[${instanceId}] Processing new conversation:`, JSON.stringify(newConversation, null, 2));
          console.log(`[${instanceId}] Current user ID:`, selectedBotRef.current);
          
          if (newConversation && newConversation.id) {
            const isMember = true;
            
            if (isMember) {
              // Join the new conversation room
              console.log(`[${instanceId}] Joining new conversation room: ${newConversation.id}`);
              wsServiceRef.current?.joinConversation(newConversation.id);
              
              // Add the new conversation to our state
              setConversations(prevConversations => {
                // Check if we already have this conversation
                const exists = prevConversations.some(c => c.id === newConversation.id);
                console.log(`[${instanceId}] Conversation already exists:`, exists);
                
                if (exists) {
                  return prevConversations;
                }
                
                console.log(`[${instanceId}] Adding new conversation to state:`, newConversation.id);
                return [...prevConversations, newConversation];
              });
            } else {
              console.log(`[${instanceId}] Current user is not a member of the new conversation, ignoring`);
            }
          } else {
            // Fallback to full refresh
            console.log(`[${instanceId}] Invalid conversation data, fetching all conversations`);
            fetchConversations();
          }
        } else {
          console.log(`[${instanceId}] Ignoring conversation:new event - no bot selected or not connected`);
          console.log(`[${instanceId}] selectedBotRef.current:`, selectedBotRef.current);
          console.log(`[${instanceId}] isConnectedRef.current:`, isConnectedRef.current);
        }
      });
    };
    
    setupListeners();
    
    // Clean up on unmount
    return () => {
      if (wsServiceRef.current) {
        wsServiceRef.current.disconnect();
      }
    };
  }, [instanceId]); // Only depend on instanceId to prevent recreation
  
  // Verify that conversation event handlers are registered
  useEffect(() => {
    if (wsServiceRef.current && isConnected) {
      // Force re-register the conversation:updated handler to ensure it's working
      console.log(`[${instanceId}] Re-registering conversation:updated handler`);
      
      wsServiceRef.current.onConversationEvent('conversation:updated', (data) => {
        console.log(`[${instanceId}] VERIFIED HANDLER: Received conversation:updated event:`, JSON.stringify(data, null, 2));
        
        // Use refs to access the latest values
        if (selectedBotRef.current && isConnectedRef.current) {
          // The server sends the updated conversation in the 'conversation' property
          const updatedConversation = data.conversation || data;
          
          // Check if we have a valid conversation object with an ID
          if (updatedConversation && updatedConversation.id) {
            console.log(`[${instanceId}] VERIFIED HANDLER: Updating conversation: ${updatedConversation.id}, name: ${updatedConversation.name}`);
            
            // Update the conversation in our state regardless of whether it's selected or not
            setConversations(prevConversations => {
              return prevConversations.map(conv => 
                conv.id === updatedConversation.id ? { ...conv, ...updatedConversation } : conv
              );
            });
          }
        }
      });
    }
  }, [instanceId, isConnected]);
  
  // Handle bot selection
  const handleBotChange = (botId: string) => {
    // Reset fetch state
    fetchedRef.current = false;
    
    // Disconnect current bot if any
    if (isConnected && wsServiceRef.current) {
      wsServiceRef.current.disconnect();
      // Wait a bit before reconnecting
      setTimeout(() => {
        connectBot(botId);
      }, 300);
    } else {
      connectBot(botId);
    }
  };
  
  // Connect bot helper function
  const connectBot = (botId: string) => {
    const bot = bots.find(b => b.userId === botId) || null;
    setSelectedBot(bot);
    setConversations([]);
    setSelectedConversation(null);
    setMessages([]);
    setError(null);
    
    if (bot && wsServiceRef.current) {
      console.log(`[${instanceId}] Connecting bot: ${bot.userId}`);
      
      try {
        // Set user ID and connect
        wsServiceRef.current.setUserId(bot.userId);
        console.log(`[${instanceId}] Set userId to ${bot.userId}, connecting to WebSocket`);
        
        wsServiceRef.current.connect().catch(err => {
          console.error(`[${instanceId}] Connection error:`, err);
          setError(`Connection error: ${err.message}`);
        });
      } catch (err) {
        console.error(`[${instanceId}] Error during connection:`, err);
        setError(`Connection error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!selectedBot || !isConnected) {
      console.log(`[${instanceId}] Cannot fetch conversations - bot not selected or not connected`);
      console.log(`[${instanceId}] selectedBot:`, selectedBot?.userId);
      console.log(`[${instanceId}] isConnected:`, isConnected);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`[${instanceId}] Fetching conversations for ${selectedBot.userId}`);
      const userConversations = await ConversationService.getConversations(selectedBot.userId);
      console.log(`[${instanceId}] Fetched ${userConversations.length} conversations:`, userConversations.map(c => ({ id: c.id, name: c.name })));
      setConversations(userConversations);
      
      // Join all conversation rooms to receive updates for all conversations
      if (wsServiceRef.current) {
        console.log(`[${instanceId}] Joining all conversation rooms to receive updates`);
        userConversations.forEach(conversation => {
          console.log(`[${instanceId}] Joining conversation room: ${conversation.id}`);
          wsServiceRef.current?.joinConversation(conversation.id);
        });
        
        // Log the current conversation rooms we've joined
        console.log(`[${instanceId}] Joined all conversation rooms`);
      } else {
        console.log(`[${instanceId}] WebSocket service not available, cannot join conversation rooms`);
      }
      
      // Mark as fetched to prevent loops
      fetchedRef.current = true;
    } catch (err) {
      console.error(`[${instanceId}] Failed to fetch conversations:`, err);
      setError('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, [selectedBot, isConnected, instanceId]);

  // Effect to fetch conversations when connection is established
  useEffect(() => {
    if (selectedBot && isConnected && !fetchedRef.current) {
      console.log(`[${instanceId}] Connection established, fetching conversations`);
      fetchConversations();
    }
  }, [selectedBot, isConnected, fetchTrigger, fetchConversations, instanceId]);

  // Reset fetch state when bot changes or disconnects
  useEffect(() => {
    if (!isConnected) {
      fetchedRef.current = false;
    }
  }, [isConnected]);

  // Message input state
  const [messageText, setMessageText] = useState('');

  // Add a ref to track the interval for marking messages as read
  const markReadIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Set up interval to mark messages as read periodically
  useEffect(() => {
    // Clear any existing interval
    if (markReadIntervalRef.current) {
      clearInterval(markReadIntervalRef.current);
      markReadIntervalRef.current = null;
    }
    
    // If we have a selected conversation and we're connected, mark messages as read once
    if (selectedConversation && isConnected && wsServiceRef.current && selectedBot) {
      // Mark messages as read immediately
      wsServiceRef.current.markMessagesRead(selectedConversation);
    }
    
    // Clean up interval on unmount or when selected conversation changes
    return () => {
      if (markReadIntervalRef.current) {
        clearInterval(markReadIntervalRef.current);
        markReadIntervalRef.current = null;
      }
    };
  }, [selectedConversation, isConnected, selectedBot, instanceId]);

  // Select a conversation
  const handleSelectConversation = async (conversationId: string) => {
    if (!selectedBot || !isConnected) return;
    
    setSelectedConversation(conversationId);
    
    try {
      console.log(`[${instanceId}] Selected conversation: ${conversationId}`);
      
      // Fetch fresh conversation details to get latest member read states
      const conversationDetails = await ConversationService.getConversation(conversationId, selectedBot.userId);
      console.log(`[${instanceId}] Fetched conversation details:`, conversationDetails);
      
      // Update the conversation in our local state
      setConversations(prev => 
        prev.map(c => c.id === conversationId ? conversationDetails : c)
      );
      
      // Now load messages with the fresh conversation details
      await loadMessages(conversationId, conversationDetails);
      
      // Mark messages as read when selecting a conversation
      if (wsServiceRef.current) {
        console.log(`[${instanceId}] Marking messages as read after selecting conversation`);
        wsServiceRef.current.markMessagesRead(conversationId);
      }
    } catch (err) {
      console.error(`[${instanceId}] Failed to load conversation:`, err);
      setError(`Failed to load conversation: ${String(err)}`);
    }
  };

  // Load messages for a conversation
  const loadMessages = async (conversationId: string, conversationDetails?: ConversationChannel) => {
    if (!selectedBot || !isConnected) return;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`[${instanceId}] Loading messages for conversation ${conversationId}`);
      
      // Get conversation details to access member data
      const conversation = conversationDetails || conversations.find(c => c.id === conversationId);
      if (!conversation) {
        console.error(`[${instanceId}] Cannot find conversation ${conversationId}`);
        return;
      }
      
      // Join the conversation room if not already joined
      if (wsServiceRef.current && isConnected) {
        console.log(`[${instanceId}] Joining selected conversation room: ${conversationId}`);
        wsServiceRef.current.joinConversation(conversationId);
      }
      
      // Initialize read receipts from member data
      if (conversation.members && conversation.members.length > 0) {
        console.log(`[${instanceId}] Found ${conversation.members.length} conversation members`);
        
        const memberReadReceipts: Record<string, { userId: string, timestamp: string }> = {};
        
        conversation.members.forEach(member => {
          console.log(`[${instanceId}] Processing member: ${member.userId}, lastReadAt: ${member.lastReadAt || 'undefined'}`);
          
          // Only track read receipts for other users (not the current user)
          if (member.userId !== selectedBot.userId && member.lastReadAt) {
            // Adjust the timestamp by subtracting 4 hours
            const adjustedTimestamp = adjustTimestamp(member.lastReadAt);
            memberReadReceipts[member.userId] = {
              userId: member.userId,
              timestamp: adjustedTimestamp
            };
            console.log(`[${instanceId}] Added read receipt for ${member.userId} at ${member.lastReadAt} (adjusted to ${adjustedTimestamp})`);
          }
        });
        
        // Log all the read receipts we found
        console.log(`[${instanceId}] Initialized ${Object.keys(memberReadReceipts).length} read receipts:`, 
          Object.entries(memberReadReceipts).map(([userId, receipt]) => ({
            userId,
            name: getUserName(userId),
            timestamp: receipt.timestamp
          }))
        );
        
        // Update read receipts state
        setReadReceipts(memberReadReceipts);
      } else {
        console.log(`[${instanceId}] No members found in conversation ${conversationId}`);
        setReadReceipts({});
      }
      
      // Load messages
      const conversationMessages = await ConversationService.getMessages(
        conversationId,
        selectedBot.userId,
        { limit: 50 } // Load last 50 messages
      );
      
      console.log(`[${instanceId}] Loaded ${conversationMessages.length} messages`);
      setMessages(conversationMessages);
    } catch (err) {
      console.error(`[${instanceId}] Failed to load messages:`, err);
      setError('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  // Add state for replying to messages
  const [replyToMessage, setReplyToMessage] = useState<any | null>(null);

  // Start replying to a message
  const handleReplyToMessage = (message: any) => {
    setReplyToMessage(message);
    // Focus the message input
    setTimeout(() => {
      const messageInput = document.getElementById(`message-input-${instanceId}`);
      if (messageInput) {
        messageInput.focus();
      }
    }, 0);
  };

  // Cancel replying to a message
  const handleCancelReply = () => {
    setReplyToMessage(null);
  };

  // File upload states
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentPreviews, setAttachmentPreviews] = useState<{ name: string; url: string; type: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      setAttachments(prev => [...prev, ...selectedFiles]);
      
      // Generate previews for image files
      selectedFiles.forEach(file => {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => {
            setAttachmentPreviews(prev => [...prev, {
              name: file.name,
              url: e.target?.result as string,
              type: file.type
            }]);
          };
          reader.readAsDataURL(file);
        } else {
          // Generic preview for non-image files
          setAttachmentPreviews(prev => [...prev, {
            name: file.name,
            url: '',
            type: file.type
          }]);
        }
      });
      
      // Clear the file input for next selection
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Remove an attachment
  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
    setAttachmentPreviews(prev => prev.filter((_, i) => i !== index));
  };

  // State for @mentions
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionSuggestions, setMentionSuggestions] = useState<UserProfile[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [mentions, setMentions] = useState<MessageMentionDto[]>([]);
  const messageInputRef = useRef<HTMLInputElement>(null);

  // Handle message input changes with @mention detection
  const handleMessageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setMessageText(newValue);
    
    // Check if we're typing an @mention
    const cursorPosition = e.target.selectionStart || 0;
    const textBeforeCursor = newValue.slice(0, cursorPosition);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (mentionMatch) {
      const query = mentionMatch[1].toLowerCase();
      setMentionQuery(query);
      
      // Filter bots for mention suggestions
      const filteredSuggestions = bots.filter(bot => 
        bot.firstName.toLowerCase().includes(query) || 
        bot.lastName.toLowerCase().includes(query) ||
        bot.handle.toLowerCase().includes(query)
      );
      
      setMentionSuggestions(filteredSuggestions);
      setShowMentionSuggestions(true);
      setActiveSuggestionIndex(0);
    } else {
      setShowMentionSuggestions(false);
    }
    
    // Update typing state
    if (!isTyping) {
      setIsTyping(true);
      debouncedSendTypingStart(selectedConversation!);
    }
    
    // Clear any existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set a timeout to stop typing indicator after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      if (wsServiceRef.current && isConnected && selectedConversation) {
        console.log(`[${instanceId}] Sending typing:stop event after inactivity`);
        wsServiceRef.current.sendTypingStop(selectedConversation);
        setIsTyping(false);
      }
    }, 3000);
  };

  // Handle key navigation in mention suggestions
  const handleMessageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showMentionSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestionIndex(prev => 
          prev < mentionSuggestions.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestionIndex(prev => prev > 0 ? prev - 1 : 0);
      } else if (e.key === 'Enter' && mentionSuggestions.length > 0) {
        e.preventDefault();
        handleSelectMention(mentionSuggestions[activeSuggestionIndex]);
      } else if (e.key === 'Escape') {
        setShowMentionSuggestions(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle selecting a mention suggestion
  const handleSelectMention = (user: UserProfile) => {
    if (!messageInputRef.current) return;
    
    const cursorPosition = messageInputRef.current.selectionStart || 0;
    const textBeforeCursor = messageText.slice(0, cursorPosition);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (mentionMatch) {
      const mentionStart = mentionMatch.index!;
      const mentionEnd = mentionStart + mentionMatch[0].length;
      const mentionText = `@${user.handle}`;
      
      // Update message text with the mention
      const newMessageText = 
        messageText.slice(0, mentionStart) + 
        mentionText + 
        messageText.slice(mentionEnd);
      
      setMessageText(newMessageText);
      
      // Create mention object for sending with message
      const newMention: MessageMentionDto = {
        userId: user.userId,
        startIndex: mentionStart,
        endIndex: mentionStart + mentionText.length,
        mentionText
      };
      
      // Add to mentions array
      setMentions(prev => [...prev, newMention]);
      
      // Hide suggestion list
      setShowMentionSuggestions(false);
      
      // Set cursor position after the mention
      setTimeout(() => {
        if (messageInputRef.current) {
          messageInputRef.current.focus();
          messageInputRef.current.selectionStart = mentionStart + mentionText.length;
          messageInputRef.current.selectionEnd = mentionStart + mentionText.length;
        }
      }, 0);
    }
  };

  // Modify handleSendMessage to include mentions
  const handleSendMessage = async () => {
    if (!messageText.trim() && attachments.length === 0 || !selectedConversation || !selectedBot) {
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      if (attachments.length > 0) {
        // Send with attachments via HTTP API
        await ConversationService.sendMessageWithAttachments(
          selectedConversation,
          messageText,
          attachments,
          selectedBot.userId,
          {
            replyToId: replyToMessage?.id,
            mentions: mentions.length > 0 ? mentions : undefined
          }
        );
        
        // Clear attachments after sending
        setAttachments([]);
        setAttachmentPreviews([]);
      } else {
        // Send regular text message via HTTP API
        await ConversationService.sendMessage(
          selectedConversation,
          {
            content: messageText,
            messageType: MessageType.TEXT,
            replyToId: replyToMessage?.id,
            mentions: mentions.length > 0 ? mentions : undefined
          },
          selectedBot.userId
        );
      }
      
      // Clear input, mentions and reply state
      setMessageText('');
      setMentions([]);
      setReplyToMessage(null);
    } catch (err) {
      console.error('Failed to send message:', err);
      setError('Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  // Disconnect function
  const handleDisconnect = () => {
    if (wsServiceRef.current) {
      wsServiceRef.current.disconnect();
    }
    setSelectedBot(null);
    setConversations([]);
    setSelectedConversation(null);
    setMessages([]);
  };

  // Add state for tracking read receipts
  const [readReceipts, setReadReceipts] = useState<Record<string, { userId: string, timestamp: string }>>({}); 

  // Helper function to get user name from userId
  const getUserName = (userId: string) => {
    const bot = bots.find(b => b.userId === userId);
    return bot ? `${bot.firstName}` : 'Unknown';
  };

  // Helper function to get user name by ID (for system messages)
  const getUserNameById = (userId: string) => {
    const bot = bots.find(b => b.userId === userId);
    return bot ? `${bot.firstName} ${bot.lastName}` : 'Unknown User';
  };

  // Set up handler for message:read events
  useEffect(() => {
    if (wsServiceRef.current && isConnected && selectedConversation) {
      // Listen for read receipts
      wsServiceRef.current.onMessageEvent('message:read', (data) => {
        console.log(`[${instanceId}] Received message:read event:`, JSON.stringify(data, null, 2));
        
        const { conversationId, userId, timestamp } = data;
        
        // Only update read receipts for the current conversation
        if (conversationId === selectedConversation && userId !== selectedBot?.userId) {
          console.log(`[${instanceId}] Updating read receipt for user ${userId} at ${timestamp}`);
          
          // Merge with existing read receipts instead of overwriting
          setReadReceipts(prev => {
            const existingTimestamp = prev[userId]?.timestamp;
            const newTimestamp = timestamp || new Date().toISOString();
            // Adjust the new timestamp by subtracting 4 hours
            const adjustedTimestamp = adjustTimestamp(newTimestamp);
            
            // Only update if the new timestamp is more recent
            if (!existingTimestamp || new Date(adjustedTimestamp) > new Date(existingTimestamp)) {
              console.log(`[${instanceId}] Updating read receipt for ${userId}: ${existingTimestamp || 'none'} → ${adjustedTimestamp} (original: ${newTimestamp})`);
              
              return {
                ...prev,
                [userId]: { userId, timestamp: adjustedTimestamp }
              };
            } else {
              console.log(`[${instanceId}] Ignoring older read receipt for ${userId}`);
              return prev;
            }
          });
        } else {
          console.log(`[${instanceId}] Ignoring read receipt: not for current conversation or from current user`);
        }
      });
    }
    
    // Clear read receipts when conversation changes
    return () => {
      setReadReceipts({});
    };
  }, [wsServiceRef, isConnected, selectedConversation, instanceId, selectedBot]);

  // Helper function to format time
  const formatTime = (timestamp: string) => {
    if (!timestamp) return '';
    
    try {
      // Parse the UTC timestamp correctly
      const date = new Date(timestamp);
      
      // Display as-is without any timezone conversion (preserve UTC time)
      // The timestamp already contains the correct time from the server
      return new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC'  // Explicitly use UTC to match the timestamp
      }).format(date);
    } catch (err) {
      console.error(`[${instanceId}] Error formatting time:`, err);
      return timestamp;
    }
  };

  // Helper function to adjust lastReadAt and lastMessageAt timestamps
  // which are 4 hours ahead of message timestamps
  const adjustTimestamp = (timestamp: string): string => {
    if (!timestamp) return '';
    
    try {
      // Parse the timestamp
      const date = new Date(timestamp);
      // Subtract 4 hours
      date.setHours(date.getHours() - 4);
      return date.toISOString();
    } catch (err) {
      console.error(`[${instanceId}] Error adjusting timestamp:`, err);
      return timestamp;
    }
  };

  // Helper function to find the last message a user has read based on timestamp
  const findLastReadMessageIndex = (messages: any[], userId: string, readTimestamp: string) => {
    // The readTimestamp is already adjusted by the time it gets here
    const readTime = new Date(readTimestamp).getTime();
    
    // Find the last message that was created before the read timestamp
    for (let i = messages.length - 1; i >= 0; i--) {
      // Message timestamps are correct, no need to adjust
      const messageTime = new Date(messages[i].createdAt).getTime();
      if (messageTime <= readTime) {
        return i;
      }
    }
    
    return -1; // No messages found before the read timestamp
  };
  
  // Process messages and read receipts to determine where to show read indicators
  const processedMessages = useMemo(() => {
    if (!messages.length) return [];
    
    // Clone messages to avoid mutating the original array
    const result = [...messages];
    
    // Add read receipt indicators at appropriate positions
    Object.values(readReceipts).forEach(receipt => {
      const index = findLastReadMessageIndex(messages, receipt.userId, receipt.timestamp);
      if (index >= 0) {
        // Insert a read receipt after this message if one doesn't exist already
        if (!result[index].readReceipts) {
          result[index] = {
            ...result[index],
            readReceipts: []
          };
        }
        
        // Add this user to the read receipts for this message
        result[index].readReceipts.push(receipt);
      }
    });
    
    return result;
  }, [messages, readReceipts]);
  
  // Add state for typing users
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Set up typing indicator event handler
  useEffect(() => {
    if (wsServiceRef.current && isConnected && selectedConversation) {
      // Register typing update handler
      wsServiceRef.current.onTypingUpdate(selectedConversation, (conversationId, typingUserIds) => {
        if (conversationId === selectedConversation) {
          // Filter out the current user
          const otherTypingUsers = typingUserIds.filter(id => id !== selectedBot?.userId);
          setTypingUsers(otherTypingUsers);
        }
      });
    }
    
    return () => {
      // No cleanup needed as the WebSocketService handles this
    };
  }, [wsServiceRef, isConnected, selectedConversation, selectedBot]);
  
  // Add state and refs for typing indicator
  const [isTyping, setIsTyping] = useState(false);
  const lastTypingEventRef = useRef<number>(0);
  
  // Debounced function to send typing start event
  const debouncedSendTypingStart = useCallback((conversationId: string) => {
    // Only send typing event if it's been more than 3 seconds since the last one
    const now = Date.now();
    if (now - lastTypingEventRef.current > 3000) {
      if (wsServiceRef.current && isConnected && selectedConversation) {
        console.log(`[${instanceId}] Sending typing:start event (debounced)`);
        wsServiceRef.current.sendTypingStart(conversationId);
        lastTypingEventRef.current = now;
      }
    }
  }, [isConnected, selectedConversation, instanceId]);

  // Update focus and blur handlers
  const handleMessageInputFocus = () => {
    // Only send typing event if there's text in the input
    if (messageText.trim() && wsServiceRef.current && isConnected && selectedConversation) {
      debouncedSendTypingStart(selectedConversation);
    }
  };

  const handleMessageInputBlur = () => {
    // Stop typing when input loses focus
    if (isTyping && wsServiceRef.current && isConnected && selectedConversation) {
      console.log(`[${instanceId}] Sending typing:stop event on blur`);
      wsServiceRef.current.sendTypingStop(selectedConversation);
      setIsTyping(false);
    }
  };

  // Add missing state variables
  const [messageActionsId, setMessageActionsId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editMessageText, setEditMessageText] = useState('');

  // Add missing debug function
  const logDebugInfo = () => {
    console.log(`[${instanceId}] Debug Information:`);
    console.log('Selected Bot:', selectedBot);
    console.log('Connection Status:', connectionStatus);
    console.log('Is Connected:', isConnected);
    console.log('Selected Conversation:', selectedConversation);
    console.log('Conversations:', conversations);
    console.log('Messages:', messages);
    console.log('WebSocket Service:', wsServiceRef.current);
    console.log('Read Receipts:', readReceipts);
  };

  // Add missing modal functions
  const openCreateConversationModal = () => {
    console.log(`[${instanceId}] Opening create conversation modal`);
    setConversationName('');
    setSelectedMembers([]);
    setShowCreateModal(true);
    console.log(`[${instanceId}] showCreateModal set to:`, true);
  };

  const openEditConversationModal = () => {
    const conversation = conversations.find(c => c.id === selectedConversation);
    if (conversation) {
      setConversationName(conversation.name || '');
      setShowEditModal(true);
    }
  };

  // Implement Edit Conversation Modal
  const handleUpdateConversation = async () => {
    if (!selectedBot || !selectedConversation) return;
    
    if (!conversationName.trim()) {
      setError('Conversation name cannot be empty');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Update the conversation
      await ConversationService.updateConversation(
        selectedConversation,
        { name: conversationName },
        selectedBot.userId
      );
      
      // Update local state
      setConversations(prev => prev.map(conv => 
        conv.id === selectedConversation 
          ? { ...conv, name: conversationName } 
          : conv
      ));
      
      // Close the modal
      setShowEditModal(false);
      
      // Add system message
      await addSystemMessage(
        selectedConversation, 
        `You updated the conversation name to "${conversationName}"`
      );
      
      console.log(`[${instanceId}] Conversation updated successfully`);
    } catch (err) {
      console.error('Failed to update conversation:', err);
      setError('Failed to update conversation');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to handle adding members to a conversation
  const handleAddMember = async (memberId: string) => {
    if (!selectedBot || !selectedConversation) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Add the member to the conversation
      await ConversationService.addMember(
        selectedConversation,
        memberId,
        selectedBot.userId
      );
      
      // Update local state
      setSelectedMembers(prev => [...prev, memberId]);
      
      // Refresh the conversation to get updated members
      const conversationDetails = await ConversationService.getConversation(
        selectedConversation,
        selectedBot.userId
      );
      
      setConversations(prev => prev.map(conv => 
        conv.id === selectedConversation ? conversationDetails : conv
      ));
      
      // Add system message
      const memberName = getUserNameById(memberId);
      await addSystemMessage(
        selectedConversation,
        `You added ${memberName} to the conversation`
      );
      
      console.log(`[${instanceId}] Member added successfully: ${memberId}`);
    } catch (err) {
      console.error('Failed to add member:', err);
      setError('Failed to add member');
    } finally {
      setLoading(false);
    }
  };
  
  // Helper function to handle removing members from a conversation
  const handleRemoveMember = async (memberId: string) => {
    if (!selectedBot || !selectedConversation) return;
    
    // Don't remove yourself
    if (memberId === selectedBot.userId) {
      setError('You cannot remove yourself from the conversation');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Remove the member from the conversation
      await ConversationService.removeMember(
        selectedConversation,
        memberId,
        selectedBot.userId
      );
      
      // Update local state
      setSelectedMembers(prev => prev.filter(id => id !== memberId));
      
      // Refresh the conversation to get updated members
      const conversationDetails = await ConversationService.getConversation(
        selectedConversation,
        selectedBot.userId
      );
      
      setConversations(prev => prev.map(conv => 
        conv.id === selectedConversation ? conversationDetails : conv
      ));
      
      // Add system message
      const memberName = getUserNameById(memberId);
      await addSystemMessage(
        selectedConversation,
        `You removed ${memberName} from the conversation`
      );
      
      console.log(`[${instanceId}] Member removed successfully: ${memberId}`);
    } catch (err) {
      console.error('Failed to remove member:', err);
      setError('Failed to remove member');
    } finally {
      setLoading(false);
    }
  };

  // Update the openMembersModal function
  const openMembersModal = () => {
    const conversation = conversations.find(c => c.id === selectedConversation);
    if (conversation && conversation.members) {
      // Set selected members to current members
      setSelectedMembers(conversation.members.map(m => m.userId));
      // Set available members to all bots
      setAvailableMembers(bots);
      setShowMembersModal(true);
    }
  };

  // Add missing conversation functions
  const handleLeaveConversation = async () => {
    if (!selectedConversation || !selectedBot) return;
    
    if (!confirm('Are you sure you want to leave this conversation?')) {
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      await ConversationService.leaveConversation(
        selectedConversation,
        selectedBot.userId
      );
      
      // Remove the conversation from our state
      setConversations(prev => prev.filter(c => c.id !== selectedConversation));
      setSelectedConversation(null);
    } catch (err) {
      console.error('Failed to leave conversation:', err);
      setError('Failed to leave conversation');
    } finally {
      setLoading(false);
    }
  };

  // Add missing message editing functions
  const handleStartEditMessage = (message: any) => {
    // Can only edit your own messages
    if (message.senderId !== selectedBot?.userId) return;
    
    setEditingMessageId(message.id);
    setEditMessageText(message.content);
  };

  const handleCancelEditMessage = () => {
    setEditingMessageId(null);
    setEditMessageText('');
  };

  const handleSaveEditMessage = async () => {
    if (!editingMessageId || !selectedBot || !selectedConversation) return;
    
    if (!editMessageText.trim()) {
      setError('Message cannot be empty');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      await ConversationService.editMessage(
        selectedConversation,
        editingMessageId,
        editMessageText,
        selectedBot.userId
      );
      
      // Update the message in our local state
      setMessages(prev => 
        prev.map(msg => 
          msg.id === editingMessageId 
            ? { ...msg, content: editMessageText, editedAt: new Date().toISOString() } 
            : msg
        )
      );
      
      // Clear editing state
      setEditingMessageId(null);
      setEditMessageText('');
    } catch (err) {
      console.error('Failed to edit message:', err);
      setError('Failed to edit message');
    } finally {
      setLoading(false);
    }
  };

  // Add missing message unsending function
  const handleUnsendMessage = async (messageId: string) => {
    if (!selectedBot || !selectedConversation) return;
    
    if (!confirm('Are you sure you want to unsend this message?')) {
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      await ConversationService.unsendMessage(
        selectedConversation,
        messageId,
        selectedBot.userId
      );
      
      // Update the message in our local state
      setMessages(prev => 
        prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, content: 'This message was unsent', unsentAt: new Date().toISOString() } 
            : msg
        )
      );
      
      // Clear reply state
      setReplyToMessage(null);
    } catch (err) {
      console.error('Failed to unsend message:', err);
      setError('Failed to unsend message');
    } finally {
      setLoading(false);
    }
  };

  // Add missing message deleting function
  const handleDeleteMessage = async (messageId: string) => {
    if (!selectedBot || !selectedConversation) return;
    
    if (!confirm('Are you sure you want to delete this message?')) {
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      await ConversationService.deleteMessage(
        selectedConversation,
        messageId,
        selectedBot.userId
      );
      
      // For the local state, we keep the original content but mark it as deleted
      // The rendering logic will handle showing different text for the sender vs other users
      setMessages(prev => 
        prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, deletedAt: new Date().toISOString() } 
            : msg
        )
      );
      
      // Clear reply state if we're replying to this message
      if (replyToMessage?.id === messageId) {
        setReplyToMessage(null);
      }
      
      console.log(`[${instanceId}] Message ${messageId} marked as deleted`);
    } catch (err) {
      console.error('Failed to delete message:', err);
      setError('Failed to delete message');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to add a system message that persists to the backend
  const addSystemMessage = async (conversationId: string, content: string) => {
    if (!selectedBot || !conversationId) return;
    
    try {
      // Use standard sendMessage but specify SYSTEM role
      console.log(`[${instanceId}] Sending system message: ${content}`);
      
      await ConversationService.sendMessage(
        conversationId,
        {
          content,
          messageType: MessageType.TEXT
        },
        selectedBot.userId,
        ChatRoleType.SYSTEM  // Explicitly set the role to SYSTEM
      );
      
      // The message will be received via WebSocket, so no need to update state manually
      console.log(`[${instanceId}] System message sent successfully`);
    } catch (err) {
      console.error(`[${instanceId}] Failed to send system message:`, err);
    }
  };

  // State for message reactions
  const [messageReactions, setMessageReactions] = useState<Record<string, ConversationChannelMessageReaction[]>>({});
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);

  // Common emoji reactions
  const commonEmojis = ['👍', '👎', '❤️', '😂', '😮', '😢', '🔥', '🎉'];

  // Helper function to load reactions for a message
  const loadMessageReactions = async (messageId: string) => {
    if (!selectedBot || !selectedConversation) return;
    
    try {
      const reactions = await ConversationService.getReactions(
        selectedConversation,
        messageId,
        selectedBot.userId
      );
      
      setMessageReactions(prev => ({
        ...prev,
        [messageId]: reactions
      }));
    } catch (err) {
      console.error(`[${instanceId}] Failed to load reactions for message ${messageId}:`, err);
    }
  };

  // Load reactions for newly received messages
  useEffect(() => {
    if (!messages.length || !selectedConversation || !selectedBot) return;
    
    // Get all message IDs that don't have reactions loaded yet
    const messagesToLoad = messages.filter(
      msg => msg.id && !messageReactions[msg.id]
    );
    
    // Load reactions for these messages
    messagesToLoad.forEach(msg => {
      loadMessageReactions(msg.id);
    });
  }, [messages, selectedConversation, selectedBot, messageReactions]);

  // Handle adding a reaction
  const handleAddReaction = async (messageId: string, emoji: string) => {
    if (!selectedBot || !selectedConversation) return;
    
    try {
      // Use REST API for adding reactions
      await ConversationService.addReaction(
        selectedConversation,
        messageId,
        emoji,
        selectedBot.userId
      );
      
      // Refresh reactions for this message
      loadMessageReactions(messageId);
      
      // Hide the reaction picker
      setShowReactionPicker(null);
    } catch (err) {
      console.error(`[${instanceId}] Failed to add reaction:`, err);
      setError('Failed to add reaction');
    }
  };

  // Handle removing a reaction
  const handleRemoveReaction = async (messageId: string, emoji: string) => {
    if (!selectedBot || !selectedConversation) return;
    
    try {
      // Use REST API for removing reactions
      await ConversationService.removeReaction(
        selectedConversation,
        messageId,
        emoji,
        selectedBot.userId
      );
      
      // Refresh reactions for this message
      loadMessageReactions(messageId);
    } catch (err) {
      console.error(`[${instanceId}] Failed to remove reaction:`, err);
      setError('Failed to remove reaction');
    }
  };

  // Clean up the renderMessageWithMentions function
  const renderMessageWithMentions = (message: any) => {
    if (!message.content) return '';
    
    // If no mentions, just return the content
    if (!message.mentions || message.mentions.length === 0) {
      return message.content;
    }
    
    // Sort mentions by their position in the message
    const sortedMentions = [...message.mentions].sort((a, b) => a.startIndex - b.startIndex);
    
    // Build message parts with mentions highlighted
    const parts = [];
    let lastIndex = 0;
    
    sortedMentions.forEach((mention, index) => {
      // Add text before mention
      if (mention.startIndex > lastIndex) {
        parts.push(
          <span key={`text-${index}`}>
            {message.content.substring(lastIndex, mention.startIndex)}
          </span>
        );
      }
      
      // Get the username from userId
      const mentionedUser = bots.find(bot => bot.userId === mention.userId);
      const displayName = mentionedUser ? mentionedUser.firstName : 
                        (mention.mentionText?.startsWith('@') ? mention.mentionText.substring(1) : mention.mentionText);
      
      // Add mention with special formatting - blue text without @ symbol
      parts.push(
        <span 
          key={`mention-${index}`}
          className="text-blue-600 font-medium mention-highlight"
          style={{ 
            color: '#2563eb',
            display: 'inline-block',
            fontWeight: 500
          }}
          title={getUserNameById(mention.userId)}
        >
          {displayName}
        </span>
      );
      
      lastIndex = mention.endIndex;
    });
    
    // Add any remaining text after the last mention
    if (lastIndex < message.content.length) {
      parts.push(
        <span key="text-end">
          {message.content.substring(lastIndex)}
        </span>
      );
    }
    
    return <>{parts}</>;
  };

  // Handle reaction added to a message
  const onReactionAddedEvent = useCallback((data: any) => {
    console.log(`[${instanceId}] Reaction added event:`, data);
    
    // Add the reaction to the corresponding message
    if (data.messageId && selectedConversationRef.current) {
      // Refresh the message's reactions
      loadMessageReactions(data.messageId);
    }
  }, [instanceId]);

  // Handle reaction removed from a message
  const onReactionRemovedEvent = useCallback((data: any) => {
    console.log(`[${instanceId}] Reaction removed event:`, data);
    
    // Remove the reaction from the corresponding message
    if (data.messageId && selectedConversationRef.current) {
      // Refresh the message's reactions
      loadMessageReactions(data.messageId);
    }
  }, [instanceId]);

  // Handle being mentioned in a message
  const onMentionEvent = useCallback((data: any) => {
    console.log(`[${instanceId}] Mention event:`, data);
    
    // If the mention is in the current conversation, update messages
    if (data.conversationId === selectedConversationRef.current) {
      setFetchTrigger(prev => prev + 1);
    } else {
      // If in a different conversation, consider showing a notification
      // This would depend on your UI design for notifications
      console.log(`[${instanceId}] You were mentioned in another conversation: ${data.conversationId}`);
      
      // Refresh conversations list to update unread counts
      setFetchTrigger(prev => prev + 1);
    }
  }, [instanceId, setFetchTrigger]);

  // Add handlers for reaction events
  useEffect(() => {
    if (!wsServiceRef.current || !isConnected) return;

    // Register handlers for new message reaction events
    const handleReactionAdded = (data: any) => {
      console.log(`[${instanceId}] Reaction added event:`, data);
      if (data.messageId && selectedConversationRef.current) {
        loadMessageReactions(data.messageId);
      }
    };

    const handleReactionRemoved = (data: any) => {
      console.log(`[${instanceId}] Reaction removed event:`, data);
      if (data.messageId && selectedConversationRef.current) {
        loadMessageReactions(data.messageId);
      }
    };

    const handleMessageMention = (data: any) => {
      console.log(`[${instanceId}] Mention event:`, data);
      // If the mention is in the current conversation, update messages
      if (data.conversationId === selectedConversationRef.current) {
        setFetchTrigger(prev => prev + 1);
      } else {
        // If in a different conversation, consider showing a notification
        console.log(`[${instanceId}] You were mentioned in another conversation: ${data.conversationId}`);
        // Refresh conversations list to update unread counts
        setFetchTrigger(prev => prev + 1);
      }
    };

    // Register event handlers with WebSocket service
    wsServiceRef.current.onMessageEvent('message:reaction:added', handleReactionAdded);
    wsServiceRef.current.onMessageEvent('message:reaction:removed', handleReactionRemoved);
    wsServiceRef.current.onMessageEvent('message:mention', handleMessageMention);

    // Clean up on unmount
    return () => {
      // No cleanup needed for now - would need offMessageEvent implementation
    };
  }, [instanceId, isConnected, selectedConversationRef, loadMessageReactions, setFetchTrigger]);

  // After the handleRemoveMember function and before the return statement

  // Create Conversation function
  const handleCreateConversation = async () => {
    if (!selectedBot) return;
    
    if (!conversationName.trim() || selectedMembers.length === 0) {
      setError('Please provide a name and select at least one member');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Create new conversation with selected members + current bot
      const memberIds = [...selectedMembers];
      if (!memberIds.includes(selectedBot.userId)) {
        memberIds.push(selectedBot.userId);
      }
      
      const newConversation = await ConversationService.createConversation(
        selectedBot.userId,
        {
          type: ConversationType.GROUP,
          name: conversationName,
          memberIds
        }
      );
      
      // Add to conversations list
      setConversations(prev => [...prev, newConversation]);
      
      // Select the new conversation
      setSelectedConversation(newConversation.id);
      
      // Join the conversation WebSocket room
      wsServiceRef.current?.joinConversation(newConversation.id);
      
      // Close modal
      setShowCreateModal(false);
      
      console.log(`[${instanceId}] Conversation created successfully`);
    } catch (err) {
      console.error('Failed to create conversation:', err);
      setError('Failed to create conversation');
    } finally {
      setLoading(false);
    }
  };

  // Enhance the renderMessageAttachments function
  const renderMessageAttachments = (message: any) => {
    if (!message.attachments || message.attachments.length === 0) {
      return null;
    }
    
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {message.attachments.map((attachment: any, index: number) => {
          // Check file type using the correct property name: fileType instead of mimeType
          const isImage = attachment.fileType?.startsWith('image/');
          const isVideo = attachment.fileType?.startsWith('video/');
          const isAudio = attachment.fileType?.startsWith('audio/');
          const isPDF = attachment.fileType === 'application/pdf';
          
          // Get icon based on file type - using fileType directly
          const getFileIcon = () => {
            if (isImage) return '🖼️';
            if (isVideo) return '🎬';
            if (isAudio) return '🎵';
            if (isPDF) return '📄';
            
            // Fall back to extension check only if needed
            if (attachment.fileType.includes('document')) return '📝';
            if (attachment.fileType.includes('spreadsheet')) return '📊';
            if (attachment.fileType.includes('presentation')) return '📑';
            if (attachment.fileType.includes('archive') || 
                attachment.fileType.includes('zip')) return '🗜️';
            
            return '📎';
          };
          
          return (
            <div key={attachment.id || index} className="relative">
              {isImage ? (
                <a 
                  href={attachment.fileUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="block"
                >
                  <img 
                    src={attachment.fileUrl} 
                    alt={attachment.fileName || 'Image attachment'} 
                    className="max-h-60 max-w-full rounded object-contain border border-secondary"
                    onError={(e) => {
                      // Handle image load error
                      e.currentTarget.src = '/file.svg';
                      e.currentTarget.className = 'max-h-16 max-w-16 p-2';
                    }}
                  />
                  {attachment.fileName && (
                    <div className="text-xs text-muted-foreground mt-1 text-center truncate" style={{maxWidth: '200px'}}>
                      {attachment.fileName}
                    </div>
                  )}
                </a>
              ) : isVideo ? (
                <div className="border rounded overflow-hidden">
                  <video 
                    controls 
                    className="max-h-60 max-w-full" 
                    src={attachment.fileUrl}
                  >
                    Your browser does not support the video tag.
                  </video>
                  {attachment.fileName && (
                    <div className="text-xs text-muted-foreground mt-1 text-center truncate p-1" style={{maxWidth: '200px'}}>
                      {attachment.fileName}
                    </div>
                  )}
                </div>
              ) : isAudio ? (
                <div className="border rounded p-2 bg-secondary/20">
                  <audio controls src={attachment.fileUrl}>
                    Your browser does not support the audio tag.
                  </audio>
                  {attachment.fileName && (
                    <div className="text-xs text-muted-foreground mt-1 text-center truncate" style={{maxWidth: '200px'}}>
                      {attachment.fileName}
                    </div>
                  )}
                </div>
              ) : (
                <a 
                  href={attachment.fileUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center p-2 border rounded bg-secondary/20 hover:bg-secondary/40"
                  download={attachment.fileName}
                >
                  <span className="text-xl mr-2">{getFileIcon()}</span>
                  <span className="text-sm truncate" style={{maxWidth: '150px'}}>
                    {attachment.fileName || 'File attachment'}
                  </span>
                </a>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // In the return statement, at the top level of the component
  return (
    <>
      <div className="flex flex-col h-[500px] border rounded-lg overflow-hidden">
        {/* Header with bot selector */}
        <div className="p-3 border-b bg-sidebar">
          <div className="flex justify-between items-center mb-2">
            <select 
              className="flex-1 p-2 bg-background text-foreground rounded mr-2"
              value={selectedBot?.userId || ''}
              onChange={(e) => handleBotChange(e.target.value)}
              disabled={isConnected}
            >
              <option value="">Select a bot</option>
              {bots.map(bot => (
                <option key={bot.userId} value={bot.userId}>
                  {bot.firstName} {bot.lastName} ({bot.handle})
                </option>
              ))}
            </select>
            <div className="flex space-x-2">
              <button
                onClick={logDebugInfo}
                className="bg-secondary text-secondary-foreground p-2 rounded text-sm"
                title="Log debug information to console"
              >
                Debug
              </button>
              {isConnected && (
                <button 
                  onClick={handleDisconnect}
                  className="bg-destructive text-primary-foreground p-2 rounded text-sm"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>
          <div className="text-xs flex justify-between">
            <span>Instance: {instanceId}</span>
            <span>Status: {connectionStatus}</span>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-2 bg-red-500 text-white text-sm">
            {error}
          </div>
        )}

        {/* Main content area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Conversation list */}
          <div className="w-1/3 border-r overflow-y-auto">
            {/* Add refresh button to the conversation list header */}
            <div className="p-2 bg-sidebar-accent font-medium flex justify-between items-center">
              <h3>Conversations</h3>
              <div className="flex space-x-2">
                {isConnected && (
                  <>
                    <button
                      onClick={fetchConversations}
                      className="text-xs bg-secondary text-secondary-foreground p-1 rounded"
                      disabled={loading}
                      title="Refresh conversations list"
                    >
                      🔄
                    </button>
                    <button
                      onClick={() => {
                        console.log(`[${instanceId}] New conversation button clicked`);
                        console.log(`[${instanceId}] Current showCreateModal value:`, showCreateModal);
                        openCreateConversationModal();
                      }}
                      className="text-xs bg-primary text-primary-foreground p-1 rounded hover:bg-primary/80"
                    >
                      New
                    </button>
                  </>
                )}
              </div>
            </div>
            {loading ? (
              <div className="p-4 text-center">Loading...</div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">No conversations</div>
            ) : (
              <ul>
                {conversations.map(conversation => (
                  <li 
                    key={conversation.id}
                    className={`p-3 border-b cursor-pointer hover:bg-secondary ${
                      selectedConversation === conversation.id ? 'bg-secondary' : ''
                    }`}
                    onClick={() => handleSelectConversation(conversation.id)}
                  >
                    <div className="font-medium">
                      {conversation.name || conversation.members?.filter(m => m.userId !== selectedBot?.userId)
                        .map(m => m.user?.firstName)
                        .join(', ') || 'Unnamed conversation'}
                    </div>
                    <div className="text-xs text-muted-foreground flex justify-between">
                      <span>{conversation.lastMessageAt ? 'Last message: ' + formatTime(conversation.lastMessageAt) : 'No messages'}</span>
                      <span>{conversation.memberCount} members</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Message area */}
          <div className="flex-1 flex flex-col">
            {selectedConversation ? (
              <>
                {/* Conversation header */}
                <div className="p-2 border-b flex justify-between items-center">
                  <h3 className="font-medium">
                    {conversations.find(c => c.id === selectedConversation)?.name || 'Conversation'}
                  </h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={openEditConversationModal}
                      className="text-xs bg-secondary text-secondary-foreground p-1 rounded"
                    >
                      Edit
                    </button>
                    <button
                      onClick={openMembersModal}
                      className="text-xs bg-secondary text-secondary-foreground p-1 rounded"
                    >
                      Members
                    </button>
                    <button
                      onClick={handleLeaveConversation}
                      className="text-xs bg-destructive text-primary-foreground p-1 rounded"
                    >
                      Leave
                    </button>
                  </div>
                </div>
              
                {/* Messages */}
                <div className="flex-1 p-4 overflow-y-auto">
                  {messages.length === 0 ? (
                    <div className="text-center text-muted-foreground">No messages</div>
                  ) : (
                    <div className="space-y-2">
                      {processedMessages.map((msg, index) => (
                        <div key={index}>
                          <div 
                            className={`p-2 rounded-lg max-w-[80%] ${
                              msg.role === 'system'
                                ? 'bg-transparent text-muted-foreground text-xs mx-auto text-center italic my-1'
                                : msg.senderId === selectedBot?.userId 
                                  ? 'bg-primary text-primary-foreground ml-auto' 
                                  : 'bg-secondary'
                            }`}
                          >
                            {/* Message content - only show sender for non-system messages */}
                            {msg.role !== 'system' && (
                              <div className="text-xs font-medium flex justify-between">
                                <span>{msg.senderId === selectedBot?.userId ? 'You' : msg.sender?.firstName || 'Unknown'}</span>
                                {msg.senderId === selectedBot?.userId ? (
                                  <div className="flex space-x-1">
                                    <button 
                                      onClick={() => setMessageActionsId(messageActionsId === msg.id ? null : msg.id)}
                                      className="text-xs opacity-70 hover:opacity-100"
                                      title="Message actions"
                                    >
                                      •••
                                    </button>
                                    {/* Message actions menu */}
                                    {messageActionsId === msg.id && (
                                      <div className="absolute right-2 mt-6 bg-background border rounded shadow-lg z-10 py-1">
                                        <button 
                                          onClick={() => {
                                            handleReplyToMessage(msg);
                                            setMessageActionsId(null);
                                          }}
                                          className="block w-full text-left px-4 py-1 hover:bg-accent text-xs"
                                        >
                                          Reply
                                        </button>
                                        <button 
                                          onClick={() => {
                                            handleStartEditMessage(msg);
                                            setMessageActionsId(null);
                                          }}
                                          className="block w-full text-left px-4 py-1 hover:bg-accent text-xs"
                                        >
                                          Edit
                                        </button>
                                        <button 
                                          onClick={() => {
                                            handleUnsendMessage(msg.id);
                                            setMessageActionsId(null);
                                          }}
                                          className="block w-full text-left px-4 py-1 hover:bg-accent text-xs"
                                        >
                                          Unsend
                                        </button>
                                        <button 
                                          onClick={() => {
                                            handleDeleteMessage(msg.id);
                                            setMessageActionsId(null);
                                          }}
                                          className="block w-full text-left px-4 py-1 hover:bg-accent text-xs text-destructive"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <button 
                                    onClick={() => handleReplyToMessage(msg)}
                                    className="text-xs opacity-70 hover:opacity-100"
                                    title="Reply to this message"
                                  >
                                    Reply
                                  </button>
                                )}
                              </div>
                            )}
                            
                            {/* Message content */}
                            {msg.role === 'system' ? (
                              // System message - simple display
                              <div>{msg.content}</div>
                            ) : editingMessageId === msg.id ? (
                              // Editing interface
                              <div className="mt-1">
                                <input
                                  type="text"
                                  className="w-full p-1 text-sm border rounded bg-background text-foreground"
                                  value={editMessageText}
                                  onChange={(e) => setEditMessageText(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleSaveEditMessage()}
                                  autoFocus
                                />
                                <div className="flex justify-end space-x-1 mt-1">
                                  <button 
                                    onClick={handleCancelEditMessage}
                                    className="text-xs opacity-70 hover:opacity-100"
                                  >
                                    Cancel
                                  </button>
                                  <button 
                                    onClick={handleSaveEditMessage}
                                    className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded"
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              // Regular message
                              <div>
                                {msg.deletedAt 
                                  ? (msg.senderId === selectedBot?.userId 
                                      ? "You deleted this message" 
                                      : renderMessageWithMentions(msg)) // For deleted messages, show content to others
                                  : msg.unsentAt 
                                    ? "This message was unsent" // Everyone sees unsent messages as unsent
                                    : renderMessageWithMentions(msg) // Render regular message with mentions
                                }
                                {msg.deletedAt && msg.senderId === selectedBot?.userId && <span className="ml-1 text-xs">(deleted)</span>}
                                {msg.unsentAt && <span className="ml-1 text-xs">(unsent)</span>}
                              </div>
                            )}
                            
                            {/* Display message attachments */}
                            {!msg.deletedAt && !msg.unsentAt && renderMessageAttachments(msg)}
                            
                            {/* Display message reactions */}
                            {msg.id && messageReactions[msg.id] && messageReactions[msg.id].length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {messageReactions[msg.id].map((reaction, idx) => {
                                  const userHasReacted = reaction.userId === selectedBot?.userId;
                                  return (
                                    <button
                                      key={`${reaction.emoji}-${idx}`}
                                      className={`text-xs px-1 rounded-full ${
                                        userHasReacted 
                                          ? 'bg-accent text-accent-foreground' 
                                          : 'bg-secondary/50 hover:bg-secondary'
                                      }`}
                                      onClick={() => userHasReacted
                                        ? handleRemoveReaction(msg.id, reaction.emoji)
                                        : handleAddReaction(msg.id, reaction.emoji)
                                      }
                                      title={userHasReacted ? 'Remove reaction' : 'Add reaction'}
                                    >
                                      {reaction.emoji} {reaction.count || 1}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            
                            <div className="text-xs opacity-70 text-right flex justify-between items-center mt-1">
                              {/* Reaction button */}
                              <button
                                onClick={() => setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id)}
                                className="text-xs opacity-70 hover:opacity-100"
                                title="Add reaction"
                              >
                                😀
                              </button>
                              
                              <div>
                                {msg.editedAt && <span className="mr-1">(edited)</span>}
                                {msg.createdAt ? formatTime(msg.createdAt) : ''}
                              </div>
                            </div>
                            
                            {/* Reaction picker */}
                            {showReactionPicker === msg.id && (
                              <div className="absolute bg-background border rounded shadow-lg z-10 p-2 mt-1">
                                <div className="flex flex-wrap gap-1">
                                  {commonEmojis.map((emoji) => (
                                    <button
                                      key={emoji}
                                      className="text-lg hover:bg-secondary p-1 rounded"
                                      onClick={() => handleAddReaction(msg.id, emoji)}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          
                          {/* Read receipts as inline indicator */}
                          {msg.readReceipts && msg.readReceipts.length > 0 && (
                            <div className="border-b border-border/30 my-2 relative">
                              <div className="absolute -bottom-3 left-0 right-0 text-center">
                                <span className="bg-background text-xs text-muted-foreground px-2 inline-block">
                                  {msg.readReceipts.map((receipt: any, idx: number) => (
                                    <span key={receipt.userId}>
                                      {getUserName(receipt.userId)} - {formatTime(receipt.timestamp)}
                                      {idx < msg.readReceipts.length - 1 ? ', ' : ''}
                                    </span>
                                  ))}
                                  <span className="ml-1">read up to here</span>
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {/* Typing indicator */}
                      {typingUsers.length > 0 && (
                        <div className="p-2 text-xs text-muted-foreground">
                          {typingUsers.length === 1 ? (
                            <span>
                              {bots.find(b => b.userId === typingUsers[0])?.firstName || 'Someone'} is typing...
                            </span>
                          ) : (
                            <span>
                              {typingUsers.length} people are typing...
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Message input */}
                <div className="p-3 border-t">
                  {replyToMessage && (
                    <div className="mb-2 p-2 bg-secondary/30 rounded flex justify-between items-start">
                      <div className="text-sm">
                        <div className="text-xs font-medium">
                          Replying to {replyToMessage.senderId === selectedBot?.userId ? 'yourself' : replyToMessage.sender?.firstName || 'Unknown'}
                        </div>
                        <div className="truncate opacity-70">{replyToMessage.content}</div>
                      </div>
                      <button 
                        onClick={handleCancelReply}
                        className="text-xs opacity-70 hover:opacity-100"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  
                  {/* File Attachments Preview */}
                  {attachmentPreviews.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {attachmentPreviews.map((preview, index) => (
                        <div key={index} className="relative bg-secondary/30 rounded p-1 w-16 h-16 flex items-center justify-center">
                          {preview.url ? (
                            <img 
                              src={preview.url} 
                              alt={preview.name} 
                              className="max-w-full max-h-full object-contain"
                            />
                          ) : (
                            <div className="text-xs text-center">
                              {preview.name.length > 10 
                                ? preview.name.substring(0, 7) + '...' 
                                : preview.name}
                            </div>
                          )}
                          <button
                            onClick={() => handleRemoveAttachment(index)}
                            className="absolute -top-1 -right-1 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex">
                    {/* File upload button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 mr-2 bg-secondary text-secondary-foreground rounded-lg"
                      title="Attach files"
                      type="button"
                    >
                      📎
                    </button>
                    
                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileSelect}
                      multiple
                      accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                    />
                    
                    <div className="flex-1 relative">
                      <input
                        id={`message-input-${instanceId}`}
                        type="text"
                        className="w-full p-2 bg-background text-foreground rounded-lg focus:outline-none"
                        placeholder="Type a message... (use @ to mention)"
                        value={messageText}
                        onChange={handleMessageInputChange}
                        onFocus={handleMessageInputFocus}
                        onBlur={handleMessageInputBlur}
                        onKeyDown={handleMessageInputKeyDown}
                        ref={messageInputRef}
                      />
                      
                      {/* Mention suggestions dropdown */}
                      {showMentionSuggestions && mentionSuggestions.length > 0 && (
                        <div className="absolute bottom-full mb-1 w-64 max-h-48 overflow-y-auto bg-background border rounded shadow-lg z-10">
                          {mentionSuggestions.map((user, index) => (
                            <div
                              key={user.userId}
                              className={`p-2 flex items-center cursor-pointer ${
                                index === activeSuggestionIndex ? 'bg-secondary' : 'hover:bg-secondary/50'
                              }`}
                              onClick={() => handleSelectMention(user)}
                            >
                              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-secondary flex items-center justify-center mr-2">
                                {user.avatarUrl ? (
                                  <img src={user.avatarUrl} alt={user.firstName} className="w-6 h-6 rounded-full" />
                                ) : (
                                  <span>{user.firstName.charAt(0)}</span>
                                )}
                              </div>
                              <div>
                                <div className="text-xs font-medium">
                                  {user.firstName} {user.lastName}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  @{user.handle}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <button
                      onClick={handleSendMessage}
                      className="p-2 ml-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                      disabled={(!messageText.trim() && attachments.length === 0) || !selectedConversation || !selectedBot || loading}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-4 text-center text-muted-foreground">
                Select a conversation to start messaging.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Conversation Modal - moved to the top level */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-background p-4 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">Create New Conversation</h3>
            
            <div className="mb-4">
              <label className="block mb-1 text-sm">Conversation Name</label>
              <input
                type="text"
                value={conversationName}
                onChange={(e) => setConversationName(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="Enter conversation name"
              />
            </div>
            
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2">Select Members</h4>
              <ul className="max-h-48 overflow-y-auto border rounded p-2">
                {bots
                  .filter(bot => bot.userId !== selectedBot?.userId)
                  .map(bot => (
                    <li 
                      key={bot.userId} 
                      className="flex items-center py-1"
                    >
                      <input
                        type="checkbox"
                        id={`member-${bot.userId}`}
                        checked={selectedMembers.includes(bot.userId)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedMembers(prev => [...prev, bot.userId]);
                          } else {
                            setSelectedMembers(prev => prev.filter(id => id !== bot.userId));
                          }
                        }}
                        className="mr-2"
                      />
                      <label htmlFor={`member-${bot.userId}`}>
                        {bot.firstName} {bot.lastName}
                      </label>
                    </li>
                  ))
                }
              </ul>
            </div>
            
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateConversation}
                className="px-4 py-2 bg-primary text-primary-foreground rounded"
                disabled={loading || !conversationName.trim() || selectedMembers.length === 0}
              >
                {loading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Edit Conversation Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-background p-4 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">Edit Conversation</h3>
            
            <div className="mb-4">
              <label className="block mb-1 text-sm">Conversation Name</label>
              <input
                type="text"
                value={conversationName}
                onChange={(e) => setConversationName(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="Enter conversation name"
              />
            </div>
            
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateConversation}
                className="px-4 py-2 bg-primary text-primary-foreground rounded"
                disabled={loading}
              >
                {loading ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Members Modal */}
      {showMembersModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-background p-4 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">Manage Members</h3>
            
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2">Current Members</h4>
              <ul className="max-h-48 overflow-y-auto border rounded p-2">
                {selectedMembers.map(memberId => {
                  const member = bots.find(b => b.userId === memberId);
                  return (
                    <li 
                      key={memberId} 
                      className="flex justify-between items-center py-1"
                    >
                      <span>
                        {member 
                          ? `${member.firstName} ${member.lastName}` 
                          : 'Unknown User'}
                        {memberId === selectedBot?.userId && ' (You)'}
                      </span>
                      {memberId !== selectedBot?.userId && (
                        <button
                          onClick={() => handleRemoveMember(memberId)}
                          className="text-xs bg-destructive text-white px-2 py-1 rounded"
                          disabled={loading}
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2">Add Members</h4>
              <ul className="max-h-48 overflow-y-auto border rounded p-2">
                {bots.filter(b => !selectedMembers.includes(b.userId)).map(bot => (
                  <li 
                    key={bot.userId} 
                    className="flex justify-between items-center py-1"
                  >
                    <span>{bot.firstName} {bot.lastName}</span>
                    <button
                      onClick={() => handleAddMember(bot.userId)}
                      className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded"
                      disabled={loading}
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="flex justify-end">
              <button
                onClick={() => setShowMembersModal(false)}
                className="px-4 py-2 border rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}