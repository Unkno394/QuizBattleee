// components/ChatPanel.tsx
"use client";
import { useState, useRef, useEffect } from 'react';
import emojiData from 'unicode-emoji-json';

interface Message {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: Date;
  emoji?: string;
}

interface Participant {
  id: string;
  name: string;
  isAudioMuted: boolean;
  isVideoOff: boolean;
  stream?: MediaStream;
}

interface ChatPanelProps {
  isOpen: boolean;
  messages: Message[];
  onSendMessage: (text: string) => void;
  participants: Participant[];
  onClose: () => void;
  isChatBlocked?: boolean;
}

const getEmojiCategories = () => {
  const categories: { [key: string]: string[] } = {
    'Часто': ['😂', '❤️', '🔥', '👍', '👏', '🎉', '🙏', '😍', '🥰', '🤩', '😊', '🙂'],
  };

  Object.entries(emojiData).forEach(([emoji, data]: [string, any]) => {
    const category = data.group;
    if (!categories[category]) {
      categories[category] = [];
    }
    if (categories[category].length < 100) {
      categories[category].push(emoji);
    }
  });

  return categories;
};

const emojiCategories = getEmojiCategories();

function Twemoji({ emoji, size = 20 }: { emoji: string; size?: number }) {
  const [error, setError] = useState(false);

  if (error) {
    return <span className="inline-block" style={{ fontSize: size }}>{emoji}</span>;
  }

  const getTwemojiUrl = (emoji: string) => {
    try {
      const codePoints = Array.from(emoji)
        .map(char => char.codePointAt(0)!.toString(16))
        .join('-');
      return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/15.1.0/72x72/${codePoints}.png`;
    } catch {
      return null;
    }
  };

  const twemojiUrl = getTwemojiUrl(emoji);

  if (!twemojiUrl) {
    return <span className="inline-block" style={{ fontSize: size }}>{emoji}</span>;
  }

  return (
    <img
      src={twemojiUrl}
      alt={emoji}
      className="inline-block align-middle"
      style={{ 
        width: size, 
        height: size,
        margin: '0 1px'
      }}
      onError={() => setError(true)}
    />
  );
}

function TwitterEmojiPicker({ onEmojiSelect, onClose }: { onEmojiSelect: (emoji: string) => void; onClose: () => void }) {
  const [activeCategory, setActiveCategory] = useState('Часто');
  const pickerRef = useRef<HTMLDivElement>(null);

  const currentEmojis = emojiCategories[activeCategory] || [];
  const emojiChunks = [];
  for (let i = 0; i < currentEmojis.length; i += 32) {
    emojiChunks.push(currentEmojis.slice(i, i + 32));
  }

  return (
    <div 
      ref={pickerRef}
      className="emoji-picker absolute bottom-full left-0 mb-2 bg-gray-800 rounded-2xl border border-white/20 shadow-2xl overflow-hidden backdrop-blur-md z-40"
      style={{ width: '352px', height: '400px' }}
    >
      <div className="flex border-b border-white/10 p-3 overflow-x-auto bg-gray-900/80">
        {Object.keys(emojiCategories).map(category => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`px-4 py-2 rounded-xl text-sm whitespace-nowrap transition-all duration-200 mx-1 flex-shrink-0 ${
              activeCategory === category 
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25' 
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="p-4 h-80 overflow-y-auto">
        {emojiChunks.map((chunk, chunkIndex) => (
          <div key={chunkIndex} className="mb-4">
            <div className="grid grid-cols-8 gap-2">
              {chunk.map((emoji, index) => (
                <button
                  key={`${emoji}-${index}`}
                  onClick={() => onEmojiSelect(emoji)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-all duration-200 hover:scale-110 text-lg bg-white/5 hover:shadow-lg"
                >
                  <Twemoji emoji={emoji} size={20} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmojiText({ text, className = "" }: { text: string; className?: string }) {
  const emojiRegex = /\p{Extended_Pictographic}/gu;
  
  if (!text) return null;

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = emojiRegex.exec(text)) !== null) {
    const emoji = match[0];
    const index = match.index;

    if (index > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`} className={className}>
          {text.slice(lastIndex, index)}
        </span>
      );
    }

    parts.push(
      <Twemoji
        key={`emoji-${index}`}
        emoji={emoji}
        size={20}
      />
    );

    lastIndex = index + emoji.length;
  }

  if (lastIndex < text.length) {
    parts.push(
      <span key={`text-${lastIndex}`} className={className}>
        {text.slice(lastIndex)}
      </span>
    );
  }

  return <span className={`inline-flex items-center flex-wrap ${className}`}>{parts}</span>;
}

function InputEmojiText({ text }: { text: string }) {
  if (!text) return null;

  // In input we show raw text so the caret doesn't jump
  return <span className="text-white">{text}</span>;
}

export function ChatPanel({ isOpen, messages, onSendMessage, participants, onClose, isChatBlocked }: ChatPanelProps) {
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = () => {
    if (isChatBlocked) return;
    if (message.trim()) {
      onSendMessage(message.trim());
      setMessage('');
      setShowEmojiPicker(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const addEmoji = (emoji: string) => {
    setMessage(prev => prev + emoji);
    inputRef.current?.focus();
    setShowEmojiPicker(false);
  };

  return (
    <>
      {/* Desktop version - для экранов 1440px и больше */}
      <div 
        className={`hidden 2xl:block fixed right-0 top-0 h-full bg-gray-900/95 backdrop-blur-md border-l border-white/20 transition-all duration-300 z-30 ${
          isOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full'
        }`} 
        style={{ width: '480px' }}
      >
        
        <div className="p-6 border-b border-white/10 bg-gray-900/80">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-bold text-xl">Чат встречи</h3>
              <p className="text-white/40 text-sm mt-1">{participants.length} участников онлайн</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-white/60 text-sm font-medium">{messages.length}</span>
            </div>
          </div>
        </div>

        <div 
          ref={chatContainerRef}
          className="h-[calc(100%-140px)] overflow-y-auto p-6 space-y-4 bg-gray-900/50"
        >
          {messages.map((msg) => (
            <div key={msg.id} className="flex gap-4 group hover:bg-white/5 rounded-2xl p-4 transition-all duration-200">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-lg">
                {msg.userName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="text-white font-semibold text-base">{msg.userName}</span>
                  <span className="text-white/40 text-xs">
                    {new Date(msg.timestamp).toLocaleTimeString('ru-RU', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                </div>
                <div className="text-white/90 text-base leading-relaxed break-words">
                  <EmojiText text={msg.text} />
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-white/10 bg-gray-900/80 backdrop-blur-md">
          {showEmojiPicker && !isChatBlocked && (
            <TwitterEmojiPicker onEmojiSelect={addEmoji} onClose={() => setShowEmojiPicker(false)} />
          )}
          
          <div className="flex gap-3 items-end">
            {!isChatBlocked && (
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition-all duration-200 hover:scale-105 border border-white/20 flex-shrink-0"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            )}
            
            <div className="flex-1 relative">
              <div className="relative">
                {isChatBlocked ? (
                  <div className="w-full bg-white/5 border border-red-500/50 rounded-xl px-4 py-3 text-red-200 text-sm backdrop-blur-md">
                    Вам запретили писать
                  </div>
                ) : (
                  <input
                    ref={inputRef}
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Написать сообщение..."
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-base backdrop-blur-md transition-all duration-200"
                  />
                )}
              </div>
            </div>
            
            <button
              onClick={handleSendMessage}
              disabled={!message.trim() || isChatBlocked}
              className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed rounded-full transition-all duration-200 hover:scale-105 flex items-center justify-center shadow-lg flex-shrink-0"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile version - для экранов меньше 1440px */}
      <div 
        className={`2xl:hidden fixed inset-0 z-50 transition-all duration-300 ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div 
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        
        <div className="absolute bottom-0 left-0 right-0 h-3/4 bg-gray-900/95 backdrop-blur-md rounded-t-3xl border-t border-white/20 flex flex-col">
          <div className="p-4 sm:p-6 border-b border-white/10 bg-gray-900/80 rounded-t-3xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-lg sm:text-xl">Чат встречи</h3>
                <p className="text-white/40 text-xs sm:text-sm mt-1">{participants.length} участников онлайн</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition-all duration-200"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div 
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 sm:space-y-4 bg-gray-900/50"
          >
            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-3 sm:gap-4 group hover:bg-white/5 rounded-2xl p-3 sm:p-4 transition-all duration-200">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm flex-shrink-0 shadow-lg">
                  {msg.userName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 sm:gap-3 mb-1 sm:mb-2">
                    <span className="text-white font-semibold text-sm sm:text-sm">{msg.userName}</span>
                    <span className="text-white/40 text-xs">
                      {new Date(msg.timestamp).toLocaleTimeString('ru-RU', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </div>
                  <div className="text-white/90 text-sm leading-relaxed break-words">
                    <EmojiText text={msg.text} />
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 sm:p-4 border-t border-white/10 bg-gray-900/80 backdrop-blur-md">
            {showEmojiPicker && (
              <TwitterEmojiPicker onEmojiSelect={addEmoji} onClose={() => setShowEmojiPicker(false)} />
            )}
            
            <div className="flex gap-2 sm:gap-3 items-end">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition-all duration-200 hover:scale-105 border border-white/20 flex-shrink-0"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              
              <div className="flex-1 relative">
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Написать сообщение..."
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 sm:px-4 sm:py-3 text-white placeholder-white/50 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm backdrop-blur-md transition-all duration-200"
                />
                </div>
              </div>
              
              <button
                onClick={handleSendMessage}
                disabled={!message.trim()}
                className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed rounded-full transition-all duration-200 hover:scale-105 flex items-center justify-center shadow-lg flex-shrink-0"
              >
                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
