import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput,
  Dimensions,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  StyleSheet, Alert, ScrollView, SafeAreaView, ActionSheetIOS
} from 'react-native';
// 动画跑在 UI 线程：Reanimated 提供 Animated.View / shared value / withSpring
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, runOnJS,
} from 'react-native-reanimated';
// 手势也跑 UI 线程：用 Gesture.Pan/Tap 取代 PanResponder
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useCheckIn } from '../context/CheckInContext';
import {
  chatWithAI, chatWithAIStream, confirmAction,
  createSession, listSessions, deleteSessionAPI, getSessionMessages
} from '../services/aiService';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const BUBBLE_SIZE = 52;

export default function FloatingAI() {
  const { refreshData } = useCheckIn();

  const [expanded, setExpanded] = useState(false);
  const [showSessionList, setShowSessionList] = useState(false);

  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const flatListRef = useRef(null);
  const msgIdCounter = useRef(1);
  const [streamingMsgId, setStreamingMsgId] = useState(null);
  const [statusText, setStatusText] = useState('');

  // ====== Draggable bubble（Reanimated + Gesture Handler，全程跑 UI 线程）======
  // 悬浮球位置：shared value 直接被 UI 线程读写，不经过 JS 线程
  const tx = useSharedValue(SCREEN_WIDTH - BUBBLE_SIZE - 16);
  const ty = useSharedValue(SCREEN_HEIGHT - 220);
  // 拖拽起点（在 onStart 记录，避免访问私有属性 _value）
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // 拖拽手势：移动悬浮球，松手后弹簧吸边
  const dragGesture = Gesture.Pan()
    .onStart(() => {
      startX.value = tx.value;
      startY.value = ty.value;
    })
    .onUpdate((e) => {
      tx.value = startX.value + e.translationX;
      ty.value = startY.value + e.translationY;
    })
    .onEnd(() => {
      const targetX = tx.value < SCREEN_WIDTH / 2 ? 16 : SCREEN_WIDTH - BUBBLE_SIZE - 16;
      tx.value = withSpring(targetX, { damping: 15, stiffness: 120 });
    });

  // 点击手势：展开聊天面板（maxDistance 限制位移，区分点击和拖拽）
  const tapGesture = Gesture.Tap()
    .maxDistance(10)
    .onEnd(() => {
      // setExpanded 是 JS 端的 state setter，必须用 runOnJS 从 UI 线程切回 JS 线程
      runOnJS(setExpanded)(true);
    });

  // Race：是点击就展开，是拖拽就移动，二者竞争取先达成的
  const bubbleGesture = Gesture.Race(tapGesture, dragGesture);

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  // ====== Session management ======
  useEffect(() => {
    if (expanded) loadSessions();
  }, [expanded]);

  const loadSessions = async () => {
    try {
      const list = await listSessions();
      setSessions(list);
      if (list.length > 0 && !currentSessionId) {
        switchToSession(list[0].session_id);
      }
    } catch (e) {}
  };

  const handleNewSession = async () => {
    try {
      const session = await createSession();
      setCurrentSessionId(session.session_id);
      setMessages([{
        id: '0', role: 'assistant',
        content: '新对话已开始。我可以帮你打卡、建任务、分析数据。'
      }]);
      setPendingAction(null);
      setShowSessionList(false);
      loadSessions();
    } catch (e) {
      Alert.alert('错误', '创建新对话失败');
    }
  };

  const switchToSession = async (sessionId) => {
    setCurrentSessionId(sessionId);
    setPendingAction(null);
    setShowSessionList(false);
    try {
      const data = await getSessionMessages(sessionId);
      if (data.messages && data.messages.length > 0) {
        setMessages(data.messages.map((m, i) => ({
          id: String(i),
          role: m.role,
          content: m.content,
        })));
        msgIdCounter.current = data.messages.length;
      } else {
        setMessages([{
          id: '0', role: 'assistant',
          content: '你好！我是你的 AI 习惯教练，可以帮你打卡、建任务、分析数据。'
        }]);
        msgIdCounter.current = 1;
      }
    } catch (e) {
      setMessages([{
        id: '0', role: 'assistant',
        content: '你好！我是你的 AI 习惯教练，可以帮你打卡、建任务、分析数据。'
      }]);
      msgIdCounter.current = 1;
    }
  };

  const handleDeleteSession = (sessionId) => {
    Alert.alert('删除对话', '确定删除这个对话吗？', [
      { text: '取消' },
      {
        text: '删除', style: 'destructive',
        onPress: async () => {
          await deleteSessionAPI(sessionId);
          if (currentSessionId === sessionId) {
            setCurrentSessionId(null);
            setMessages([]);
          }
          loadSessions();
        }
      }
    ]);
  };

  // ====== Chat ======
  const addMessage = useCallback((role, content) => {
    const id = String(msgIdCounter.current++);
    setMessages(prev => [...prev, { id, role, content }]);
    return id;
  }, []);

  const handleSend = async (text) => {
    const messageText = (text || input).trim();
    if (!messageText || loading) return;

    if (!currentSessionId) {
      try {
        const session = await createSession();
        setCurrentSessionId(session.session_id);
        sendMessage(messageText, session.session_id);
        loadSessions();
      } catch (e) {
        Alert.alert('错误', '创建会话失败');
      }
      return;
    }
    sendMessage(messageText, currentSessionId);
  };

  const sendMessage = async (messageText, sessionId) => {
    addMessage('user', messageText);
    setInput('');
    setLoading(true);
    setStatusText('');

    const aiMsgId = String(msgIdCounter.current++);
    setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '' }]);
    setStreamingMsgId(aiMsgId);

    let accumulated = '';

    await chatWithAIStream(messageText, sessionId, {
      onChunk: (content) => {
        accumulated += content;
        setMessages(prev => prev.map(m =>
          m.id === aiMsgId ? { ...m, content: accumulated } : m
        ));
      },
      onTool: (content) => {
        setStatusText(content);
      },
      onStatus: (content) => {
        setStatusText(content);
      },
      onDataChanged: () => {
        refreshData();
      },
      onPendingAction: (action) => {
        setPendingAction(action);
      },
      onDone: () => {
        setStreamingMsgId(null);
        setStatusText('');
        setLoading(false);
        loadSessions();
        if (!accumulated) {
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId ? { ...m, content: '处理完成。' } : m
          ));
        }
      },
      onError: (err) => {
        setStreamingMsgId(null);
        setStatusText('');
        setLoading(false);
        if (!accumulated) {
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId ? { ...m, content: '抱歉，AI 服务暂时不可用，请稍后再试。' } : m
          ));
        }
        loadSessions();
      },
    });
  };

  const handleConfirm = async () => {
    if (!pendingAction) return;
    setLoading(true);
    try {
      const result = await confirmAction(pendingAction);
      addMessage('assistant', result.reply || '操作已执行。');
      if (result.data_changed) refreshData();
    } catch (e) {
      addMessage('assistant', '执行失败，请重试。');
    } finally {
      setPendingAction(null);
      setLoading(false);
    }
  };

  const handleLongPress = (content) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['复制', '取消'], cancelButtonIndex: 1 },
        (index) => { if (index === 0) Clipboard.setStringAsync(content); }
      );
    } else {
      Alert.alert('', '', [
        { text: '复制', onPress: () => Clipboard.setStringAsync(content) },
        { text: '取消', style: 'cancel' },
      ]);
    }
  };

  // ====== Render ======
  const renderSessionItem = (session) => (
    <TouchableOpacity
      key={session.session_id}
      style={[
        styles.sessionItem,
        session.session_id === currentSessionId && styles.sessionItemActive
      ]}
      onPress={() => switchToSession(session.session_id)}
      onLongPress={() => handleDeleteSession(session.session_id)}
    >
      <Ionicons name="chatbubble-outline" size={16} color={session.session_id === currentSessionId ? '#07C160' : '#B2B2B2'} />
      <View style={styles.sessionInfo}>
        <Text style={[styles.sessionTitle, session.session_id === currentSessionId && { color: '#07C160' }]} numberOfLines={1}>
          {session.title}
        </Text>
        {session.last_message ? (
          <Text style={styles.sessionPreview} numberOfLines={1}>{session.last_message}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <>
      {/* Floating bubble */}
      {!expanded && (
        <GestureDetector gesture={bubbleGesture}>
          <Animated.View style={[styles.bubble, bubbleStyle]}>
            <View style={styles.bubbleInner}>
              <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
            </View>
          </Animated.View>
        </GestureDetector>
      )}

      {/* Chat modal — 保持和原版完全一样的布局层级 */}
      <Modal visible={expanded} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setExpanded(false)}>
        <KeyboardAvoidingView style={styles.chatContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

          {/* Header — 微信风格 */}
          <View style={styles.chatHeader}>
            <TouchableOpacity onPress={() => setExpanded(false)} style={styles.headerBtn}>
              <Ionicons name="chevron-back" size={26} color="#111" />
            </TouchableOpacity>
            <View style={styles.chatHeaderCenter}>
              <Text style={styles.chatTitle}>AI 助手</Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={handleNewSession} style={styles.headerBtn}>
                <Ionicons name="add-circle-outline" size={22} color="#111" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowSessionList(!showSessionList)} style={styles.headerBtn}>
                <Ionicons name="ellipsis-horizontal" size={22} color="#111" />
              </TouchableOpacity>
            </View>
          </View>

          {/* 保持原版的 flex row 布局 — 这个结构验证过是可用的 */}
          <View style={{ flex: 1, flexDirection: 'row' }}>

            {/* Session sidebar */}
            {showSessionList && (
              <View style={styles.sidebar}>
                <TouchableOpacity style={styles.newChatBtn} onPress={handleNewSession}>
                  <Ionicons name="add" size={18} color="#07C160" />
                  <Text style={styles.newChatText}>新对话</Text>
                </TouchableOpacity>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {sessions.map(renderSessionItem)}
                  {sessions.length === 0 && (
                    <Text style={styles.emptyText}>暂无对话</Text>
                  )}
                </ScrollView>
                <Text style={styles.sidebarHint}>长按删除对话</Text>
              </View>
            )}

            {/* Chat area */}
            <View style={{ flex: 1 }}>
              <ScrollView
                ref={flatListRef}
                style={{ flex: 1 }}
                contentContainerStyle={styles.messageList}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              >
                {messages.map((item) => {
                  const isUser = item.role === 'user';
                  if (isUser) {
                    return (
                      <View key={item.id} style={styles.msgRowRight}>
                        <TouchableOpacity
                          style={[styles.msgBubble, styles.msgUser]}
                          onLongPress={() => handleLongPress(item.content)}
                          activeOpacity={0.7}
                          delayLongPress={500}
                        >
                          <Text style={styles.msgText}>{item.content}</Text>
                        </TouchableOpacity>
                        <View style={styles.avatarMe}>
                          <Ionicons name="person" size={18} color="#fff" />
                        </View>
                      </View>
                    );
                  }
                  return (
                    <View key={item.id} style={styles.msgRow}>
                      <View style={styles.avatarAI}>
                        <Ionicons name="hardware-chip-outline" size={18} color="#fff" />
                      </View>
                      <TouchableOpacity
                        style={[styles.msgBubble, styles.msgAI]}
                        onLongPress={() => handleLongPress(item.content)}
                        activeOpacity={0.7}
                        delayLongPress={500}
                      >
                        <Text style={styles.msgText}>{item.content}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>

              {loading && statusText ? (
                <View style={styles.statusRow}>
                  <ActivityIndicator size="small" color="#07C160" style={{ marginRight: 6 }} />
                  <Text style={styles.statusText}>{statusText}</Text>
                </View>
              ) : null}

              {pendingAction && (
                <View style={styles.confirmBar}>
                  <Text style={styles.confirmHint}>需要确认操作</Text>
                  <View style={styles.confirmActions}>
                    <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => { setPendingAction(null); addMessage('assistant', '已取消。'); }}>
                      <Text style={styles.confirmCancelText}>取消</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.confirmOkBtn} onPress={handleConfirm}>
                      <Text style={styles.confirmOkText}>确认执行</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Input bar — 微信风格 */}
              <View style={styles.inputBar}>
                <TextInput
                  style={styles.textInput}
                  value={input}
                  onChangeText={setInput}
                  multiline
                  maxLength={500}
                  returnKeyType="send"
                  onSubmitEditing={() => handleSend()}
                  editable={!loading}
                />
                {input.trim() ? (
                  <TouchableOpacity
                    style={styles.sendBtn}
                    onPress={() => handleSend()}
                    disabled={loading}
                  >
                    <Text style={styles.sendBtnText}>发送</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.plusBtn} onPress={handleNewSession}>
                    <Ionicons name="add-circle" size={30} color="#444" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // ====== 悬浮气泡 ======
  bubble: { position: 'absolute', width: BUBBLE_SIZE, height: BUBBLE_SIZE, zIndex: 9999 },
  bubbleInner: {
    width: BUBBLE_SIZE, height: BUBBLE_SIZE, borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: '#07C160', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#07C160', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },

  // ====== 聊天容器 ======
  chatContainer: { flex: 1, backgroundColor: '#EDEDED' },

  // ====== 顶栏 — 微信风格（深灰底） ======
  chatHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 54 : 36, paddingBottom: 10, paddingHorizontal: 12,
    backgroundColor: '#EDEDED',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D5D5D5',
  },
  chatHeaderCenter: { flex: 1, alignItems: 'center' },
  chatTitle: { fontSize: 17, fontWeight: '600', color: '#111' },
  headerBtn: { padding: 6 },
  headerRight: { flexDirection: 'row', gap: 4 },

  // ====== Sidebar ======
  sidebar: {
    width: 200, backgroundColor: '#F7F7F7', borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#D5D5D5', paddingTop: 8, paddingHorizontal: 8,
  },
  newChatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 8, paddingVertical: 10, marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#E0E0E0',
  },
  newChatText: { color: '#07C160', fontSize: 14, fontWeight: '600' },
  sessionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8, marginBottom: 4,
  },
  sessionItemActive: { backgroundColor: '#E8E8E8' },
  sessionInfo: { flex: 1 },
  sessionTitle: { fontSize: 13, fontWeight: '500', color: '#333' },
  sessionPreview: { fontSize: 11, color: '#999', marginTop: 2 },
  emptyText: { textAlign: 'center', color: '#B2B2B2', marginTop: 30, fontSize: 13 },
  sidebarHint: { textAlign: 'center', color: '#B2B2B2', fontSize: 10, paddingBottom: 8, marginTop: 8 },

  // ====== 消息 ======
  messageList: { padding: 12, paddingBottom: 8 },
  msgRow: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-start' },
  msgRowRight: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-start', justifyContent: 'flex-end' },

  // ====== 头像 — 微信方角 ======
  avatarAI: {
    width: 40, height: 40, borderRadius: 4,
    backgroundColor: '#07C160',
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  avatarMe: {
    width: 40, height: 40, borderRadius: 4,
    backgroundColor: '#4A90E2',
    justifyContent: 'center', alignItems: 'center', marginLeft: 8, flexShrink: 0,
  },

  // ====== 气泡 — 微信风格 ======
  msgBubble: { maxWidth: '70%', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 4 },
  msgAI: { backgroundColor: '#fff', borderTopLeftRadius: 0 },
  msgUser: { backgroundColor: '#95EC69', borderTopRightRadius: 0, marginRight: 8 },
  msgText: { fontSize: 16, lineHeight: 22, color: '#111' },

  // ====== Streaming status ======
  statusRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 6, paddingHorizontal: 16,
  },
  statusText: { fontSize: 12, color: '#999' },

  // ====== 确认栏 ======
  confirmBar: {
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D5D5D5',
  },
  confirmHint: { fontSize: 13, color: '#999', marginBottom: 8, textAlign: 'center' },
  confirmActions: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  confirmCancelBtn: { paddingVertical: 8, paddingHorizontal: 24, borderRadius: 4, backgroundColor: '#F2F2F2' },
  confirmCancelText: { color: '#666', fontSize: 14, fontWeight: '500' },
  confirmOkBtn: { paddingVertical: 8, paddingHorizontal: 24, borderRadius: 4, backgroundColor: '#07C160' },
  confirmOkText: { color: '#fff', fontSize: 14, fontWeight: '500' },

  // ====== 输入栏 — 微信风格 ======
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 8, paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
    backgroundColor: '#F7F7F7',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D5D5D5',
  },
  textInput: {
    flex: 1, backgroundColor: '#fff',
    borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: '#D9D9D9',
    paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 16, maxHeight: 100, color: '#000', minHeight: 36,
  },
  sendBtn: {
    backgroundColor: '#07C160', borderRadius: 4,
    paddingHorizontal: 14, paddingVertical: 8,
    marginLeft: 8, justifyContent: 'center', alignItems: 'center', minHeight: 36,
  },
  sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  plusBtn: {
    marginLeft: 6, justifyContent: 'center', alignItems: 'center', height: 36,
  },
});
