import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  Platform,
  Alert,
  ScrollView,
  UIManager,
  Vibration,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, startOfWeek, endOfWeek, startOfMonth, getDaysInMonth, eachDayOfInterval, isSameDay, getDay } from 'date-fns';
import { useCheckIn } from '../context/CheckInContext';
import { DragSortableView } from 'react-native-drag-sort';
import { getDailyReport, getWeeklyReport } from '../services/aiService';

// 获取屏幕宽高
const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

// === 布局配置 ===
const CONTAINER_PADDING = 32; 
const COLUMN_GAP = 12;

// 卡片宽高
const CARD_WIDTH = (SCREEN_WIDTH - CONTAINER_PADDING - COLUMN_GAP) / 2;
const CARD_HEIGHT = 160; 

// 逻辑父宽度
const LOGICAL_PARENT_WIDTH = SCREEN_WIDTH - CONTAINER_PADDING + COLUMN_GAP;

const DASHBOARD_STORAGE_KEY = 'user_stats_dashboard_ids';

// 开启 LayoutAnimation
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ==========================================
// 1. 迷你可视化组件 (逻辑保持不变)
// ==========================================
const parseGoalConfig = (goal) => {
  try {
    return goal.repeat_config ? (typeof goal.repeat_config === 'string' ? JSON.parse(goal.repeat_config) : goal.repeat_config) : {};
  } catch (e) { return {}; }
};

const MiniProgressCard = ({ goal, checkIns }) => {
  const config = parseGoalConfig(goal);
  const target = config.count || 1;
  const type = goal.repeat_type;
  
  let currentCount = 0;
  let label = '';
  let dateKey = ''; 

  const now = new Date();

  if (type === 'weekly') {
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end });
    const dayStrs = days.map(d => format(d, 'yyyy-MM-dd'));
    currentCount = checkIns.filter(c => {
        const d = typeof c.checkin_date === 'string' ? c.checkin_date.split(' ')[0] : format(new Date(c.checkin_date), 'yyyy-MM-dd');
        return dayStrs.includes(d);
    }).length;
    label = '本周';
  } else if (type === 'monthly') {
    dateKey = format(now, 'yyyy-MM');
    currentCount = checkIns.filter(c => {
        const d = typeof c.checkin_date === 'string' ? c.checkin_date : format(new Date(c.checkin_date), 'yyyy-MM-dd');
        return d.startsWith(dateKey);
    }).length;
    label = '本月';
  } else if (type === 'yearly') {
    dateKey = format(now, 'yyyy');
    currentCount = checkIns.filter(c => {
        const d = typeof c.checkin_date === 'string' ? c.checkin_date : format(new Date(c.checkin_date), 'yyyy-MM-dd');
        return d.startsWith(dateKey);
    }).length;
    label = '今年';
  }

  const percent = Math.min(1, currentCount / target);
  const isDone = currentCount >= target;

  return (
    <View style={styles.miniVizContainer}>
      <View style={styles.progressRow}>
        <Text style={styles.progressBigNum}>{currentCount}</Text>
        <Text style={styles.progressSmallNum}>/{target}</Text>
      </View>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${percent * 100}%`, backgroundColor: isDone ? '#34C759' : '#007AFF' }]} />
      </View>
      <Text style={styles.miniLabel}>{label}进度</Text>
    </View>
  );
};

const MiniCalendarCard = ({ goal, checkIns }) => {
  const now = new Date();
  const daysInMonth = getDaysInMonth(now);
  const offset = getDay(startOfMonth(now)) === 0 ? 6 : getDay(startOfMonth(now)) - 1; 
  
  const totalSlots = 35; 
  const grid = Array(totalSlots).fill(null).map((_, i) => {
    const dayNum = i - offset + 1;
    if (dayNum > 0 && dayNum <= daysInMonth) {
      return new Date(now.getFullYear(), now.getMonth(), dayNum);
    }
    return null;
  });

  const checkInMap = {};
  checkIns.forEach(c => {
      const d = typeof c.checkin_date === 'string' ? c.checkin_date.split(' ')[0] : format(new Date(c.checkin_date), 'yyyy-MM-dd');
      checkInMap[d] = true;
  });

  return (
    <View style={styles.miniVizContainer}>
      <View style={styles.miniGrid}>
        {grid.map((date, index) => {
          if (!date) return <View key={index} style={styles.miniDotEmpty} />;
          const dateStr = format(date, 'yyyy-MM-dd');
          const isChecked = checkInMap[dateStr];
          const isToday = isSameDay(date, now);
          
          return (
            <View 
              key={index} 
              style={[
                styles.miniDot, 
                isChecked && styles.miniDotChecked,
                !isChecked && isToday && styles.miniDotToday
              ]} 
            />
          );
        })}
      </View>
      <Text style={styles.miniLabel}>{format(now, 'M月')}打卡概览</Text>
    </View>
  );
};

// --- 卡片组件 ---
const StatCard = ({ goal, checkIns, isDragging }) => {
  const config = parseGoalConfig(goal);
  const isCountMode = config.mode === 'count';

  return (
    <View style={[
      styles.card,
      // 拖拽时给卡片加一个明显的样式，让用户知道他在拖
      isDragging && styles.cardDragging
    ]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>{goal.name}</Text>
      </View>

      <View style={styles.cardBody}>
        {isCountMode ? (
          <MiniProgressCard goal={goal} checkIns={checkIns} />
        ) : (
          <MiniCalendarCard goal={goal} checkIns={checkIns} />
        )}
      </View>
    </View>
  );
};

// ==========================================
// 2. 选择器弹窗
// ==========================================
const GoalSelectorModal = ({ visible, onClose, allGoals, selectedIds, onSave }) => {
  const [tempIds, setTempIds] = useState([]);

  useEffect(() => {
    if (visible) setTempIds(selectedIds);
  }, [visible, selectedIds]);

  const toggleSelection = (id) => {
    setTempIds(prev => {
      if (prev.includes(id)) return prev.filter(tid => tid !== id);
      return [...prev, id];
    });
  };

  const handleSave = () => {
    onSave(tempIds);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}><Text style={styles.modalCancel}>取消</Text></TouchableOpacity>
          <Text style={styles.modalTitle}>选择展示任务</Text>
          <TouchableOpacity onPress={handleSave}><Text style={styles.modalConfirm}>完成</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.modalList}>
          {allGoals.map(goal => {
            const isSelected = tempIds.includes(String(goal.id));
            return (
              <TouchableOpacity key={goal.id} style={styles.selectRow} onPress={() => toggleSelection(String(goal.id))}>
                <Text style={styles.selectLabel}>{goal.name}</Text>
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          })}
          {allGoals.length === 0 && <Text style={{textAlign:'center', marginTop: 20, color:'#999'}}>暂无任务，请先去首页添加</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
};

// ==========================================
// 3. 主页面
// ==========================================
export default function StatsScreen() {
  const { goals, checkIns, refreshData } = useCheckIn();
  const [selectedGoalIds, setSelectedGoalIds] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  const [reportVisible, setReportVisible] = useState(false);
  const [reportContent, setReportContent] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [reportLoading, setReportLoading] = useState(false);

  const fetchReport = async (type) => {
    setReportTitle(type === 'daily' ? '今日报告' : '本周周报');
    setReportContent('');
    setReportVisible(true);
    setReportLoading(true);
    try {
      const data = type === 'daily' ? await getDailyReport() : await getWeeklyReport();
      setReportContent(data.report || '暂无数据');
    } catch (e) {
      setReportContent('报告生成失败，请稍后再试。');
    } finally {
      setReportLoading(false);
    }
  };

  // 拖拽相关状态
  const [isDragging, setIsDragging] = useState(false);
  // 【已删除】isOverTrash 状态
  const draggedItemRef = useRef(null);

  useFocusEffect(useCallback(() => {
    refreshData();
    const loadDashboard = async () => {
      try {
        const json = await AsyncStorage.getItem(DASHBOARD_STORAGE_KEY);
        if (json) setSelectedGoalIds(JSON.parse(json));
      } catch (e) { console.log(e); } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, []));

  const handleSaveDashboard = async (newIds) => {
    setSelectedGoalIds(newIds);
    try {
      await AsyncStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(newIds));
    } catch (e) {}
  };

  const dashboardGoals = useMemo(() => {
    const list = [];
    selectedGoalIds.forEach(id => {
      const goal = goals.find(g => String(g.id) === String(id));
      if (goal) list.push(goal);
    });
    return list;
  }, [goals, selectedGoalIds]);

  // --- 拖拽处理 ---
  const onDragStart = (startIndex) => {
    setIsDragging(true);
    draggedItemRef.current = dashboardGoals[startIndex];
    Vibration.vibrate(50);
  };

  // 【已修改】不再需要计算垃圾桶位置
  const onDragging = (gestureState) => {
    // 纯排序无需处理
  };

  // 【已修改】移除所有关于删除的逻辑
  const onDragEnd = () => {
    setIsDragging(false);
    draggedItemRef.current = null;
  };

  const onDataChange = (newData) => {
    // 【已修改】直接保存排序结果，无需判断是否在垃圾桶
    const newIds = newData.map(g => String(g.id));
    handleSaveDashboard(newIds);
  };

  const renderItem = (item, index) => {
    const goalCheckIns = checkIns.filter(c => String(c.goal_id || c.goalId) === String(item.id));
    const isActive = draggedItemRef.current && String(draggedItemRef.current.id) === String(item.id);
    
    return (
        <StatCard 
            goal={item} 
            checkIns={goalCheckIns} 
            isDragging={isActive && isDragging} 
        />
    );
  };

  if (loading) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      
      <View style={styles.navBar}>
        <View style={styles.reportBtns}>
          <TouchableOpacity style={styles.reportBtn} onPress={() => fetchReport('daily')}>
            <Ionicons name="today-outline" size={16} color="#007AFF" />
            <Text style={styles.reportBtnText}>今日报告</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reportBtn} onPress={() => fetchReport('weekly')}>
            <Ionicons name="calendar-outline" size={16} color="#007AFF" />
            <Text style={styles.reportBtnText}>周报</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => setModalVisible(true)}
        >
           <Ionicons name="add" size={30} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {dashboardGoals.length > 0 ? (
          <ScrollView 
            showsVerticalScrollIndicator={false} 
            scrollEnabled={!isDragging} 
            // 【已修改】不再需要巨大的底部空间，改回正常 padding
            contentContainerStyle={{ paddingBottom: 40 }} 
          >
             <View style={{ flex: 1, minHeight: SCREEN_HEIGHT, overflow: 'visible' }}>
                 <DragSortableView
                   dataSource={dashboardGoals}
                   parentWidth={LOGICAL_PARENT_WIDTH} 
                   childrenWidth={CARD_WIDTH}
                   childrenHeight={CARD_HEIGHT}
                   marginChildrenRight={COLUMN_GAP}
                   marginChildrenBottom={COLUMN_GAP}
                   marginChildrenLeft={0}
                   marginChildrenTop={0}
                   
                   onDragStart={onDragStart}
                   onDragging={onDragging}
                   onDragEnd={onDragEnd} 
                   onDataChange={onDataChange} 
                   
                   keyExtractor={(item) => String(item.id)}
                   renderItem={renderItem}
                   
                   delayLongPress={200}
                   scaleStatus={'scale'}
                   sortable={true}
                 />
             </View>
          </ScrollView>
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBg}>
              <Ionicons name="pie-chart" size={48} color="#ccc" />
            </View>
            <Text style={styles.emptyText}>暂无展示数据</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setModalVisible(true)}>
              <Text style={styles.emptyBtnText}>添加统计卡片</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 【已删除】整个垃圾桶 View 被移除了 */}

      {/* AI 报告弹窗 */}
      <Modal visible={reportVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setReportVisible(false)}>
        <View style={styles.reportModal}>
          <View style={styles.reportHeader}>
            <TouchableOpacity onPress={() => setReportVisible(false)}>
              <Ionicons name="close" size={24} color="#8E8E93" />
            </TouchableOpacity>
            <Text style={styles.reportModalTitle}>{reportTitle}</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView style={styles.reportBody} contentContainerStyle={{ paddingBottom: 40 }}>
            {reportLoading ? (
              <View style={{ alignItems: 'center', paddingTop: 60 }}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={{ color: '#999', marginTop: 12 }}>AI 正在分析你的数据...</Text>
              </View>
            ) : (
              <Text style={styles.reportText}>{reportContent}</Text>
            )}
          </ScrollView>
        </View>
      </Modal>

      <GoalSelectorModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        allGoals={goals}
        selectedIds={selectedGoalIds}
        onSave={handleSaveDashboard}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  
  // === 导航栏 ===
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 20,
    backgroundColor: '#fff', 
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 5,
    zIndex: 10,
    marginBottom: 10, 
  },
  navTitleContainer: { flex: 1, justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 4 },
  navTitle: { fontSize: 28, fontWeight: '700', color: '#000' },
  navBtn: { padding: 4, justifyContent: 'center', alignItems: 'center' },

  // Content
  content: { flex: 1, paddingHorizontal: 16 },

  // Card
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT - COLUMN_GAP, 
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 2,
    justifyContent: 'space-between',
  },
  // 拖拽中的卡片样式（高亮/浮起）
  cardDragging: {
    transform: [{ scale: 1.05 }],
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
    borderColor: '#007AFF',
    borderWidth: 1,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  cardBody: { alignItems: 'center', justifyContent: 'center', flex: 1 },

  // Mini Visualization
  miniVizContainer: { width: '100%', alignItems: 'center' },
  
  // Progress Style
  progressRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 },
  progressBigNum: { fontSize: 24, fontWeight: '700', color: '#333' },
  progressSmallNum: { fontSize: 14, color: '#8E8E93', marginLeft: 2 },
  progressBarBg: { width: '100%', height: 6, backgroundColor: '#F2F2F7', borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  progressBarFill: { height: '100%', borderRadius: 3 },
  
  // Grid Style
  miniGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', justifyContent: 'center', gap: 4 },
  miniDot: { width: 8, height: 8, borderRadius: 2, backgroundColor: '#F2F2F7', margin: 2 },
  miniDotEmpty: { width: 8, height: 8, margin: 2 },
  miniDotChecked: { backgroundColor: '#34C759' },
  miniDotToday: { borderWidth: 1, borderColor: '#007AFF', backgroundColor: '#fff' },
  miniLabel: { fontSize: 10, color: '#C7C7CC', marginTop: 4 },

  // Empty State
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: -50 },
  emptyIconBg: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#E5E5EA', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyText: { fontSize: 16, color: '#8E8E93', marginBottom: 20 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#007AFF', borderRadius: 20 },
  emptyBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // 【已删除】Trash Bin 相关样式全部移除

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#F2F2F7' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc' },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  modalCancel: { fontSize: 16, color: '#8E8E93' },
  modalConfirm: { fontSize: 16, color: '#007AFF', fontWeight: '600' },
  modalList: { padding: 16 },
  selectRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', marginBottom: 10, borderRadius: 12 },
  selectLabel: { fontSize: 16, color: '#333' },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#E5E5EA', justifyContent: 'center', alignItems: 'center' },
  checkboxSelected: { backgroundColor: '#007AFF', borderColor: '#007AFF' },

  // Report buttons
  reportBtns: { flexDirection: 'row', gap: 8 },
  reportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F2F2F7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
  },
  reportBtnText: { fontSize: 13, color: '#007AFF', fontWeight: '500' },

  // Report modal
  reportModal: { flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'ios' ? 56 : 40 },
  reportHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA',
  },
  reportModalTitle: { fontSize: 17, fontWeight: '600', color: '#000' },
  reportBody: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  reportText: { fontSize: 16, lineHeight: 26, color: '#333' },
});